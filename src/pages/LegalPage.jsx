import { Link, useLocation } from "react-router-dom";
import logoOrdynora from "../assets/logo-easymenu.png";
import RestaurantDataControls from "../components/RestaurantDataControls.jsx";
import "../styles/legal.css";

const contact = "easy.menu.service@gmail.com";
const phone = "+39 324 046 7723";

const pages = {
  "/privacy": {
    eyebrow: "Privacy Policy",
    title: "Come Ordynora tratta i dati",
    intro: "Informativa trasparente per ristoranti, staff e clienti che usano il menu QR.",
    notice: "Documento operativo aggiornato. Prima della vendita definitiva vanno inseriti ragione sociale, sede, P.IVA e tempi di conservazione approvati dal consulente privacy.",
    sections: [
      {
        title: "1. Titolare e contatti",
        text: `Il gestore della piattaforma Ordynora tratta i dati degli account ristorante per erogare il servizio. Contatti privacy: ${contact}, telefono ${phone}. I dati identificativi completi del gestore devono essere inseriti prima del lancio commerciale.`,
      },
      {
        title: "2. Ruoli nel trattamento",
        text: "Per account, abbonamenti, sicurezza e assistenza, Ordynora opera come titolare del trattamento. Per ordini, prenotazioni e dati dei clienti finali, il ristorante decide finalità e modalità ed è normalmente titolare; Ordynora opera come responsabile del trattamento. Prima dell'attivazione commerciale serve un accordo sul trattamento dei dati ai sensi dell'art. 28 GDPR.",
      },
      {
        title: "3. Dati trattati",
        bullets: [
          "Dati account: nome, email, ruolo, ristorante e stato dell'abbonamento.",
          "Dati operativi: menu, tavoli, ordini, prenotazioni, nome e telefono inseriti dal ristorante, note e stato del servizio.",
          "Dati di pagamento: stato, importo, identificativi tecnici e metodo; i dati completi della carta restano presso Stripe.",
          "Dati tecnici: indirizzo IP, dispositivo, sessioni, log di errore, sicurezza e accessi di assistenza.",
        ],
      },
      {
        title: "4. Finalità e basi giuridiche",
        bullets: [
          "Erogazione del SaaS, autenticazione, ordini e prenotazioni: esecuzione del contratto o misure precontrattuali.",
          "Billing, fatture e obblighi amministrativi: contratto e obbligo di legge.",
          "Sicurezza, prevenzione abusi e log tecnici: legittimo interesse alla protezione del servizio.",
          "Comunicazioni commerciali non necessarie: solo con consenso, quando richiesto.",
        ],
      },
      {
        title: "5. Fornitori e destinatari",
        text: "I dati possono essere trattati da fornitori necessari a hosting e database, Stripe per i pagamenti, Brevo per le email di sicurezza e professionisti autorizzati. Il ristorante vede solo i dati del proprio locale. L'elenco aggiornato dei fornitori e delle relative sedi deve essere allegato al contratto privacy.",
      },
      {
        title: "6. Conservazione e cancellazione",
        text: "I dati devono essere conservati solo per il tempo necessario al servizio, agli obblighi di legge, alla sicurezza e alla gestione di contestazioni. Prima del lancio vanno approvati e applicati nel backend tempi precisi per ordini, prenotazioni, log, account chiusi e backup. Alla cessazione del contratto il ristorante potrà richiedere esportazione e cancellazione, salvo obblighi di conservazione.",
      },
      {
        title: "7. Assistenza SuperAdmin",
        text: "L'accesso di assistenza richiede una motivazione, scade dopo 2 ore, viene registrato, comunicato via email all'owner e mostrato nella dashboard per 24 ore. Durante l'accesso sono bloccati ordini completi, report economici e dati identificativi delle prenotazioni; gli importi restano nascosti anche nella dashboard. I log di sicurezza restano conservati dopo la rimozione dell'avviso.",
      },
      {
        title: "8. Diritti e reclami",
        text: `Gli interessati possono chiedere accesso, rettifica, cancellazione, limitazione, portabilità e opposizione, quando applicabili. Le richieste relative ai clienti del ristorante vanno inviate prima al ristorante; Ordynora fornisce supporto tecnico. Per gli account Ordynora scrivere a ${contact}. È possibile proporre reclamo al Garante per la protezione dei dati personali.`,
      },
      {
        title: "9. Sicurezza e incidenti",
        text: "Ordynora applica controllo degli accessi, sessioni protette, separazione dei ristoranti, log tecnici e limitazione dei dati visibili al supporto. Eventuali violazioni vengono valutate e comunicate ai soggetti interessati secondo gli obblighi applicabili.",
      },
    ],
  },
  "/termini": {
    eyebrow: "Termini e condizioni",
    title: "Regole chiare per usare Ordynora",
    intro: "Condizioni essenziali del servizio SaaS dedicato alla gestione operativa del ristorante.",
    notice: "Bozza contrattuale avanzata: prima della vendita va completata con i dati del fornitore e validata da un professionista.",
    sections: [
      { title: "1. Servizio", text: "Ordynora fornisce menu QR, ordini al tavolo, cucina, bar, cassa, tavoli, prenotazioni, statistiche, pagamenti online e strumenti di configurazione. Funzioni indicate come beta o in arrivo non fanno parte delle garanzie del piano fino all'attivazione ufficiale." },
      { title: "2. Account e sicurezza", text: "Il ristorante deve proteggere le credenziali, assegnare ruoli corretti allo staff e segnalare accessi anomali. Le azioni effettuate con un account autorizzato sono attribuite al ristorante, salvo comprovata violazione di sicurezza." },
      { title: "3. Responsabilità del ristorante", text: "Il ristorante è responsabile di prezzi, disponibilità, descrizioni, allergeni, obblighi fiscali, correttezza dei dati inseriti e informativa privacy verso i propri clienti. Ordynora non sostituisce registratore telematico, consulenza fiscale, HACCP o consulenza legale." },
      { title: "4. Abbonamento e IVA", text: "I piani disponibili sono mensile, trimestrale, semestrale e annuale. I prezzi sono indicati al netto dell'IVA quando compare la dicitura + IVA. Rinnovo, metodo di pagamento, fatture e disdetta sono gestiti tramite il portale Stripe. La disdetta produce effetto secondo il periodo già pagato e le condizioni mostrate al checkout." },
      { title: "5. Pagamenti dei clienti", text: "Il pagamento dal tavolo è una funzione prevista ma non ancora attiva. Quando sarà disponibile, verranno aggiornate questa informativa e le condizioni applicabili prima dell'attivazione per i ristoranti." },
      { title: "6. Disponibilità e assistenza", text: `Il servizio dipende anche da internet e fornitori esterni. Ordynora interviene sugli errori segnalati con priorità ragionevole e risponde alle richieste di assistenza entro 24 ore lavorative tramite ${contact} o ${phone}.` },
      { title: "7. Dati e fine contratto", text: "Il ristorante può richiedere l'esportazione dei propri dati prima della chiusura. Alla cessazione, i dati vengono cancellati o anonimizzati secondo l'accordo privacy e gli obblighi di legge. Le procedure e i tempi devono essere riportati nel contratto definitivo." },
      { title: "8. Uso vietato", text: "È vietato tentare accessi non autorizzati, aggirare i limiti del servizio, caricare contenuti illeciti, utilizzare dati di terzi senza base giuridica o compromettere sicurezza e disponibilità della piattaforma." },
      { title: "9. Limitazioni e legge applicabile", text: "Le responsabilità e gli eventuali limiti economici devono essere definiti nel contratto firmato, nel rispetto delle norme inderogabili. Legge applicabile, foro e procedura di contestazione vanno completati con i dati legali del fornitore." },
    ],
  },
  "/cookie": {
    eyebrow: "Cookie e storage",
    title: "Tecnologie usate da Ordynora",
    intro: "Una spiegazione semplice di ciò che viene salvato nel browser e perché.",
    notice: "Stato attuale: solo strumenti tecnici necessari. Se verranno aggiunti analytics, pixel o marketing, serviranno gestione del consenso e aggiornamento di questa pagina.",
    sections: [
      { title: "1. Cosa utilizziamo", text: "Ordynora usa cookie tecnici e localStorage per autenticazione, sessione, preferenze dell'interfaccia, carrello, tavolo selezionato e stato dell'ordine. Questi strumenti permettono di usare funzioni richieste dall'utente e migliorano la sicurezza." },
      { title: "2. Durata", text: "Alcune informazioni durano solo per la sessione; altre restano fino al logout, alla conclusione dell'ordine o alla cancellazione manuale dal browser. I tempi effettivi devono essere riportati nell'inventario tecnico allegato alla policy." },
      { title: "3. Pagamenti e terze parti", text: "Quando il cliente apre il checkout o il ristoratore gestisce l'abbonamento, Stripe può usare propri cookie e strumenti tecnici secondo la sua informativa. Tali strumenti operano sulle pagine Stripe." },
      { title: "4. Analytics e marketing", text: "Ordynora non deve installare strumenti di profilazione o marketing prima del consenso. Se saranno introdotti, verrà mostrato un pannello che consente di accettare o rifiutare con pari facilità, scegliere per categoria e revocare la scelta." },
      { title: "5. Gestione dal browser", text: "È possibile eliminare cookie e dati locali dalle impostazioni del browser. La rimozione dei dati tecnici può disconnettere l'account, svuotare il carrello o perdere lo stato locale dell'ordine." },
      { title: "6. Contatti", text: `Per domande sulle tecnologie utilizzate scrivere a ${contact} o chiamare ${phone}.` },
    ],
  },
};

export default function LegalPage() {
  const location = useLocation();
  const page = pages[location.pathname] || pages["/privacy"];

  return (
    <main className="legal-page">
      <nav className="legal-nav">
        <Link to="/" className="legal-brand"><img src={logoOrdynora} alt="Ordynora" /><span>Ordynora</span></Link>
        <div><Link to="/privacy">Privacy</Link><Link to="/termini">Termini</Link><Link to="/cookie">Cookie</Link></div>
      </nav>

      <section className="legal-hero">
        <span>{page.eyebrow}</span>
        <h1>{page.title}</h1>
        <p>{page.intro}</p>
        <small>Ultimo aggiornamento: 25 luglio 2026</small>
      </section>

      <aside className="legal-notice"><b>Prima della vendita</b><p>{page.notice}</p></aside>

      <section className="legal-sections">
        {page.sections.map((section) => (
          <article key={section.title}>
            <h2>{section.title}</h2>
            {section.text ? <p>{section.text}</p> : null}
            {section.bullets ? <ul>{section.bullets.map((item) => <li key={item}>{item}</li>)}</ul> : null}
          </article>
        ))}
      </section>

      {location.pathname === "/privacy" ? <RestaurantDataControls /> : null}

      <footer className="legal-footer">
        <span>Ordynora</span><a href={`mailto:${contact}`}>{contact}</a><a href={`tel:${phone.replaceAll(" ", "")}`}>{phone}</a>
      </footer>
    </main>
  );
}
