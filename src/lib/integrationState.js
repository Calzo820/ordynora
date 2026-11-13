export function isSelectedIntegrationActive(current, selected) {
  if (!current || !selected) return false;
  return current.provider === selected.id && current.status !== "disabled";
}

export function integrationJobLabel(job) {
  if (job?.responseMeta?.action === "superseded") return "Aggiornamento sostituito da una revisione più recente";
  if (job?.responseMeta?.action === "cancelled_before_export") return "Annullato prima dell'invio";
  return {
    pending: "In coda", processing: "Invio in corso", retrying: "Riprova automatica",
    succeeded: "Sincronizzato", failed: "Non riuscito", blocked: "Richiede intervento",
  }[job?.status] || "Stato da verificare";
}
