const GUIDES = {
  owner: {
    eyebrow: "Guida titolare",
    title: "Ordynora in tre passaggi",
    intro: "Configura una volta il locale, poi durante il servizio usa solo Sala, Cucina e Cassa.",
    steps: [
      { title: "Prepara il locale", text: "Inserisci menu e tavoli, poi stampa i QR.", to: "/onboarding" },
      { title: "Avvia il servizio", text: "Controlla tavoli e comande dalla Sala.", to: "/tavoli" },
      { title: "Controlla i risultati", text: "Dashboard e statistiche raccolgono tutto automaticamente.", to: "/dashboard" },
    ],
  },
  admin: {
    eyebrow: "Guida responsabile",
    title: "Gestisci il turno senza cercare le funzioni",
    intro: "Le attività quotidiane sono separate dalla configurazione del ristorante.",
    steps: [
      { title: "Configura", text: "Menu, tavoli e accessi staff sono nella Gestione.", to: "/admin?tab=menu" },
      { title: "Segui il servizio", text: "Sala, Cucina, Bar e Cassa mostrano solo azioni operative.", to: "/tavoli" },
      { title: "Verifica", text: "Controlla alert e andamento dalla Dashboard.", to: "/dashboard" },
    ],
  },
  waiter: {
    eyebrow: "Guida sala",
    title: "Il tuo turno in tre gesti",
    intro: "Non devi entrare nelle impostazioni: tutto il lavoro è nella schermata Sala.",
    steps: [
      { title: "Scegli il tavolo", text: "Tocca il tavolo dalla mappa per vedere stato e comanda.", to: "/tavoli" },
      { title: "Gestisci le portate", text: "Invia la portata successiva solo quando la sala è pronta.", to: "/tavoli" },
      { title: "Conferma la consegna", text: "Quando tutto è pronto, premi Consegnato al tavolo.", to: "/tavoli" },
    ],
  },
  kitchen: {
    eyebrow: "Guida cucina",
    title: "Guarda la prima comanda e agisci",
    intro: "Le comande entrano da sinistra e avanzano con un solo pulsante.",
    steps: [
      { title: "Nuovi", text: "Premi Inizia preparazione quando prendi in carico la comanda.", to: "/cucina" },
      { title: "In preparazione", text: "Leggi quantità, portata e note direttamente sulla scheda.", to: "/cucina" },
      { title: "Pronti", text: "Premi Segna pronto per avvisare la sala.", to: "/cucina" },
    ],
  },
  bar: {
    eyebrow: "Guida bar",
    title: "Le bevande scorrono in tre colonne",
    intro: "Gestisci solo le righe del bar, senza vedere le attività della cucina.",
    steps: [
      { title: "Nuovi", text: "Premi Inizia preparazione quando inizi la comanda.", to: "/bar" },
      { title: "In preparazione", text: "Controlla quantità e note prima di completare.", to: "/bar" },
      { title: "Pronti", text: "Premi Segna pronto per avvisare la sala.", to: "/bar" },
    ],
  },
  cashier: {
    eyebrow: "Guida cassa",
    title: "Chiudi un conto senza perdere passaggi",
    intro: "La schermata Cassa ti accompagna dalla scelta del tavolo alla chiusura.",
    steps: [
      { title: "Scegli il tavolo", text: "Usa priorità o ricerca per trovare subito il conto.", to: "/cassa" },
      { title: "Controlla", text: "Verifica articoli, coperti, sconti e divisioni.", to: "/cassa" },
      { title: "Incassa e chiudi", text: "Registra il pagamento e chiudi il tavolo.", to: "/cassa" },
    ],
  },
};

export function getQuickGuide(role) {
  return GUIDES[role] || GUIDES.owner;
}

export function quickGuideStorageKey(role) {
  return `ordynora_quick_guide_v1_${role || "owner"}`;
}
