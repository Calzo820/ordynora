# Ordynora V14 — completamento programmazione integrazioni

Data verifica: 5 novembre 2026

## Base della patch

Questa è una patch **cumulativa** applicabile direttamente a `ristorantee (42).zip`. Comprende già V11, V12, V13 e tutte le correzioni V14: non installare prima le patch precedenti.

La ZIP contiene soltanto file nuovi o modificati. Non include `.env`, credenziali, token, chiavi API, `.git`, `node_modules` o `dist`.

## Cosa chiude la V14

### Cassa in Cloud

- Il test della chiave verifica anche i punti vendita con licenza API attiva.
- Se esiste un solo punto vendita viene selezionato automaticamente; se sono più di uno il ristoratore deve scegliere quello corretto.
- Un ID punto vendita non appartenente alla chiave viene rifiutato prima dell'attivazione.
- Ogni prodotto usa la sua vera `idProductVariant`, richiesta anche per i prodotti semplici.
- Prodotti senza variante, reparto o IVA completi non possono essere abbinati per errore.
- Lo sconto viene inviato come variazione negativa sul subtotale, non come maggiorazione sulle singole righe.
- Date e scadenze sono inviate in epoch millisecondi, come previsto dal contratto API.
- I token temporanei sono riutilizzati in sicurezza, rinnovati automaticamente dopo un `401` e condivisi tra richieste simultanee.
- Ricerca e riconciliazione impediscono di ricreare una comanda già esportata.

### Tilby

- Il test verifica l'identità del punto vendita e blocca l'attivazione se l'accesso alle vendite non è abilitato.
- Menu, reparto, IVA, sala e tavolo devono contenere tutti i dati tecnici richiesti.
- La vendita usa UUID deterministici: retry e riavvii non creano righe duplicate.
- Le aggiunte al tavolo aggiornano la stessa vendita aperta.
- Gli errori del provider vengono tradotti in messaggi utili senza restituire token o chiavi.

### Attivazione e mappature

- Non basta più che esista una riga di mappatura: Ordynora controlla che i metadati tecnici siano davvero completi.
- La schermata mostra quali abbinamenti sono incompleti e perché.
- Le voci remote non più valide vengono escluse dal salvataggio.
- Cambiando account, API key o punto vendita, le vecchie mappature vengono eliminate solo dopo aver verificato che non esistano invii incerti o tavoli ancora aperti.
- La sincronizzazione resta in pausa finché connessione, prodotti e tavoli non sono tutti pronti.

### Carico e affidabilità

- Le richieste simultanee dello stesso ristorante condividono token e caricamento catalogo.
- Il catalogo remoto resta in cache per 120 secondi, configurabili, riducendo chiamate e rischio di rate limit.
- Retry, backoff, lock del worker, fencing token, riconciliazione e coda persistente restano quelli della V13.
- È disponibile `npm run test:integrations` per verificare velocemente tutti i connettori.

## Configurazione Render

La variabile obbligatoria resta:

```text
INTEGRATION_ENCRYPTION_KEY=<64 caratteri esadecimali>
```

Nel campo Value inserisci **solo** i 64 caratteri generati, senza nome della variabile, virgolette o `=` finale.

Generazione PowerShell:

```powershell
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

`render.yaml` aggiunge anche:

```text
INTEGRATION_DISCOVERY_CACHE_MS=120000
```

Il valore predefinito va bene per la produzione. Non mettere mai API key o token nel repository.

## Deploy

1. Fai una copia della cartella del progetto.
2. Estrai la ZIP nella cartella che contiene `package.json` e accetta la sovrascrittura.
3. Dal terminale PowerShell esegui:

```powershell
npm install
cd backend
npm install
npx prisma validate
cd ..
npm run verify
git add .
git commit -m "Completa connettori Ordynora V14"
git push origin main
```

Render esegue già le migrazioni Prisma al deploy. Non eseguire SQL manuale.

## Collaudo finale con credenziali reali

1. In Render configura `INTEGRATION_ENCRYPTION_KEY` e attendi il deploy.
2. Entra come proprietario e apri **Gestionale**.
3. Scegli Tilby o Cassa in Cloud, inserisci le credenziali ufficiali e usa **Prova connessione**.
4. Per Cassa in Cloud scegli il punto vendita corretto e verifica con il fornitore che gli ordini esterni siano abilitati su quel punto vendita.
5. Abbina o importa menu e tavoli; abbina anche il coperto se il ristorante lo usa.
6. Premi **Attiva**.
7. Prova sullo stesso tavolo due ordini da telefoni diversi, aggiunte successive, uno sconto, richiesta conto e chiusura.
8. Controlla nel gestionale che esista una sola vendita con righe, quantità, sconto e totale corretti.
9. Ripeti una sincronizzazione e riavvia Render: non deve comparire una seconda vendita.

## Cosa non può essere completato senza il provider

Il perimetro programmabile dei connettori Tilby e Cassa in Cloud è chiuso. Restano esterni al codice:

- credenziali sandbox o produzione rilasciate al ristorante/partner;
- permessi vendite e configurazione ordini esterni sul punto vendita;
- eventuale procedura di certificazione o approvazione commerciale del provider;
- collaudo su una cassa reale e conferma scritta del risultato.

Non presentare il connettore come “certificato” finché questo collaudo non è stato completato. Un rifiuto reale del provider ora resta visibile nella coda con un messaggio diagnostico sicuro.

## Verifiche automatiche superate

- lint completo;
- build Vite di produzione;
- schema Prisma valido;
- 38 test frontend superati;
- 76 test backend superati;
- 114 test automatici totali;
- controlli sintattici Node sui connettori;
- nessun segreto incluso nella patch.
