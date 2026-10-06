# Patch Ordynora V10 — due modalità operative

## Cosa cambia

- `full`: Ordynora completa per locali senza gestionale.
- `integrated`: Ordynora coordina il servizio; il gestionale esterno conserva cassa, pagamenti e fiscalità.
- Scelta guidata nella pagina Integrazioni.
- Cassa e funzioni economiche rimosse dalla UX integrata e bloccate anche dal backend.
- Nuovo comando operativo per liberare il tavolo dopo la chiusura nel gestionale.
- Dashboard, statistiche, storico, menu, onboarding, ruoli e pagina cliente adattati alla modalità.
- Migrazione sicura: ristoranti esistenti restano `full`; quelli con integrazione POS non disabilitata diventano `integrated`.

## Deploy

Il backend Render esegue già `prisma migrate deploy` nel build/start. Dopo aver copiato la patch:

```powershell
git add backend src tests docs PATCH_ORDYNORA_DUE_MODALITA_V10.md
git commit -m "Aggiunge modalità completa e con gestionale"
git push origin main
```

Poi controllare su Render che la migrazione `20261006100000_restaurant_operation_modes` risulti applicata e che `/ready` risponda con database connesso.

Per una verifica locale:

```powershell
npm install
cd backend
npm install
npx prisma generate
npx prisma migrate deploy
cd ..
npm run verify
```

## Variabile obbligatoria per salvare credenziali gestionali

Su Render deve essere presente una chiave casuale lunga e stabile:

```text
INTEGRATION_ENCRYPTION_KEY=<segreto casuale di almeno 32 byte>
```

Non sostituirla senza una procedura di rotazione: le credenziali già cifrate diventerebbero illeggibili.

## Smoke test manuale

### Modalità completa

1. Accedi come owner.
2. In Integrazioni seleziona **Ordynora completa**.
3. Crea un ordine QR, lavoralo in Cucina/Bar e segnalo servito.
4. Apri Cassa, registra il pagamento e chiudi.
5. Controlla storico, statistiche e chiusura giornaliera.

### Modalità con gestionale

1. Configura un provider nella pagina Integrazioni.
2. Verifica che il badge laterale dica **Operatività Ordynora · cassa esterna**.
3. Verifica che Cassa non sia nel menu; aprendo `/cassa` si viene rimandati a Tavoli.
4. Crea un ordine QR e completa cucina, bar e consegna.
5. Dalla Sala premi **Pagato nel gestionale · libera tavolo**.
6. Verifica che il tavolo diventi libero e che non esista una nuova `PaymentTransaction`.
7. Controlla che statistiche e registro mostrino quantità/tempi ma non incassi, pagamenti o margini.

### Test di sicurezza modalità

In modalità integrata verificare che questi endpoint rispondano `409`:

- `POST /orders/:id/payments`
- `PATCH /orders/:id/bill-settings`
- `POST /orders/:id/close`
- `/cash/*`
- `GET /payments/public/:token/receipt`
- `POST /payments/public/:token/checkout` quando i pagamenti pubblici sono abilitati

## Rollback

Il codice può essere riportato alla versione precedente, ma la migrazione aggiunge enum e colonne usati dai nuovi ordini. Non eliminare colonne o tipi direttamente in produzione. Per un rollback applicativo temporaneo impostare i ristoranti su `full`, mantenere lo schema e distribuire il codice precedente solo dopo aver verificato che non dipenda da una versione Prisma incompatibile.

## Confine commerciale onesto

Questa patch rende corretta la separazione del prodotto. Non certifica Ordynora come RT e non completa automaticamente l'export ordini verso tutti i fornitori. I tre connettori hanno percorsi e test credenziali, ma ogni sincronizzazione produzione va validata con API ufficiali, sandbox e pilota del singolo gestionale.
