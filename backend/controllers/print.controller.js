import crypto from "node:crypto";
import prisma from "../lib/prisma.js";
import { writeAudit } from "../lib/audit.js";
import { safeEmit } from "../lib/socketSafe.js";

const VALID_AREAS = new Set(["kitchen", "bar"]);
const STALE_CLAIM_MS = 2 * 60 * 1000;

function areaForRequest(req) {
  const requested = String(req.query?.area || req.body?.area || "").trim().toLowerCase();
  if (req.user?.role === "kitchen") return "kitchen";
  if (req.user?.role === "bar") return "bar";
  return VALID_AREAS.has(requested) ? requested : null;
}

function canAccessArea(req, area) {
  if (["owner", "admin"].includes(req.user?.role)) return true;
  return req.user?.role === area;
}

function printJobInclude(area) {
  return {
    order: {
      select: {
        id: true,
        orderNumber: true,
        notes: true,
        createdAt: true,
        updatedAt: true,
        table: { select: { id: true, name: true, code: true } },
        items: {
          where: {
            status: "active",
            preparationArea: area,
          },
          select: {
            id: true,
            quantity: true,
            nameSnapshot: true,
            categorySnapshot: true,
            notes: true,
            preparationArea: true,
            preparationStatus: true,
            courseNumber: true,
          },
        },
      },
    },
  };
}

async function findAccessibleJob(req, id) {
  const job = await prisma.printJob.findFirst({
    where: { id, restaurantId: req.user.restaurantId },
  });
  if (!job) return null;
  if (!canAccessArea(req, job.area)) return "FORBIDDEN";
  return job;
}

function emitPrintUpdate(req, job, reason) {
  safeEmit(
    req.app.get("io"),
    `restaurant:${job.restaurantId}`,
    "print-job-updated",
    { printJobId: job.id, orderId: job.orderId, area: job.area, status: job.status, reason }
  );
}

export async function listPrintJobs(req, res) {
  try {
    const area = areaForRequest(req);
    if (!area) return res.status(400).json({ message: "Indica cucina o bar" });
    if (!canAccessArea(req, area)) return res.status(403).json({ message: "Reparto non autorizzato" });

    const staleBefore = new Date(Date.now() - STALE_CLAIM_MS);
    await prisma.printJob.updateMany({
      where: {
        restaurantId: req.user.restaurantId,
        area,
        status: "processing",
        claimedAt: { lt: staleBefore },
      },
      data: { status: "pending", claimedAt: null, claimedByUserId: null },
    });

    const limit = Math.min(30, Math.max(1, Number(req.query.limit || 12)));
    const jobs = await prisma.printJob.findMany({
      where: {
        restaurantId: req.user.restaurantId,
        area,
        status: { in: ["pending", "failed"] },
        attempts: { lt: 5 },
      },
      include: printJobInclude(area),
      orderBy: { createdAt: "asc" },
      take: limit,
    });

    return res.json({ area, jobs });
  } catch (error) {
    console.error("listPrintJobs error:", error);
    return res.status(500).json({ message: "Coda di stampa non disponibile" });
  }
}

export async function claimPrintJob(req, res) {
  try {
    const job = await findAccessibleJob(req, req.params.id);
    if (!job) return res.status(404).json({ message: "Stampa non trovata" });
    if (job === "FORBIDDEN") return res.status(403).json({ message: "Reparto non autorizzato" });
    if (job.status === "printed") return res.json({ job, alreadyPrinted: true });

    const updatedCount = await prisma.printJob.updateMany({
      where: {
        id: job.id,
        restaurantId: req.user.restaurantId,
        status: { in: ["pending", "failed"] },
      },
      data: {
        status: "processing",
        claimedAt: new Date(),
        claimedByUserId: req.user.userId || null,
        attempts: { increment: 1 },
        lastError: null,
      },
    });
    if (updatedCount.count !== 1) {
      return res.status(409).json({ message: "Stampa già presa in carico da un altro dispositivo" });
    }

    const claimed = await prisma.printJob.findUnique({
      where: { id: job.id },
      include: printJobInclude(job.area),
    });
    emitPrintUpdate(req, claimed, "claimed");
    return res.json({ job: claimed });
  } catch (error) {
    console.error("claimPrintJob error:", error);
    return res.status(500).json({ message: "Impossibile prendere in carico la stampa" });
  }
}

export async function completePrintJob(req, res) {
  try {
    const job = await findAccessibleJob(req, req.params.id);
    if (!job) return res.status(404).json({ message: "Stampa non trovata" });
    if (job === "FORBIDDEN") return res.status(403).json({ message: "Reparto non autorizzato" });

    const updated = await prisma.$transaction(async (tx) => {
      const result = await tx.printJob.update({
        where: { id: job.id },
        data: { status: "printed", printedAt: new Date(), lastError: null },
      });
      await writeAudit(tx, req, {
        action: "print.completed",
        entityType: "order",
        entityId: job.orderId,
        metadata: { area: job.area, printJobId: job.id, attempts: result.attempts },
      });
      return result;
    });
    emitPrintUpdate(req, updated, "completed");
    return res.json({ message: "Comanda stampata", job: updated });
  } catch (error) {
    console.error("completePrintJob error:", error);
    return res.status(500).json({ message: "Impossibile confermare la stampa" });
  }
}

export async function failPrintJob(req, res) {
  try {
    const job = await findAccessibleJob(req, req.params.id);
    if (!job) return res.status(404).json({ message: "Stampa non trovata" });
    if (job === "FORBIDDEN") return res.status(403).json({ message: "Reparto non autorizzato" });

    const lastError = String(req.body?.message || "Stampante non disponibile").slice(0, 300);
    const updated = await prisma.printJob.update({
      where: { id: job.id },
      data: {
        status: job.attempts >= 4 ? "failed" : "pending",
        claimedAt: null,
        claimedByUserId: null,
        lastError,
      },
    });
    emitPrintUpdate(req, updated, "failed");
    return res.json({ message: "Stampa rimessa in coda", job: updated });
  } catch (error) {
    console.error("failPrintJob error:", error);
    return res.status(500).json({ message: "Impossibile aggiornare la stampa" });
  }
}

export async function reprintOrder(req, res) {
  try {
    const area = areaForRequest(req);
    if (!area) return res.status(400).json({ message: "Indica cucina o bar" });
    if (!canAccessArea(req, area)) return res.status(403).json({ message: "Reparto non autorizzato" });

    const order = await prisma.order.findFirst({
      where: { id: req.params.orderId, restaurantId: req.user.restaurantId },
      include: {
        items: {
          where: { status: "active", preparationArea: area },
          select: { id: true },
        },
      },
    });
    if (!order) return res.status(404).json({ message: "Ordine non trovato" });
    if (!order.items.length) return res.status(400).json({ message: "Nessun articolo per questo reparto" });

    const existingPending = await prisma.printJob.findFirst({
      where: {
        restaurantId: order.restaurantId,
        orderId: order.id,
        area,
        status: { in: ["pending", "failed"] },
      },
      orderBy: { createdAt: "asc" },
    });
    if (existingPending) {
      return res.json({ message: "Comanda già presente nella coda", job: existingPending, existing: true });
    }

    const job = await prisma.$transaction(async (tx) => {
      const created = await tx.printJob.create({
        data: {
          restaurantId: order.restaurantId,
          orderId: order.id,
          area,
          kind: "reprint",
          eventKey: `${order.id}:${area}:reprint:${crypto.randomUUID()}`,
        },
      });
      await writeAudit(tx, req, {
        action: "print.reprint_requested",
        entityType: "order",
        entityId: order.id,
        metadata: { area, printJobId: created.id },
      });
      return created;
    });
    safeEmit(req.app.get("io"), `restaurant:${job.restaurantId}`, "print-job", {
      printJobId: job.id,
      orderId: job.orderId,
      area: job.area,
      kind: job.kind,
    });
    return res.status(201).json({ message: "Ristampa aggiunta alla coda", job });
  } catch (error) {
    console.error("reprintOrder error:", error);
    return res.status(500).json({ message: "Impossibile creare la ristampa" });
  }
}
