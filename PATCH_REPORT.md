# Ordynora Surprise Hardening Patch

Patch preparata sull'ultima ZIP caricata: `ristorantee (35).zip`.

## Obiettivo

Ho fatto un controllo tecnico esteso e ho rinforzato i punti deboli che potevano creare problemi reali prima della vendita o durante una demo con ristoratori.

## Migliorie applicate

### 1. Stabilità app / crash protection
- Aggiunto `AppErrorBoundary`.
- Se una pagina React va in errore, l'utente vede una schermata Ordynora pulita invece di una pagina bianca.
- Aggiunti pulsanti `Ricarica` e `Torna alla home`.

### 2. Multilingua: fix critico provider
- `main.jsx` ora avvolge l'app con `LocaleProvider`.
- Questo evita crash nelle pagine che usano `useLocale` o `useTranslatedContent`.
- Aggiornata la chiave lingua da `easymenu_locale` a `ordynora_locale`, mantenendo migrazione dalla vecchia chiave.

### 3. PWA / installazione app
- Rafforzata la notifica installazione.
- La notifica può essere chiusa senza perdere la possibilità di installare l'app.
- Il bottone installazione in sidebar/impostazioni resta il punto di recupero.
- Estesi i percorsi dove il prompt può apparire: home, demo, register, login e aree operative.

### 4. Manifest e service worker
- Aggiornati i riferimenti icone PWA da `easymenu-*` a `ordynora-*`.
- Aggiornato `index.html` con favicon Ordynora.
- Incrementata la cache service worker a `ordynora-shell-v2`, così i client non restano bloccati su asset vecchi.

### 5. Ruoli e permessi
- `ProtectedRoute` ora usa le funzioni centralizzate di `roles.js`.
- I ruoli vengono normalizzati con alias coerenti.
- Se un utente entra in una pagina non consentita, viene mandato alla home corretta per il suo ruolo invece che sempre al login.
- Ridotto il rischio di falsi blocchi per ruoli come `cucina/kitchen`, `cassa/cashier`, `sala/waiter`.

### 6. Responsive e UX cross-device
- Aggiunto `surprise-polish.css`.
- Rinforzati layout per PC, tablet e telefono.
- Migliorati safe-area mobile, focus accessibile, card prezzo, sidebar, CTA, errore app, tab orizzontali, tabelle/cards su schermi piccoli.
- Migliorata leggibilità di testi lunghi con `overflow-wrap`.
- Migliorate interazioni touch e focus-visible.

### 7. Naming Ordynora
- Aggiornati cache key e riferimenti PWA principali verso Ordynora.
- Lasciati intatti solo elementi legacy tecnici dove servono per recuperare dati salvati in vecchie versioni.

## File modificati o aggiunti

- `src/main.jsx`
- `src/components/AppErrorBoundary.jsx`
- `src/components/AppInstallPrompt.jsx`
- `src/components/ProtectedRoute.jsx`
- `src/context/LocaleContext.jsx`
- `src/lib/i18n.js`
- `src/styles/surprise-polish.css`
- `public/app.webmanifest`
- `public/sw.js`
- `index.html`

## Test effettuati

### Frontend lint
`npm run lint -- --max-warnings=0`

Risultato: PASSATO.

### Backend env check
`cd backend && npm run check:env`

Risultato: PASSATO.

### Build
`npm run build`

Risultato: NON completabile nel sandbox perché la ZIP contiene `node_modules` generato su Windows e nel sandbox Linux manca il binding nativo Rolldown `@rolldown/binding-linux-x64-gnu`.

Questo non è un errore introdotto dalla patch. Sul PC/Render va rilanciato dopo reinstall dipendenze:

```bash
rm -rf node_modules package-lock.json
npm install
npm run build
```

Su Windows puoi fare semplicemente:

```powershell
npm install
npm run build
```

## Comandi consigliati dopo aver applicato la patch

```bash
npm run lint -- --max-warnings=0
npm run build
cd backend
npm run check:env
```

Poi:

```bash
git add .
git commit -m "Ordynora: surprise hardening, PWA, ruoli e responsive"
git push origin main
```

## Nota finale

Questa patch non riscrive tutto il prodotto: rafforza i punti più fragili e rende Ordynora più solido da mostrare a un ristoratore.
