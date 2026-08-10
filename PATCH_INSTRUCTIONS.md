# Come applicare i file modificati

Questa ZIP contiene soltanto i file aggiunti o modificati, già organizzati con gli stessi percorsi del progetto EasyMenu.

1. Fai una copia di sicurezza del progetto attuale.
2. Estrai il contenuto della ZIP nella cartella principale del progetto.
3. Conferma la sostituzione dei file esistenti.
4. Non eliminare gli altri file del progetto: questa non è una ZIP completa.

Poi esegui:

```bash
npm ci
npm run lint -- --max-warnings=0
npm run build
cd backend
npm ci
node --test tests/translation.test.js tests/table-payments-coming-soon.test.js
```

Mantieni `PUBLIC_TABLE_PAYMENTS_ENABLED=false` finché i pagamenti dal tavolo non saranno pronti.

IT, EN, DE, ES e RU funzionano senza servizi esterni. `GOOGLE_TRANSLATE_API_KEY` è opzionale e serve soltanto per le altre lingue della landing e della demo.
