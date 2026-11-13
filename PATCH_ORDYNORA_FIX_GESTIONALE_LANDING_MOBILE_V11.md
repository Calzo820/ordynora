# Patch Ordynora V11 — Gestionale e landing mobile

## Correzioni

- Risolto il crash iniziale della pagina **Gestionale collegato**: lo stato vuoto non viene più interpretato come integrazione attiva.
- Aggiunti test di regressione per integrazione assente, disabilitata e collegata.
- Landing mobile riallineata alla gerarchia desktop senza ridurre artificialmente l'intera pagina.
- Header mobile compatto con menu apribile, selettore lingua e collegamenti completi.
- Hero più vicino alla versione PC: foto a destra, testo a sinistra, CTA principale e azioni secondarie compatte.
- Le schede successive scorrono orizzontalmente su telefono, evitando una pagina eccessivamente lunga.
- Il suggerimento di installazione PWA non copre più la CTA della landing; resta disponibile nelle pagine dell'app.

## Installazione

Estrarre la ZIP nella cartella principale del progetto, sovrascrivendo i file, poi eseguire:

```powershell
cd C:\dev\ristorantee
git add src tests PATCH_ORDYNORA_FIX_GESTIONALE_LANDING_MOBILE_V11.md
git commit -m "Corregge gestionale e rinnova landing mobile"
git push origin main
```

Vercel aggiornerà la landing. Il backend non richiede una nuova migrazione per questa patch.

## Controlli dopo il deploy

1. Accedere come owner e aprire **Gestionale collegato**: la pagina deve caricarsi anche senza integrazione salvata.
2. Aprire `ordynora.com` da telefono: in alto devono comparire logo e pulsante Menu sulla stessa riga.
3. Aprire il Menu e verificare Demo, Privacy, Login, lingua e Parla con noi.
4. Verificare che nessun banner di installazione copra i pulsanti della landing.
5. Se il telefono mostra ancora la versione precedente, chiudere e riaprire la PWA oppure ricaricare la pagina per applicare il nuovo service worker.

## Verifica tecnica

- ESLint superato.
- Build Vite di produzione superata.
- 38 test frontend superati.
- 54 test backend superati.
