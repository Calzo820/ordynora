import { useEffect, useMemo, useRef, useState } from "react";
import Navbar from "../components/Navbar";
import HighVolumeServiceBoard from "../components/ops/HighVolumeServiceBoard";
import { glowPageStyle } from "../styles/pageStyles";
import { API_URL, getAuthHeaders } from "../lib/api";
import { createRestaurantSocket, playOrderSound } from "../lib/realtime";
import useStationPrinter from "../hooks/useStationPrinter";

function isBevanda(preparationArea) {
  return (preparationArea || "").toLowerCase().trim() === "bar";
}

function differenzaMinuti(timestamp) {
  if (!timestamp) return 0;
  return Math.max(0, Math.floor((Date.now() - new Date(timestamp).getTime()) / 60000));
}

function getItemCourse(item) {
  const structured = Number(item?.courseNumber || 0);
  if (structured >= 1 && structured <= 4) return structured;
  const note = (item?.notes || "").toLowerCase().trim();
  return note.includes("dopo") ? 2 : 1;
}

function getPiattiCucina(ordine) {
  return (ordine?.items || []).filter((p) => !isBevanda(p.preparationArea));
}

function getPrioritaOrdine(ordine) {
  const minuti = differenzaMinuti(ordine.createdAt);
  if (ordine.status === "pending" && minuti >= 8) return 5;
  if (ordine.status === "in_progress" && minuti >= 18) return 4;
  if (ordine.status === "pending") return 3;
  if (ordine.status === "in_progress") return 2;
  if (ordine.status === "ready") return 1;
  return 0;
}

function getPrioritaOrdineLabel(ordine) {
  const minuti = differenzaMinuti(ordine.createdAt);
  if (ordine.status === "pending" && minuti >= 8) return "Urgente";
  if (ordine.status === "pending") return "Nuovo";
  if (ordine.status === "in_progress" && minuti >= 18) return "Attenzione";
  if (ordine.status === "in_progress") return "In corso";
  if (ordine.status === "ready") return "Pronto";
  return "Attivo";
}

function quantitaTotale(lista) {
  return (lista || []).reduce((acc, item) => acc + Number(item.quantity || item.qty || 0), 0);
}

export default function Cucina() {
  const [ordini, setOrdini] = useState([]);
  const [errore, setErrore] = useState("");
  const [loading, setLoading] = useState(true);
  const [updatingIds, setUpdatingIds] = useState([]);
  const audioAbilitato = useRef(false);
  const ultimoConteggioCucinaRef = useRef(0);
  const printer = useStationPrinter("kitchen");

  useEffect(() => {
    const abilitaAudio = () => {
      audioAbilitato.current = true;
      window.removeEventListener("click", abilitaAudio);
    };

    window.addEventListener("click", abilitaAudio);
    return () => window.removeEventListener("click", abilitaAudio);
  }, []);

  async function syncOrdini() {
    try {
      const response = await fetch(`${API_URL}/orders/kitchen/list?area=kitchen`, {
        headers: getAuthHeaders(),
      });

      const data = await response.json();
      if (!response.ok) throw new Error(data.message || "Errore nel caricamento ordini cucina");

      const lista = Array.isArray(data) ? data : [];
      setOrdini(lista);

      const totalePiattiCucina = lista.reduce((acc, ordine) => acc + getPiattiCucina(ordine).length, 0);
      if (
        audioAbilitato.current &&
        ultimoConteggioCucinaRef.current > 0 &&
        totalePiattiCucina > ultimoConteggioCucinaRef.current
      ) {
        const audio = new Audio("https://actions.google.com/sounds/v1/alarms/beep_short.ogg");
        audio.play().catch(() => {});
      }

      ultimoConteggioCucinaRef.current = totalePiattiCucina;
      setErrore("");
    } catch (error) {
      setErrore(error.message || "Errore nel caricamento cucina");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    syncOrdini();
    const timer = setInterval(syncOrdini, 30000);
    const socket = createRestaurantSocket();

    const refreshLive = async () => {
      if (audioAbilitato.current) playOrderSound();
      await syncOrdini();
    };

    socket.on("new-order", refreshLive);
    socket.on("order-updated", refreshLive);
    socket.on("order-closed", refreshLive);

    return () => {
      clearInterval(timer);
      socket.disconnect();
    };
  }, []);

  async function cambiaStatoOrdine(orderId, nuovoStato) {
    try {
      setUpdatingIds((prev) => [...prev, orderId]);
      const response = await fetch(`${API_URL}/orders/${orderId}/status`, {
        method: "PATCH",
        headers: getAuthHeaders(),
        body: JSON.stringify({ status: nuovoStato, area: "kitchen" }),
      });

      const data = await response.json();
      if (!response.ok) throw new Error(data.message || "Errore aggiornamento stato");

      setOrdini((prev) => prev.map((ordine) => (ordine.id === orderId ? data.order : ordine)));
    } catch (error) {
      setErrore(error.message || "Errore aggiornamento stato");
    } finally {
      setUpdatingIds((prev) => prev.filter((id) => id !== orderId));
    }
  }

  function cambiaStato(orderId, statoCorrente) {
    if (statoCorrente === "pending") cambiaStatoOrdine(orderId, "in_progress");
    if (statoCorrente === "in_progress") cambiaStatoOrdine(orderId, "ready");
  }

  function riportaIndietro(orderId, statoCorrente) {
    if (statoCorrente === "ready") cambiaStatoOrdine(orderId, "in_progress");
    if (statoCorrente === "in_progress") cambiaStatoOrdine(orderId, "pending");
  }

  const ordiniCucina = useMemo(() => {
    return ordini
      .map((ordine) => {
        const piattiCucina = getPiattiCucina(ordine)
          .map((p, indexOriginale) => ({
            ...p,
            indexOriginale,
            nome: p.nameSnapshot,
            qty: p.quantity,
            stato: ordine.status,
            courseNumber: getItemCourse(p),
            servizio: getItemCourse(p) > 1 ? "dopo" : "subito",
            categoria: p.categorySnapshot || "Cucina",
            nota: p.notes || "",
          }))
          .sort((a, b) => {
            const byServizio = a.courseNumber - b.courseNumber;
            if (byServizio !== 0) return byServizio;
            return String(a.nome || "").localeCompare(String(b.nome || ""), "it", { numeric: true });
          });

        const timerMinuti = differenzaMinuti(ordine.createdAt);
        const priorita = getPrioritaOrdine(ordine);

        return {
          ...ordine,
          tavolo: ordine.table?.code || ordine.table?.name || "-",
          tavoloNome: ordine.table?.name || "Tavolo",
          piattiCucina,
          timerMinuti,
          priorita,
          prioritaLabel: getPrioritaOrdineLabel(ordine),
          totaleArticoli: quantitaTotale(piattiCucina),
        };
      })
      .filter((ordine) => ordine.piattiCucina.length > 0)
      .sort((a, b) => {
        if (b.priorita !== a.priorita) return b.priorita - a.priorita;
        if (b.timerMinuti !== a.timerMinuti) return b.timerMinuti - a.timerMinuti;
        return String(a.tavolo).localeCompare(String(b.tavolo), "it", { numeric: true });
      });
  }, [ordini]);

  const piattiTotali = ordiniCucina.reduce((acc, o) => acc + o.totaleArticoli, 0);
  const nuoviCount = ordiniCucina.filter((o) => o.status === "pending").length;
  const preparazioneCount = ordiniCucina.filter((o) => o.status === "in_progress").length;
  const prontiCount = ordiniCucina.filter((o) => o.status === "ready").length;
  const urgentiCount = ordiniCucina.filter((o) => o.prioritaLabel === "Urgente").length;

  return (
    <div style={glowPageStyle}>
      <Navbar />
      <div className="operator-workspace">
        <HighVolumeServiceBoard
          title="Cucina"
          station="kitchen"
          loading={loading}
          error={errore}
          orders={ordiniCucina}
          itemsKey="piattiCucina"
          totalItems={piattiTotali}
          newCount={nuoviCount}
          inProgressCount={preparazioneCount}
          readyCount={prontiCount}
          urgentCount={urgentiCount}
          warnAfter={10}
          lateAfter={18}
          updatingIds={updatingIds}
          onRefresh={syncOrdini}
          onNext={cambiaStato}
          onBack={riportaIndietro}
          onPrint={printer.printOrder}
          autoPrint={printer.autoPrint}
          onToggleAutoPrint={printer.setAutoPrint}
          pendingPrintJobs={printer.pendingJobs}
          printMode={printer.printMode}
          printerStatus={printer.status}
          readyLabel="Pronto"
        />
      </div>
    </div>
  );
}
