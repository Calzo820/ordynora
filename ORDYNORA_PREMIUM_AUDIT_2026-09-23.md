# Ordynora — audit Premium, prova servizio e piano 100 ristoranti

Data: 23 settembre 2026  
Versione analizzata: commit di partenza `1bd5576`, con Reliability/UX/Competitive Sprint applicati in questo pacchetto.

## Verdetto esecutivo

Ordynora ha già un nucleo da prodotto reale: multi-tenant, menu QR, ordini, cucina e bar separati, tavoli, prenotazioni, cassa, pagamenti manuali/misti, chiusura giornaliera, ruoli, PWA, storico, audit e dashboard.

Il codice modificato supera:

- lint completo;
- build production Vite;
- 24/24 test frontend;
- 34/34 test backend;
- validazione schema Prisma;
- controllo della migrazione per portate e tempi di preparazione.

Il verdetto commerciale resta però **GO per un pilot assistito di 1–3 ristoranti**, **NO-GO per promettere oggi “Premium affidabile per 100 ristoranti”**. Per quella promessa mancano ancora una prova E2E su staging, un test di carico reale, backup esterno con prova di ripristino, monitoraggio configurato, infrastruttura always-on e fiscalità/POS certificati.

## Legenda

- 🟢 vantaggio credibile di Ordynora oggi;
- 🟡 presente, ma da completare o validare sul campo;
- 🔴 mancante o non vendibile come pronto;
- ⚫ non necessario per il posizionamento iniziale di Ordynora.

Le funzioni dei concorrenti sono ricavate dalle pagine pubbliche ufficiali, non da accessi interni ai loro prodotti. `—` significa “non dichiarato chiaramente nelle fonti consultate”, non necessariamente assente.

Nota: nel confronto “Ordinalo” indica **ordinalo.net**, orientato soprattutto a delivery, take-away, app personalizzata e CRM. `ordinalo.app` è un prodotto diverso, più vicino agli ordini QR al tavolo.

## 1. Ordynora vs Ordinalo vs Dishup vs Tabomenu vs Tilby

| Funzione | Ordynora | Ordinalo | Dishup | Tabomenu | Tilby | Valutazione Ordynora |
| --- | --- | --- | --- | --- | --- | --- |
| Menu digitale con QR tavolo | Sì, QR per tavolo | Sì | Sì | Sì | Sì/moduli | 🟡 solido, serve pilot reale |
| Ordine autonomo del cliente | Sì, senza account cliente | Sì, tavolo e delivery | Sì | Sì | Sì/modulo | 🟡 |
| Presa comanda del cameriere | Tramite comanda tavolo; flusso dedicato ancora essenziale | — | App Waiter | Sì | Sì | 🟡 da rendere più rapido di un menu cliente |
| Cucina KDS in tempo reale | Sì | — | Sì, Kitchen Copilot | Sì, Display Cucina | Sì/centri produzione | 🟡, buona base ma meno matura |
| Bar separato dalla cucina | Sì, ruolo e coda dedicati | — | Coordinamento bar dichiarato | — | Sì | 🟢 flusso molto chiaro |
| Portate/uscite strutturate | Sì, 1–4, con chiamata progressiva dalla sala | — | Gestione preparazione | — | Sì, sequenza uscita | 🟡, completa nel codice e da provare in servizio |
| Pronto → consegnato dal cameriere | Sì, azione esplicita dal tavolo | — | Live Manager | — | Sì | 🟢 tracciamento operativo semplice |
| Mappa tavoli e stato live | Sì | Ordine dal tavolo | Sì | Sì | Sì | 🟡 |
| Prenotazioni | Sì, agenda interna | Sì, anche Google Reserve | Dichiarate | Sì, anche Google | Sì, anche integrazioni | 🟡: manca widget pubblico/Google |
| Ruoli e permessi | Owner, admin, cucina, bar, cassa, sala | Fattorini/accessi | Staff dedicato | App unica | Profili/moduli | 🟢 per semplicità e separazione |
| Accesso staff PIN persistente | Sì, dispositivo ricordato, sessione staff 90 giorni | — | — | Login app | Login app | 🟢 |
| Installazione su telefono/tablet/PC | PWA installabile | App nativa brandizzata | Cloud/app | iOS/Android/web | iOS/Android/PC/Mac | 🟡: PWA ottima, non App Store |
| Ordine offline/retry anti-perdita | Coda locale, retry, idempotenza, fallback menu dopo primo caricamento | — | Affidabilità dichiarata | Connessione richiesta per fiscalità | Cloud | 🟢 nel codice; da provare con rete degradata |
| Pagamenti manuali e misti | Sì, acconti, contanti/carta/Satispay, split | Online delivery | Sì/POS | Sì/Tap to Pay | Sì/POS e integrazioni | 🟡 |
| Pagamento online dal tavolo | Codice presente ma disattivato | Sì per ordini online | Sì | Sì | Sì | 🔴 finché Stripe Connect non è validato live |
| POS/Tap to Pay integrato | No | — | Sì | Sì | Sì | 🔴 |
| Scontrino fiscale certificato | No | Integrazione Epson dichiarata | Sì, stampante/Fatture in Cloud | Sì, scontrino digitale | Sì | 🔴 blocco commerciale importante |
| Chiusura conto e giornata | Sì | Report consegne | POS/cassa | Cassa | Cassa | 🟡: pronta lato gestionale, non fiscale |
| Magazzino quantità/scorte | Sì, quantità, soglia, movimenti | Sì, base | Sì, ingredienti | — | Sì | 🟡 |
| Ricette, distinta base, food cost | Costo prodotto, non distinta base | — | Dichiarato | — | Sì | 🔴 |
| Dashboard proprietario | Sì, incassi, margini, prodotti, cucina/bar, alert | Sì, andamento/gradimento | Sì, report dettagliati | — | Sì | 🟡, ora più operativa |
| Menu import CSV | Sì, anteprima, validazione, upsert anti-doppione | — | — | — | Import/integrabilità non verificata | 🟢 riduce molto l'onboarding |
| Audit, riaperture, motivazioni | Sì | — | — | — | — | 🟢 per controllo interno |
| Multi-tenant | Sì, `restaurantId` su dati operativi | Sì | Sì/catene | Sì | Sì | 🟡: architettura presente, carico reale non certificato |
| Multi-sede consolidato | Tenant separati, non dashboard gruppo | Più punti vendita | Dichiarato per catene | — | Sì | 🔴 se si vogliono vendere catene |
| Delivery/take-away | Non è il focus | Punto forte | Sì | Sì | Sì/integrazioni | ⚫ per la prima nicchia “servizio al tavolo”; 🔴 se promesso |
| CRM, fidelity, coupon, push | No | Punto forte | Feedback/dati | — | Sì | ⚫ per il pilot; roadmap successiva |
| API e integrazioni esterne | API interna, non pubblica | Integrazioni specifiche | POS/fatturazione | Moduli proprietari | Open API e molte integrazioni | 🔴 per ecosistema enterprise |
| App nativa brandizzata per ogni locale | No, PWA Ordynora | Punto forte | App cliente | App Tabomenu | App Tilby | ⚫: costosa e non necessaria per vincere il pilot |

### Posizionamento consigliato

Non presentare Ordynora come “un'altra cassa completa”. Tilby, Dishup e Tabomenu sono più avanti su fiscalità, POS e integrazioni. Il posizionamento più credibile è:

> **Il sistema operativo di sala, cucina e bar che parte in un giorno, non perde le comande e non richiede formazione allo staff.**

La promessa iniziale deve concentrarsi su servizio al tavolo, ruoli semplici, QR, velocità operativa, tracciamento delle consegne e onboarding rapido del menu.

### Fonti ufficiali concorrenti

- Ordinalo: <https://www.ordinalo.net/> e <https://www.ordinalo.net/caratteristiche/>
- Dishup: <https://dishup.it/> e <https://dishup.it/it/partners/features>
- Tabomenu: <https://www.tabomenu.com/>, <https://www.tabomenu.com/ordini/> e <https://www.tabomenu.com/prenotazioni-online/>
- Tilby: <https://www.tilby.com/it/settori/software-gestionale-cassa-ristorante/>, <https://www.tilby.com/it/come-funziona/funzioni/gestione-ristorazione/> e <https://www.tilby.com/it/come-funziona/integrazioni/>

## 2. Prova “domani apre un ristorante vero”

### Percorso completo e punti di rottura

| Passaggio | Cosa deve accadere | Rottura possibile | Protezione presente | Rischio residuo |
| --- | --- | --- | --- | --- |
| Cliente apre QR | Menu corretto del locale e del tavolo | QR vecchio, backend freddo, rete assente al primo accesso | Token tavolo, health endpoint, cache menu dopo primo caricamento | Prima apertura totalmente offline non può funzionare |
| Cliente compone ordine | Quantità, note, allergeni e portate chiare | Doppio tap, refresh, carrello perso | Carrello locale, guard doppio invio, portate 1–4 | Note per riga non persistono ancora dopo refresh |
| Invio ordine | Una sola comanda nel DB | Timeout con risposta persa, doppione, Wi-Fi condiviso | `clientRequestId`, vincolo idempotenza, coda offline, retry; rate limit separato per tavolo | Coda è sul singolo dispositivo, non sincronizzata tra telefoni |
| Stock | Quantità scalata una volta | Due ordini prendono l'ultima porzione | Update atomico con condizione scorta | Va provato con concorrenza reale su Neon |
| Cucina | Vede solo piatti cucina | Socket perso, ordine non aggiornato | Socket autenticato, recovery, polling 30 s | Con più istanze serve adapter Redis |
| Bar | Vede solo bevande | Cucina segna pronto mentre bar è ancora indietro | Stato globale derivato da entrambi i reparti | Va provato con ticket misti durante picco |
| Portate | Cucina vede solo l'uscita chiamata | Testo libero ambiguo, doppio tocco del cameriere | `courseNumber`, rilascio progressivo idempotente e ordine KDS | Da validare durante un servizio reale |
| Tavolo | Cameriere vede “Pronto” | Nessuno conferma la consegna | Pulsante “Consegnato al tavolo” per sala/owner/admin | Va misurato se il gesto è davvero usato dallo staff |
| Richiesta conto | Cassa vede priorità | Socket o polling in ritardo | Stato conto + polling | Notifiche push native non presenti |
| Acconto/split | Importi corretti | Doppio click, due dispositivi, sovrapagamento | Idempotency key, vincolo univoco, lock riga ordine, controllo saldo dentro transazione | Test di concorrenza DB live ancora da eseguire |
| Pagamento | Manuale o online | POS non conferma, webhook duplicato | Manuale robusto; webhook Stripe già progettato | Pagamento tavolo è volutamente disattivato |
| Chiusura conto | Una sola chiusura, tavolo libero | Due casse chiudono insieme | Lock transazionale, idempotenza, risposta “già chiuso” | Stampante/scontrino fiscale non certificati |
| Chiusura giornata | Totali per metodo e differenza cassa | Conti aperti o dati incompleti | Blocco se ci sono conti aperti, audit e riapertura owner | Serve riconciliazione con sistema fiscale/POS reale |

### Test automatici eseguiti

- Frontend: **24/24 passati**, inclusi sequenza portate, import CSV, coda offline, PWA, recupero servizio e guide per tutti i ruoli.
- Backend: **34/34 passati**, inclusi validazione portate, auth, billing, rate limit Wi-Fi condiviso, sessioni, cache tenant e API smoke.
- Build production: **passata**.
- ESLint: **passato**.
- Prisma validate: **passato**.

### Test E2E distruttivo preparato, non eseguito sul database reale

Lo script `backend/scripts/e2e-service-flow.js` ora verifica:

1. backend e database pronti;
2. login owner, cucina, bar, cameriere e cassa;
3. ordine cliente con piatto cucina e bevanda bar;
4. reinvio dello stesso ordine e blocco duplicato;
5. cucina `pending → in_progress → ready`;
6. bar `pending → in_progress → ready`;
7. cameriere `ready → served`;
8. acconto e reinvio duplicato;
9. saldo e chiusura conto, con reinvio duplicato;
10. storico, analytics e riepilogo cassa.

Va eseguito **solo su staging con database dedicato**, perché lascia il conto di prova nello storico come evidenza:

```bash
E2E_ALLOW_WRITE=true \
E2E_API_URL=https://api-staging.example.com \
E2E_PASSWORD='password-staging' \
npm run test:service
```

## 3. Reliability Sprint

| Area | Cosa è stato fatto/verificato | Stato | Prima di 100 ristoranti |
| --- | --- | --- | --- |
| Socket.IO | JWT, room per ristorante/ruolo, heartbeat, riconnessione infinita, event ID, connection-state recovery, scadenza socket con JWT, polling fallback | 🟡 | Redis adapter e sticky session se Render scala a più istanze |
| Database | Transazioni, tenant filter, indici, migrazioni, lock ordine per pagamenti/chiusura | 🟡 | URL Neon pooled, limiti connessioni, query metrics, test concorrenza live |
| Retry | GET e richieste idempotenti ritentate; 429 usa `Retry-After`; coda ordini esponenziale fino a 8 tentativi | 🟢 | Provare rete lenta, offline e perdita risposta in un locale |
| Duplicati | Ordini, acconti e chiusure protetti da chiavi univoche e controlli transazionali | 🟢 | Testare due tablet cassa contemporanei contro Neon |
| JWT/sessioni | Access token breve, refresh token hashato, sessioni revocabili, staff fino a 90 giorni, ruoli verificati dal token | 🟡 | Usare `api.ordynora.com` per cookie first-party e fare penetration test |
| Rate limit | Login protetto; ordini limitati globalmente per IP e per IP+ristorante+tavolo | 🟡 | Store Redis quando si usano più istanze; allarmi su 429 |
| Error handling | Request ID, JSON error, log strutturato, persistenza automatica risposte 5xx | 🟡 | Sentry/APM o equivalente e redazione PII verificata |
| Render | `/ready` controlla DB/migrazione, Node 22, arresto pulito | 🟡 | Piano paid always-on, almeno due istanze quando richiesto, regione vicina a Neon |
| Neon | Prisma/Postgres e migrazioni | 🟡 | Pooler, PITR/retention del piano scelto, allarmi storage/connessioni |
| Backup | Backup applicativo cifrato AES-GCM, upload esterno e verifica formato già presenti | 🔴 operativo | Configurare storage esterno, attivare scheduler e fare restore drill mensile |
| Logging | Log JSON, ErrorLog per tenant, audit log | 🟡 | Retention, alert, dashboard e correlazione request ID end-to-end |
| Monitoraggio | Health collector e webhook disponibili | 🔴 operativo | Configurare uptime monitor esterno + webhook e reperibilità |
| 100 ristoranti | Seed e harness concorrente pronti | 🔴 non certificato | Eseguire su staging uguale alla produzione e conservare report |

### Test di carico 100 ristoranti

Il pacchetto contiene:

- `npm run seed:load:100`: crea 100 tenant sintetici solo su DB staging;
- `npm run test:load:100`: invia ordini contemporanei a 100 ristoranti distinti;
- metriche p50, p95, p99, massimo, error rate e distribuzione HTTP;
- soglia iniziale: **0 errori e p95 < 2 secondi dopo warm-up**.

Esecuzione sicura:

```bash
cd backend
LOAD_TEST_ALLOW_SEED=true \
LOAD_TEST_FIXTURES_FILE=./load-test-fixtures.json \
npm run seed:load:100

LOAD_TEST_ALLOW_WRITE=true \
LOAD_TEST_API_URL=https://api-staging.example.com \
LOAD_TEST_FIXTURES_FILE=./load-test-fixtures.json \
LOAD_TEST_ITERATIONS=3 \
npm run test:load:100
```

Profilo minimo da provare in una seconda fase: 100 ristoranti × 8 dispositivi live = circa 800 socket, più 200 ordini/minuto per 30 minuti. Il semplice test HTTP incluso è il primo cancello, non sostituisce soak test, socket test e osservazione DB.

## 4. UX Sprint — “un cameriere senza spiegazioni”

### Migliorie applicate

- Il cameriere installa la PWA, entra una volta con codice ristorante + PIN e mantiene una sessione lunga.
- Al primo accesso ogni ruolo riceve una guida di tre azioni; resta riapribile dal pulsante **Come si usa**.
- Il menu laterale distingue **Servizio** (Sala, Cucina, Bar, Cassa) da **Gestione** (Dashboard, Menu, Statistiche, Storico).
- Il ruolo sala apre la vista tavoli, non pannelli amministrativi.
- Il tavolo pronto non torna più erroneamente “libero” dopo il servizio: ora esiste lo stato visivo **Servito — conto aperto**.
- Nel dettaglio tavolo compare una sola azione primaria quando serve: **Consegnato al tavolo**.
- Se esistono più portate, la sala vede la sequenza e il pulsante **Invia Nª portata**; la cucina non vede in anticipo le portate trattenute.
- “Apri comanda” porta direttamente al menu del tavolo.
- Gli stati tavolo sono cromatici e testuali: libero, prenotato, occupato, pronto, servito, conto.
- I nuovi componenti import/menu e consegna sono adattivi sotto 720 px.
- La Dashboard propone quattro accessi immediati alle attività più frequenti e rende cliccabili gli indicatori operativi.
- La Cassa mostra visivamente la sequenza “scegli tavolo → controlla conto → incassa e chiudi”.
- Cucina e bar usano verbi espliciti: **Inizia preparazione** e **Segna pronto**.
- Un errore temporaneo non disconnette più lo staff: Ordynora controlla automaticamente backend e database fino a sei volte e riapre la postazione quando tornano disponibili.
- La landing avvia un controllo leggero del backend, riducendo l'attesa quando il primo utente apre Login o Demo.
- La pagina offline PWA distingue rete assente da server lento e rientra automaticamente al ritorno della connessione.
- Le regole responsive già presenti coprono telefono, tablet portrait/landscape e desktop; la build non contiene larghezze rigide bloccanti nelle nuove viste.

### Cose ancora da validare con 3 camerieri veri

Non basta guardare la UI. Fare una prova di 30 minuti senza spiegazioni e misurare:

- tempo per entrare e trovare il tavolo;
- errori nel prendere una comanda;
- comprensione di “pronto” vs “servito”;
- uso delle portate;
- capacità di tornare alla sala dopo aver aperto la comanda;
- uso con una mano su telefono da 360 px;
- contrasto e tocchi con mani bagnate/guanti;
- comportamento dopo spegnimento schermo e cambio rete Wi-Fi/4G.

Criterio: 90% dei compiti conclusi senza aiuto, nessun ordine perso, massimo un errore recuperabile per persona.

## 5. Competitive Features

### Service Flow

Implementato un flusso esplicito:

`cliente → ordine → prima portata → chiamata portate successive → cucina/bar → pronto globale → consegna cameriere → conto → pagamento → chiusura`

Il globale diventa pronto solo quando tutti i reparti coinvolti sono pronti. Il cameriere è l'unico ruolo operativo che può confermare `ready → served`; non può cambiare arbitrariamente gli stati della cucina.

Stato: **🟢 base forte**. Il comando “chiama prossima portata” è protetto contro doppi invii e salti di sequenza.

### Tempi cucina e bar

Ogni riga ordine registra `preparationStartedAt` e `preparationReadyAt`. La dashboard mostra medie separate cucina/bar, invece di confondere preparazione e attesa del conto.

Stato: **🟡**, perché i dati diventano affidabili solo dopo alcune settimane di utilizzo disciplinato.

### Portate

Il cliente/cameriere assegna una portata 1–4. La prima viene rilasciata subito; le successive restano in attesa finché la sala non le chiama. Il KDS mostra solo la portata attiva senza interpretare la parola “dopo” nelle note. I vecchi ordini restano compatibili grazie alla migrazione conservativa.

Stato: **🟡**, nuova funzione da testare sul pass.

### Dashboard proprietario

Già presenti ricavi, ticket, margini, food cost semplificato, prodotti, sale, errori, scorte e andamento. Aggiunti tempi cucina e bar reali.

Stato: **🟡**. Prossimo miglioramento: confronto tra sedi e costo ricette/ingredienti.

### Offline/fallback

Gli ordini hanno coda locale, retry esponenziale, stato fallito visibile e retry manuale. Il menu viene salvato localmente dopo il primo caricamento e può riaprire senza backend; l'ordine resta in coda fino al ritorno della rete.

Stato: **🟢 nel codice**, **🟡 sul campo** finché non viene fatto un test con router spento durante il servizio.

### Menu import

Nuova importazione CSV con:

- modello italiano scaricabile;
- delimitatore `;` o `,`;
- prezzi con virgola;
- campi italiani o inglesi;
- anteprima e segnalazione righe errate;
- massimo 500 prodotti;
- aggiornamento per nome+categoria senza doppioni;
- audit unico dell'importazione.

Stato: **🟢** e ad alto valore commerciale perché riduce l'avvio del locale da ore a minuti.

## Blocchi P0 prima di vendere “Premium affidabile”

1. **Staging uguale alla produzione** e passaggio E2E completo.
2. **Render paid always-on**; nessun cold start durante il servizio.
3. **Dominio API first-party**, ad esempio `api.ordynora.com`, CORS limitato e cookie refresh verificato su iOS/Safari.
4. **Backup esterno attivo** con almeno una prova di ripristino documentata.
5. **Monitor esterno e alert reali**, non solo endpoint `/health` e `/ready`.
6. **Test 100 tenant + soak test**, con report p95/p99, errori, CPU, RAM, socket e connessioni Neon.
7. **Decisione fiscale**: integrazione con RT/scontrino elettronico oppure dichiarazione commerciale chiara che Ordynora non sostituisce il registratore fiscale.
8. **Pagamento online**: tenerlo disattivato finché Stripe Connect, webhook e riconciliazione non superano test live.
9. **Pilot in un ristorante vero** per almeno 10 servizi, con procedura di supporto e rollback.
10. **Privacy/DPA/termini** revisionati da un professionista prima di trattare dati di clienti reali.

## Deploy delle modifiche

Prima verificare il repository remoto:

```powershell
git remote -v
git remote set-url origin https://github.com/Calzo820/easymenu.git
```

Poi, dalla cartella del progetto:

```powershell
git add README.md package.json render.yaml backend src tests
git commit -m "Reliability UX e service flow premium"
git push origin main
```

La nuova migrazione `20260923120000_service_flow_courses` viene applicata dal comando Render già configurato (`prisma migrate deploy`). Dopo il deploy controllare nell'ordine:

1. log Render: migrazione applicata e server avviato con Node 22;
2. `https://<backend>/ready` restituisce `ok: true`;
3. Vercel usa `VITE_API_URL` come variabile **Config**, non Secret, con URL senza slash finale;
4. login owner, login PIN sala, ordine QR e cucina/bar;
5. consegna cameriere, acconto, chiusura e riepilogo cassa;
6. aggiornamento PWA forzato chiudendo e riaprendo l'app.

Non attivare `BACKUP_ENABLED=true` finché `BACKUP_ENCRYPTION_KEY` e `BACKUP_UPLOAD_URL` non sono configurati. Non attivare i pagamenti al tavolo finché il collaudo Stripe non è concluso.

## Decisione finale

Ordynora è migliorato in modo sostanziale e può entrare in un **pilot commerciale controllato**. Il passo giusto non è aggiungere altre schermate: è dimostrare che questo flusso regge dieci servizi reali, poi superare staging, restore e carico 100 tenant. Solo dopo quei cancelli la dicitura “Premium affidabile per 100 ristoranti” diventa difendibile.
