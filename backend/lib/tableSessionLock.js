export class TableSessionConflict extends Error {
  constructor(message, code) {
    super(message);
    this.name = "TableSessionConflict";
    this.code = code;
  }
}

// Call only inside the same transaction as the order/session mutation.
// Different tables remain independent; two phones on one table serialize.
export async function lockRestaurantTable(client, restaurantId, tableId, { requireActive = false } = {}) {
  const rows = await client.$queryRaw`SELECT "id", "isActive" FROM "Table" WHERE "id" = ${tableId} AND "restaurantId" = ${restaurantId} FOR UPDATE`;
  if (!rows.length || (requireActive && !rows[0].isActive)) {
    throw new TableSessionConflict("Questo tavolo non è più disponibile. Chiedi allo staff.", "TABLE_NOT_AVAILABLE");
  }
}

export async function getOrOpenTableSession(client, { restaurantId, tableId, guestName = null, notes = null }) {
  const sessions = await client.tableSession.findMany({
    where: { restaurantId, tableId, status: { in: ["open", "closing"] } },
    orderBy: { openedAt: "desc" },
    take: 2,
  });
  if (sessions.length > 1) {
    throw new TableSessionConflict(
      "Il tavolo ha più sessioni aperte da verificare. Chiedi allo staff di completare i conti prima di un nuovo ordine.",
      "TABLE_SESSION_CONFLICT"
    );
  }
  if (sessions[0]?.status === "closing") {
    throw new TableSessionConflict(
      "Il conto di questo tavolo è già in preparazione. Per aggiungere qualcosa chiedi al cameriere.",
      "TABLE_BILL_IN_PROGRESS"
    );
  }
  return sessions[0] || client.tableSession.create({
    data: { restaurantId, tableId, status: "open", guestName, notes },
  });
}
