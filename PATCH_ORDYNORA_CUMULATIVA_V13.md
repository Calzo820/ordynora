# Ordynora V13 — patch cumulativa definitiva integrazioni

Data verifica: 18 ottobre 2026

## Base e modalità di applicazione

Questa patch è applicabile direttamente a **ristorantee (42).zip**. Include già le correzioni V11 e V12: non serve installare prima altre patch.

La ZIP contiene soltanto file nuovi o modificati. Non contiene `.env`, password, token, chiavi API, `.git`, `node_modules` o build `dist`.

1. Fai una copia della cartella del progetto.
2. Estrai la ZIP nella cartella principale, quella che contiene `package.json` e `render.yaml`.
3. Accetta la sovrascrittura dei file omonimi.
4. Esegui i comandi della sezione **Deploy**.

## Risultato della V13

### Due prodotti realmente separati

- **Ordynora completa:** menu, tavoli, cucina, bar, conto, pagamenti e chiusura interna.
- **Ordynora con gestionale:** Ordynora gestisce il servizio; Tilby o Cassa in Cloud gestiscono pagamento, scontrino, fattura e chiusura fiscale.
- Il solo salvataggio delle credenziali non disattiva più la cassa Ordynora.
- La modalità integrata si attiva soltanto dopo test connessione riuscito, mappature complete e pressione su **Attiva**.
- Tornando alla modalità completa, la sincronizzazione esterna viene messa automaticamente in pausa per evitare doppie registrazioni.

### Un tavolo, una sola vendita esterna

- Più ordini QR, più telefoni e aggiunte successive dello stesso tavolo rimangono ticket separati per cucina e bar.
- Per conto e gestionale vengono però aggregati in un'unica sessione tavolo.
- Coperto applicato una sola volta, totale cumulativo, pagamenti cumulativi e chiusura di tutte le comande della sessione.
- Tilby e Cassa in Cloud ricevono un'identità stabile basata sulla sessione tavolo: le aggiunte aggiornano la stessa vendita invece di crearne una nuova.
- La chiusura operativa con gestionale esterno è bloccata finché tutte le comande del tavolo non risultano servite.

### Affidabilità connettori

- Fencing tramite `lockToken`: un worker Render scaduto non può sovrascrivere il risultato di un worker nuovo.
- Recupero sicuro dei job rimasti in lavorazione dopo riavvio.
- Retry esponenziale e riconciliazione anti-duplicato.
- Ricerca paginata degli ordini Cassa in Cloud oltre i primi 100 risultati.
- Blocco del cambio/disconnessione gestionale quando esistono invii incerti o tavoli ancora aperti già collegati.
- Pulizia automatica dei job riusciti dopo 30 giorni; le mappature restano conservate.
- Il coperto diventa una mappatura obbligatoria quando è configurato come predefinito nel ristorante.

### Backup e monitoraggio

- Il backup cifrato include ora configurazioni, mappature e coda delle integrazioni.
- Il monitor controlla worker, coda in ritardo, job falliti/bloccati e presenza della chiave di cifratura quando esistono integrazioni attive.
- `/ready` distingue `worker_starting`, `worker_ready`, `worker_degraded` e `worker_disabled` senza rendere irraggiungibile il backend durante i primi secondi di avvio.

### Percorso iniziale più lineare

- Dopo il checkout compare il pulsante **Continua configurazione**.
- Il ristoratore completa profilo, tavoli, menu e QR, poi sceglie se usare Ordynora completa o collegare il gestionale.
- La pagina Gestionale resta caricabile anche senza integrazione configurata e mantiene la modalità completa fino all'attivazione reale.

## Configurazione obbligatoria su Render

Nel servizio backend, in **Environment**, aggiungi:

- Key: `INTEGRATION_ENCRYPTION_KEY`
- Value: una stringa esadecimale casuale di 64 caratteri

Generazione PowerShell:

```powershell
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

Nel campo Value va incollato soltanto il risultato, senza `INTEGRATION_ENCRYPTION_KEY=`, senza virgolette, senza spazi e senza un segno `=` finale. Conserva la chiave in un password manager e non ruotarla senza una migrazione dei segreti già cifrati.

`render.yaml` imposta automaticamente anche:

```text
INTEGRATION_WORKER_ENABLED=true
INTEGRATION_WORKER_INTERVAL_MS=2000
INTEGRATION_WORKER_CONCURRENCY=4
INTEGRATION_MAX_ATTEMPTS=8
INTEGRATION_HTTP_TIMEOUT_MS=15000
INTEGRATION_JOB_RETENTION_DAYS=30
```

## Deploy

Controlla prima che `origin` punti al repository GitHub reale:

```powershell
git remote -v
```

Poi:

```powershell
git add -- backend render.yaml src tests PATCH_ORDYNORA_FIX_GESTIONALE_LANDING_MOBILE_V11.md PATCH_ORDYNORA_CONNETTORI_FINALI_V12.md PATCH_ORDYNORA_CUMULATIVA_V13.md
git commit -m "Completa integrazioni e affidabilita Ordynora V13"
git push origin main
```

Render esegue già `prisma migrate deploy`. Non eseguire SQL a mano. Vercel pubblica il frontend dal branch `main`.

Al termine apri:

```text
https://easymenu-backend-mh30.onrender.com/ready
```

Dopo il primo ciclo del worker devono comparire:

```json
{
  "ok": true,
  "database": "connected",
  "integrations": "worker_ready"
}
```

Nei primissimi secondi è normale vedere `worker_starting`; se rimane così oltre un minuto, controlla i log Render.

## Primo collaudo per ristorante

1. Apri **Gestionale** come proprietario.
2. Scegli Tilby oppure Cassa in Cloud e inserisci le credenziali ufficiali del punto vendita.
3. Salva: Ordynora rimane ancora in modalità completa.
4. Esegui **Prova connessione**.
5. Abbina o importa menu e tavoli; abbina coperto ed extra quando usati.
6. Premi **Attiva**: solo ora la modalità diventa integrata.
7. In un tavolo prova due ordini da due telefoni diversi, cucina e bar, richiesta conto e chiusura operativa.
8. Nel gestionale verifica una sola vendita/comanda, con tutte le righe e il totale corretto.
9. Prova una perdita rete e un riavvio Render: non deve apparire un duplicato.

## Limite esterno non risolvibile con una patch

Il codice dei connettori è completo, ma il collaudo contrattuale finale richiede credenziali ufficiali/sandbox rilasciate da Tilby e TeamSystem per un esercente autorizzato. Non inserire token reali nel repository o in chat. Prima di vendere l'integrazione come certificata, esegui il test su un punto vendita pilota e conserva l'esito scritto del provider.

## Verifiche automatiche superate

- schema Prisma valido e client generato;
- lint completo;
- build Vite di produzione;
- 38 test frontend superati;
- 69 test backend superati;
- controlli sintattici Node sui servizi e controller modificati;
- nessun segreto incluso nella patch.
