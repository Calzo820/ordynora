# Ordynora — checklist per la vendita premium

Aggiornamento: 28 agosto 2026.

## Valutazione sintetica

Il prodotto ha una base tecnica vendibile in modalità assistita: separazione dei ristoranti, ruoli, menu QR, ordini live, cucina, bar, tavoli, cassa operativa, statistiche, storico, onboarding, abbonamenti e console SuperAdmin.

La release include inoltre paginazione per molti ristoranti, indici PostgreSQL multi-tenant, cache isolata per ristorante e un livello grafico responsive per desktop, tablet e smartphone.

Non è ancora corretto presentarlo come prodotto premium completamente self-service finché i punti P0 sotto non sono chiusi e documentati.

## P0 — obbligatori prima di incassare dal primo cliente

### 1. Dati legali e contratti reali

- Sostituire tutte le bozze con ragione sociale, sede, P.IVA, contatti, tempi di conservazione e foro/legge applicabile reali.
- Far validare da un professionista Privacy Policy, Cookie Policy, Termini, DPA/nomina a responsabile e lista dei subfornitori.
- Definire titolare e responsabile del trattamento, istruzioni del cliente, misure di sicurezza, procedura per richieste privacy e data breach.
- Mantenere un registro dei trattamenti coerente con i dati realmente gestiti.

Fonti ufficiali di riferimento:

- Garante Privacy, principi e misure di sicurezza: https://www.garanteprivacy.it/home/principi-fondamentali-del-trattamento
- Garante Privacy, registro delle attività: https://www.garanteprivacy.it/registro-delle-attivita-di-trattamento
- Stripe DPA: https://stripe.com/it/legal/dpa/faqs

Questa checklist non sostituisce una consulenza legale.

### 2. Perimetro fiscale dichiarato senza ambiguità

- Descrivere Ordynora come sistema operativo/gestionale e il documento stampato come preconto, se non esiste un'integrazione fiscale certificata.
- Non promettere emissione di scontrini o sostituzione del Registratore Telematico con le funzioni attuali.
- Se si vuole vendere anche come cassa fiscale, progettare e validare l'integrazione con un fornitore abilitato e un commercialista/consulente competente.

Fonte ufficiale: Agenzia delle Entrate, corrispettivi elettronici: https://www.agenziaentrate.gov.it/portale/i-corrispettivi-elettronici

### 3. Stripe live e fatturazione

- Configurare chiavi live, webhook live e tutti i Price ID dei quattro piani.
- Verificare checkout, rinnovo, pagamento fallito, cancellazione, rimborso e portale cliente.
- Collegare il processo di fatturazione corretto per l'impresa che vende Ordynora.
- Il pagamento dal tavolo è ancora disattivato: non includerlo nelle promesse commerciali finché il flusso non è implementato e collaudato.

### 4. Email transazionali reali

- Verificare dominio mittente e SPF/DKIM/DMARC presso il provider scelto.
- Provare registrazione, verifica email, password dimenticata e reimpostazione su indirizzi Gmail, Outlook e dominio aziendale.
- Definire cosa succede quando un invio fallisce e come interviene il supporto.

### 5. Produzione, backup e ripristino

- Usare segreti unici e robusti in produzione; nessun valore di esempio deve restare attivo.
- Attivare backup automatici del database e documentare retention, cifratura e responsabilità.
- Eseguire almeno una prova reale di ripristino in un ambiente separato e annotarne durata e risultato.
- Attivare alert su errori 5xx, database, webhook Stripe, coda stampa e indisponibilità del backend.
- Verificare domini, HTTPS, CORS e rate limit con gli URL definitivi.

### 6. Collaudo sul campo

- Eseguire una serata pilota completa con almeno due telefoni cliente, un tablet sala, una postazione cucina/bar e una cassa.
- Provare perdita e ritorno della rete, doppio tap sull'ordine, refresh, stampa, chiusura conto, annullo e cambio operatore.
- Testare Chrome e Safari alle larghezze 360, 390, 768, 1024, 1366 e 1920 px, inclusi tablet in orizzontale.
- Conservare una checklist firmata o un report per ogni ristorante attivato.

### 7. Capacità per 100 ristoranti

L'architettura è predisposta, ma non equivale a una certificazione di carico.

- Eseguire un test realistico con ristoranti distinti, non un unico tenant ripetuto.
- Simulare picchi di lettura menu, creazione ordini, aggiornamenti Socket.IO, cucina, cassa e dashboard.
- Misurare p95/p99, error rate, connessioni database, CPU/RAM e tempi di cold start.
- Scegliere i piani Neon/hosting in base ai risultati e ripetere il test dopo ogni cambio infrastrutturale rilevante.

### 8. Supporto e promessa commerciale

- Pubblicare canale, orari e tempi obiettivo di risposta.
- Definire onboarding, import menu, formazione, incidenti, richieste privacy e uscita/esportazione dati.
- Scrivere chiaramente ciò che è incluso, ciò che è opzionale e ciò che è in roadmap.
- Evitare termini come “sempre disponibile” o garanzie assolute senza un SLA contrattuale sostenibile.

## P1 — necessari per scalare dopo i primi clienti

- Test end-to-end automatici dei flussi ordine-cucina-cassa-billing.
- Pipeline CI che blocca il deploy se lint, build, test o migrazioni falliscono.
- Ambiente staging separato dalla produzione.
- Monitoraggio sintetico da più località e procedura incidenti.
- Audit accessibilità con tastiera, screen reader, contrasto, zoom 200% e target touch.
- Registro versioni, changelog cliente e procedura di rollback.
- Esportazione completa del ristorante e cancellazione verificabile nei tempi contrattuali.
- Analisi costi per ristorante e soglie di capacità per database, email, storage e hosting.

## Stato della release consegnata

| Area | Stato |
| --- | --- |
| Separazione multi-tenant | Implementata |
| Paginazione SuperAdmin | Implementata |
| Indici database per scala | Implementati; migrazione da applicare |
| Cache menu isolata per ristorante | Implementata |
| Responsive desktop/tablet/mobile | Consolidato |
| Navigazione desktop persistente | Implementata |
| Drawer tablet/mobile | Implementato |
| Modali responsive e accessibili | Migliorate |
| Build e lint | Verificati |
| Test automatici | Verificati nella release |
| Test di carico 100 ristoranti | Da eseguire sull'infrastruttura reale |
| Documenti legali definitivi | Da validare e completare |
| Pagamento dal tavolo | Non disponibile; non promettere |
| Funzione fiscale/RT | Non inclusa |

## Gate di rilascio

La vendita premium può partire quando tutti i P0 hanno un responsabile, una data e una prova verificabile. Se anche un solo punto P0 resta aperto, la formula corretta è “pilota assistito” con limiti espliciti nel contratto.
