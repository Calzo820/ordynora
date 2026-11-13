# Ordynora V15 — hardening operativo e sicurezza

Verificata il 6 novembre 2026. Questa patch è cumulativa: include V11, V12, V13 e V14 ed è applicabile direttamente al progetto di `ristorantee (42).zip`. Si può applicare anche sopra la V14, senza installare altre patch intermedie.

La ZIP contiene solo file nuovi/modificati, non il progetto completo. Prima di sovrascrivere fai una copia del progetto e confronta eventuali modifiche locali successive. I file `.env` restano tuoi e non vengono sostituiti.

## Problemi corretti

### Un solo invio per tavolo, anche con più worker

Nella V14 il blocco dell'entità dipendeva anche da uno stato visibile che poteva passare da “processing” a “queued” quando arrivava una nuova comanda. La V15 protegge il vero lavoro in corso con un indice univoco parziale PostgreSQL: un solo job `processing` per integrazione ed entità.

- La protezione vale tra processi/istanze backend diverse.
- Ogni richiesta al provider rinnova e ricontrolla il proprio lease prima di partire.
- Il vecchio worker che ha perso il lease non può inviare altre richieste né confermare mappature/stati.
- Una revisione obsoleta non sovrascrive una revisione più recente già conclusa.
- La conclusione di un invio non segna “sincronizzata” una nuova revisione ancora in coda.
- Le revisioni intermedie mai tentate vengono accorpate; un tavolo molto attivo non riempie inutilmente la finestra del worker.
- I job in pausa non consumano tentativi automatici.

### Conti e gestionali

- Tilby: vendite chiuse, archiviate, con pagamenti o documenti vengono bloccate prima di qualsiasi aggiornamento o cancellazione. Ordynora non cerca di riaprirle.
- Tilby: un HTTP 201 senza ID vendita non basta più per confermare il successo; il retry riconcilia l'UUID deterministico.
- Cassa in Cloud: mettere in pausa non sblocca la modifica di un conto già esportato.
- Cambi account/punto vendita, disconnessioni e modifiche agli abbinamenti attendono che gli invii in corso siano conclusi.
- Un test connessione avviato con vecchie credenziali non può ripristinare una configurazione più recente.
- La verifica di tavoli ancora collegati controlla tutte le mappature, non solo le prime 1.000.
- Non si torna alla cassa interna finché ci sono invii incerti o tavoli ancora aperti già collegati al gestionale esterno.

### Ordini QR sullo stesso tavolo

- La creazione ordine blocca la riga del tavolo per la durata della transazione: due telefoni non aprono due sessioni iniziali indipendenti.
- La chiave anti-duplicato viene controllata prima di aprire una nuova sessione.
- Se il conto è in chiusura, un nuovo QR non apre un secondo conto: il cliente riceve un messaggio che invita a chiedere al cameriere.
- Se esistono già sessioni duplicate provenienti da vecchie versioni, Ordynora le segnala invece di unire o cancellare conti automaticamente.
- Anche chiusura conto, completamento operativo e richiesta conto usano il blocco del tavolo.
- Le modifiche commerciali ricontrollano l'ordine all'interno della transazione: una richiesta conto arrivata dopo la lettura iniziale della schermata non viene ignorata.

### Sicurezza e messaggi

- Aggiornate le dipendenze compatibili e i lockfile per correggere gli avvisi rilevati nell'audit, inclusi Express/body-parser e componenti dello strumento di build.
- Credenziali/API key e token eventualmente ripetuti dal provider nei messaggi d'errore vengono oscurati.
- Un HTTP 200 contenente HTML o JSON non valido non viene trattato come connessione riuscita.
- Cifratura credenziali: verifica esplicita del formato Base64 canonico, lunghezza IV e tag autenticato; errori non risolvibili con retry rimangono bloccati e visibili.

### Pagina Gestionale più chiara

- Elenco invii aggiornato ogni 8 secondi mentre la pagina è visibile; nessun polling continuo a scheda nascosta.
- Abbinamenti in sola lettura durante la sincronizzazione, con istruzione chiara per metterla in pausa.
- Il gestionale selezionato non eredita più lo stato “attivo” dell'altro connettore.
- Una revisione accorpata viene mostrata come “sostituita”, non come invio reale al provider.
- Coperto obbligatorio e voci facoltative hanno etichette distinte.

## Applicazione e pubblicazione

1. Fai una copia del progetto e un backup del database attraverso il tuo sistema di backup già configurato.
2. Estrai questa ZIP nella cartella che contiene `package.json` e `render.yaml`, accettando la sovrascrittura dei file corrispondenti.
3. Usa Node 22 e reinstalla anche i lockfile aggiornati:

```powershell
npm ci
npm --prefix backend ci --include=dev
npm run verify
```

4. Verifica la destinazione Git e aggiungi solo i file della patch:

```powershell
git remote -v
Get-Content .\PATCH_MANIFEST_V15.txt | ForEach-Object { git add -- $_ }
git diff --cached --stat
git commit -m "Rafforza affidabilita e sicurezza Ordynora V15"
git push origin main
```

Non eseguire il push se `origin` contiene ancora un URL di esempio o se l'elenco dei file da committare contiene modifiche che non vuoi pubblicare.

## Render: impostazioni da controllare

Se il servizio non è gestito automaticamente tramite Blueprint, apri **Settings** e verifica:

```text
Root Directory: backend
Build Command: npm ci --include=dev && npx prisma generate
Start Command: npm run start
Health Check Path: /ready
```

`npm run start` applica le migrazioni prima di avviare il server. La nuova migrazione `20261106120000_integration_exclusive_jobs` è necessaria: non avviare la V15 con il solo `node server.js` su un database non migrato.

La migrazione non elimina ordini o conti. Recupera gli eventuali lease doppi e crea l'indice esclusivo; durante la sua esecuzione le scritture sulla coda possono attendere brevemente. Pubblica fuori dal picco di servizio e verifica l'esito nei log Render.

Non sono richieste nuove chiavi. **Non cambiare `INTEGRATION_ENCRYPTION_KEY` se è già in uso:** deve restare quella con cui sono state cifrate le credenziali esistenti.

## Verifiche e limiti

- Lint e build di produzione superati.
- 39 test frontend e 118 backend: 157 test totali superati.
- Suite verificata anche con Node 22.
- Schema Prisma valido.
- Migrazione SQL e vincolo di esclusività verificati su PostgreSQL in memoria tramite PGlite (dipendenza solo di sviluppo).
- Audit npm frontend e backend: zero vulnerabilità note segnalate al momento del controllo. Non è una certificazione di sicurezza.
- Patch ricomposta e verificata a partire dalla ZIP 42.

Questi test non usano il database Neon di produzione, non effettuano pagamenti reali e non simulano 100 ristoranti reali su Render. Restano da eseguire il collaudo con credenziali ufficiali Tilby/Cassa in Cloud, una prova pilota completa e un test di carico su infrastruttura di staging. La V15 riduce rischi concreti, ma non autorizza a dichiarare assenza di bug o integrazione certificata.

## Prova pilota consigliata dopo il deploy

1. Apri `/ready`: backend e database devono risultare disponibili e il worker deve completare il primo polling.
2. Due telefoni inviano il primo ordine sullo stesso tavolo: una sessione, un coperto, due ticket cucina/bar.
3. Fai aggiunte mentre il primo invio è in corso: resta una sola vendita esterna e l'ultimo totale è quello corretto.
4. Chiedi il conto e prova un nuovo ordine QR: deve invitare a contattare il cameriere, senza aprire un secondo conto.
5. Chiudi/paga la vendita nel gestionale e prova una vecchia sincronizzazione: non deve riaprirla.
6. Metti in pausa, controlla gli abbinamenti e riprendi; verifica gli invii dalla pagina Gestionale.
