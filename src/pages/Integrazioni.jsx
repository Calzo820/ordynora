import { useMemo, useState } from "react";
import Navbar from "../components/Navbar.jsx";

const integrations = [
  {
    name: "Stampante comande",
    area: "Operatività",
    status: "Disponibile",
    priority: "Alta",
    impact: "Comande separate per cucina e bar, ristampa manuale e coda recuperata dopo un riavvio.",
    setup: "La stampa browser funziona subito. Per la stampa termica automatica e silenziosa si collega un bridge locale alla stampante del reparto.",
  },
  {
    name: "SumUp",
    area: "Pagamenti",
    status: "Da collegare",
    priority: "Alta",
    impact: "Incasso al tavolo, meno passaggi in cassa e riconciliazione più semplice.",
    setup: "Serve account SumUp del ristorante e scelta dei metodi di pagamento.",
  },
  {
    name: "Nexi",
    area: "Pagamenti",
    status: "Da collegare",
    priority: "Alta",
    impact: "Pagamenti carta e online con esito salvato sul conto.",
    setup: "Serve contratto Nexi o credenziali tecniche gateway.",
  },
  {
    name: "Fatture in Cloud",
    area: "Fiscale",
    status: "A richiesta",
    priority: "Alta",
    impact: "Export contabile e documenti fiscali più ordinati a fine giornata.",
    setup: "Serve account fiscale e configurazione azienda.",
  },
  {
    name: "Tilby",
    area: "POS",
    status: "In valutazione",
    priority: "Media",
    impact: "Articoli, reparti e ordini possono restare allineati al gestionale.",
    setup: "Da verificare API disponibili e flusso del ristorante.",
  },
  {
    name: "Cassa in Cloud",
    area: "POS",
    status: "In valutazione",
    priority: "Media",
    impact: "Ordynora lavora insieme alla cassa già presente nel locale.",
    setup: "Da verificare piano, API e gestione reparti.",
  },
  {
    name: "TheFork",
    area: "Prenotazioni",
    status: "A richiesta",
    priority: "Media",
    impact: "Prenotazioni, tavoli e coperti più facili da controllare.",
    setup: "Serve account TheFork e regole turni del ristorante.",
  },
  {
    name: "Deliveroo",
    area: "Delivery",
    status: "In valutazione",
    priority: "Bassa",
    impact: "Ordini delivery nella stessa coda cucina, meno tablet separati.",
    setup: "Da valutare se conviene rispetto al volume delivery.",
  },
  {
    name: "Glovo",
    area: "Delivery",
    status: "In valutazione",
    priority: "Bassa",
    impact: "Riduce doppi inserimenti e errori tra sala, cucina e consegna.",
    setup: "Da collegare solo se il locale usa molto delivery.",
  },
];

const areaOrder = ["Tutte", "Operatività", "Pagamenti", "Fiscale", "POS", "Prenotazioni", "Delivery"];

function statusTone(status) {
  if (status === "Disponibile") return "green";
  if (status === "Da collegare") return "blue";
  if (status === "A richiesta") return "amber";
  return "gray";
}

function priorityTone(priority) {
  if (priority === "Alta") return "red";
  if (priority === "Media") return "blue";
  return "gray";
}

export default function Integrazioni() {
  const [area, setArea] = useState("Tutte");
  const [selected, setSelected] = useState(integrations[0].name);
  const [requested, setRequested] = useState(() => {
    try {
      return JSON.parse(localStorage.getItem("easymenu_requested_integrations") || "[]");
    } catch {
      return [];
    }
  });

  const filtered = useMemo(
    () => integrations.filter((item) => area === "Tutte" || item.area === area),
    [area]
  );

  const selectedIntegration = integrations.find((item) => item.name === selected) || filtered[0] || integrations[0];

  function toggleRequest(name) {
    const next = requested.includes(name)
      ? requested.filter((item) => item !== name)
      : [...requested, name];
    setRequested(next);
    localStorage.setItem("easymenu_requested_integrations", JSON.stringify(next));
  }

  return (
    <>
      <Navbar />
      <main className="app-shell integrations-os">
        <section className="glass-hero integrations-hero">
          <div className="topbar-chip">Collegamenti ristorante</div>
          <h1>Pagamenti, POS, fatture, prenotazioni e delivery in un solo posto.</h1>
          <p>
            Questa pagina serve al ristorante per capire cosa si può collegare, cosa è già prioritario e cosa richiedere
            al supporto Ordynora.
          </p>
        </section>

        <section className="integrations-filter">
          {areaOrder.map((item) => (
            <button
              key={item}
              type="button"
              className={area === item ? "is-active" : ""}
              onClick={() => setArea(item)}
            >
              {item}
            </button>
          ))}
        </section>

        <section className="integrations-layout">
          <div className="integrations-grid">
            {filtered.map((item) => {
              const isRequested = requested.includes(item.name);
              return (
                <button
                  key={item.name}
                  type="button"
                  className={`integration-card ${selectedIntegration.name === item.name ? "is-selected" : ""}`}
                  onClick={() => setSelected(item.name)}
                >
                  <div className="integration-card__top">
                    <strong>{item.name}</strong>
                    <span className={`integration-pill integration-pill--${statusTone(item.status)}`}>
                      {isRequested ? "Richiesta" : item.status}
                    </span>
                  </div>
                  <span className="integration-area">{item.area}</span>
                  <p>{item.impact}</p>
                  <span className={`integration-priority integration-priority--${priorityTone(item.priority)}`}>
                    Priorità {item.priority}
                  </span>
                </button>
              );
            })}
          </div>

          <aside className="integration-detail">
            <div>
              <span className="integration-detail__eyebrow">Scheda collegamento</span>
              <h2>{selectedIntegration.name}</h2>
              <p>{selectedIntegration.impact}</p>
            </div>

            <div className="integration-detail__steps">
              <div>
                <span>Area</span>
                <b>{selectedIntegration.area}</b>
              </div>
              <div>
                <span>Stato</span>
                <b>{requested.includes(selectedIntegration.name) ? "Richiesta inviata" : selectedIntegration.status}</b>
              </div>
              <div>
                <span>Cosa serve</span>
                <b>{selectedIntegration.setup}</b>
              </div>
            </div>

            <button
              type="button"
              className="integration-request-btn"
              onClick={() => toggleRequest(selectedIntegration.name)}
            >
              {requested.includes(selectedIntegration.name) ? "Rimuovi richiesta" : "Richiedi collegamento"}
            </button>
          </aside>
        </section>
      </main>
    </>
  );
}
