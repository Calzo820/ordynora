# Ordynora V12 — connettori Tilby e Cassa in Cloud

Data verifica: 9 ottobre 2026

## Risultato

Questa patch completa il motore d'integrazione automatico di Ordynora per:

- **Tilby (Zucchetti):** crea una vendita aperta, la aggiorna durante il servizio e la elimina se l'ordine viene annullato prima della gestione fiscale.
- **Cassa in Cloud (TeamSystem):** invia una sola comanda consolidata quando viene chiesto il conto o il servizio viene completato; pagamento, scontrino, fattura e chiusura rimangono nel gestionale.

Ordynora continua a gestire menu QR, ordini, tavoli, sala, cucina, bar, portate, ruoli e tempi. In modalità integrata non duplica cassa e fiscalità.

## Cosa è già automatico

1. Il ristoratore sceglie Tilby o Cassa in Cloud.
2. Inserisce il token o l'API key richiesti dal provider.
3. Ordynora cifra il segreto con AES-256-GCM e non lo restituisce al browser.
4. Il test verifica credenziali e permessi senza creare ordini.
5. Ordynora legge prodotti e tavoli del gestionale.
6. Gli elementi con codice o nome identico vengono proposti automaticamente; gli altri si abbinano nella stessa pagina.
7. È possibile importare in modo non distruttivo prodotti e tavoli mancanti.
8. L'attivazione è impedita finché menu e tavoli attivi non sono mappati.
9. Gli eventi vengono salvati in una coda PostgreSQL con revisione e chiave di idempotenza.
10. Il worker usa claim atomici, lease recuperabili, retry esponenziale e rispetto di `Retry-After`.
11. Gli errori sono visibili nella pagina **Gestionale**, con riprova manuale dei soli casi bloccati.
12. Un invio incerto verso Cassa in Cloud blocca correzioni o annullamenti locali che potrebbero divergere dal gestionale.

## Comportamento dei due connettori

| Evento Ordynora | Tilby | Cassa in Cloud |
|---|---|---|
| Nuovo ordine | Crea vendita aperta | Non invia ancora |
| Cambio stato, articoli, extra, coperti o sconto | Aggiorna la stessa vendita | Non invia ancora |
| Annullamento | Elimina la vendita aperta | Annulla il job solo se non è mai partito; altrimenti chiede controllo nel POS |
| Richiesta conto | Aggiorna la vendita | Crea ordine esterno `TABLE` consolidato |
| Fine servizio | Ultimo aggiornamento operativo | Esporta se non era già stato esportato |
| Pagamento e documento fiscale | Nel POS Tilby | In Cassa in Cloud |

Per evitare duplicati:

- Tilby usa UUID deterministici per vendita e righe e aggiorna l'ID già riconciliato.
- Cassa in Cloud usa `externalId = ordynora:<orderId>`, cerca prima l'ordine remoto e salva l'ID restituito dal provider.
- Le revisioni più vecchie vengono superate da quelle nuove prima della scrittura remota.
- Una nuova modifica non può rimuovere il lock mentre un worker sta già inviando lo stesso ordine.

## Correzioni di compatibilità API incluse

- Tilby riceve sia i campi tavolo/sala sia l'array `tables` completo richiesto dalla vendita.
- Gli sconti globali Tilby vengono ripartiti nei `final_price` e nei netti delle righe.
- Gli aggiornamenti Tilby non rimandano campi di sola lettura della vendita.
- Cassa in Cloud distingue prodotti semplici (`idProduct`) e multivarianti (`idProductVariant`).
- Reparto, aliquota `rate`, posti disponibili e modalità di vendita facoltativa sono normalizzati correttamente.
- La paginazione Cassa in Cloud continua oltre i primi 100 prodotti.
- Le finestre data della riconciliazione usano millisecondi e restano inferiori a tre giorni.
- Lo sconto Ordynora viene tradotto in `percentageVariation` sulle righe Cassa in Cloud.
- Se esiste un solo punto vendita Cassa in Cloud viene selezionato e salvato automaticamente; se sono più di uno l'interfaccia chiede esplicitamente quale usare.

## Unica configurazione obbligatoria su Render

Nel servizio backend Render aprire **Environment** e aggiungere:

- **Key:** `INTEGRATION_ENCRYPTION_KEY`
- **Value:** una stringa esadecimale casuale di 64 caratteri

Per generarne una in PowerShell:

```powershell
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

Nel campo **Value** incollare soltanto il risultato: senza `INTEGRATION_ENCRYPTION_KEY=`, senza virgolette e senza spazi. Conservare la chiave in un password manager e non cambiarla dopo aver salvato credenziali dei ristoranti: una sostituzione non pianificata renderebbe illeggibili i segreti già cifrati.

Le altre variabili sono già dichiarate in `render.yaml`:

```text
INTEGRATION_WORKER_ENABLED=true
INTEGRATION_WORKER_INTERVAL_MS=2000
INTEGRATION_WORKER_CONCURRENCY=4
INTEGRATION_MAX_ATTEMPTS=8
INTEGRATION_HTTP_TIMEOUT_MS=15000
```

## Deploy

Dopo aver copiato i file e creato la variabile:

```powershell
git add -- backend/.env.example backend/.env.postgres.example backend/.env.production.example backend/controllers/integration.controller.js backend/controllers/order.controller.js backend/integrations/catalog.js backend/integrations/connectors.js backend/integrations/runtime.js backend/prisma/schema.prisma backend/prisma/migrations/20261007220000_integration_runtime/migration.sql backend/routes/integration.routes.js backend/server.js backend/services/integrationQueue.service.js backend/services/integrationWorker.service.js backend/tests/integration-catalog.test.js backend/tests/integration-queue-policy.test.js backend/tests/integration-runtime.test.js render.yaml src/lib/api.js src/pages/Integrazioni.jsx src/styles/integrations.css PATCH_ORDYNORA_CONNETTORI_FINALI_V12.md
git commit -m "Completa connettori Tilby e Cassa in Cloud"
git push origin main
```

Il deploy Render esegue già `prisma migrate deploy`. Al termine verificare:

```text
https://easymenu-backend-mh30.onrender.com/ready
```

La risposta deve avere `ok: true`, `database: "connected"` e `integrations: "worker_ready"`.

## Attivazione di un ristorante

1. Accedere come proprietario o amministratore.
2. Aprire **Gestionale**.
3. Scegliere **Tilby** oppure **Cassa in Cloud**.
4. Inserire le credenziali e salvare.
5. Premere **Prova connessione**.
6. Aprire **Menu e tavoli**.
7. Usare prima **Abbina esistenti**; poi correggere manualmente o usare **Importa menu e tavoli**.
8. Associare anche **Coperto** ed **Extra manuale** se il ristorante li utilizza.
9. Premere **Attiva**.
10. Creare un ordine di prova non fiscale e controllare la pagina **Invii al gestionale**.

## Ciò che non può essere inventato da Ordynora

Il codice è pronto, ma il primo collaudo reale richiede accessi ufficiali:

- **Tilby:** ingresso nel Developer Program, sandbox/token e certificazione dell'integrazione. Ogni token è legato a un solo negozio.
- **Cassa in Cloud:** licenza Retail Enterprise o Risto Enterprise, API key e scope concessi da TeamSystem.

Non serve una conferma manuale di Ordynora per ogni ordine. Dopo l'attivazione del singolo account, il flusso è automatico. Può invece essere necessario un passaggio commerciale/tecnico iniziale del provider per rilasciare o abilitare le credenziali.

## Collaudo finale con credenziali ufficiali

Prima del primo ristorante pagante eseguire in sandbox e poi su un punto vendita pilota:

- ordine con cucina e bar;
- due portate e modifica quantità;
- note, omaggio, extra, coperto e sconto;
- cambio tavolo se previsto dal gestionale;
- richiesta conto ripetuta;
- perdita rete prima e dopo la risposta del provider;
- risposta 429 e 5xx;
- riavvio Render durante un job;
- doppio click e due dispositivi contemporanei;
- annullamento prima dell'invio e tentativo di annullamento dopo un invio incerto;
- verifica che nel POS esista una sola vendita/comanda con importi e IVA corretti.

Se il provider restituisce una differenza di contratto specifica dell'account, lasciare la sincronizzazione in pausa e conservare ID job, ora, endpoint e codice risposta. Non reinserire o inviare token/API key in chat o nei log.

## Verifiche automatiche eseguite

- schema Prisma valido e client rigenerato;
- lint completo;
- build Vite di produzione;
- 38 test frontend superati;
- 66 test backend superati, inclusi cifratura, tenant, ruoli, connettori, prodotti semplici/multivarianti, paginazione, sconti, anti-duplicato e policy eventi;
- controllo sintattico dei file backend modificati;
- `git diff --check` senza errori di whitespace.

Il test end-to-end contro gestionali reali non è stato eseguito perché nel progetto non sono presenti credenziali sandbox ufficiali. È intenzionale: i segreti non vanno inseriti nella patch.

## File della patch V12

- `backend/integrations/catalog.js`
- `backend/integrations/connectors.js`
- `backend/integrations/runtime.js`
- `backend/services/integrationQueue.service.js`
- `backend/services/integrationWorker.service.js`
- `backend/controllers/integration.controller.js`
- `backend/controllers/order.controller.js`
- `backend/routes/integration.routes.js`
- `backend/server.js`
- `backend/prisma/schema.prisma`
- `backend/prisma/migrations/20261007220000_integration_runtime/migration.sql`
- `backend/.env.example`
- `backend/.env.postgres.example`
- `backend/.env.production.example`
- `render.yaml`
- `src/lib/api.js`
- `src/pages/Integrazioni.jsx`
- `src/styles/integrations.css`
- `backend/tests/integration-catalog.test.js`
- `backend/tests/integration-runtime.test.js`
- `backend/tests/integration-queue-policy.test.js`
- `PATCH_ORDYNORA_CONNETTORI_FINALI_V12.md`
