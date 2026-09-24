# Ordynora — patch V4 resilienza operativa

## Problemi risolti

- Un errore temporaneo `500`, `503`, `429`, timeout o rete non cancella più la sessione dello staff.
- La schermata di indisponibilità controlla automaticamente backend e database fino a sei volte.
- Quando `/ready` conferma database connesso, la postazione si riapre senza richiedere un nuovo login.
- I messaggi distinguono dispositivo offline, server lento e servizio in recupero.
- La landing risveglia il backend in anticipo, senza bloccare la pagina.
- La pagina offline della PWA descrive correttamente la coda ordini e si riapre al ritorno della rete.
- Cache PWA aggiornata a `ordynora-shell-v5`.
- Aggiornata `qs` alla versione `6.16.0`, correggendo due vulnerabilità moderate denial-of-service.

## Verifiche superate

- ESLint;
- build Vite production;
- 24/24 test frontend;
- 34/34 test backend;
- schema Prisma valido;
- audit dipendenze frontend: 0 vulnerabilità note;
- audit dipendenze backend: 0 vulnerabilità note;
- controllo integrità Git diff.

## Deploy

Da PowerShell nella cartella del progetto:

```powershell
npm install
cd backend
npm install
cd ..
npm run verify

git add README.md package.json render.yaml backend public src tests *.md
git commit -m "Migliora recupero servizio sicurezza e PWA Ordynora"
git push origin main
```

Vercel deve distribuire il nuovo service worker; Render userà Node 22 e applicherà le migrazioni già incluse.

## Controllo dopo il deploy

1. Aprire `https://ordynora.com/app.webmanifest` e `https://ordynora.com/sw.js`.
2. Verificare `/health` e `/ready` sul backend.
3. Accedere come staff, spegnere la rete e verificare il messaggio offline.
4. Riattivare la rete e controllare che Ordynora rientri automaticamente.
5. Simulare un backend non raggiungibile su staging e verificare che la sessione non venga eliminata.
