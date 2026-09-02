# Ordynora — patch staff, PWA, ruoli e mobile

Questa patch parte dalla versione `ristorantee (39).zip` e contiene soltanto i file aggiunti o modificati per questo intervento.

## Cosa cambia

- Il link `/staff?restaurant=codice-locale` ora viene letto correttamente e salva subito il codice ristorante.
- Un dispositivo staff già autenticato prova a ripristinare la sessione sicura e riapre direttamente Sala, Cucina, Bar, Cassa o Dashboard.
- L'accesso PIN può ricordare il dispositivo; la durata predefinita consigliata è 90 giorni.
- La pagina staff ha sempre un comando visibile per installare Ordynora, anche dopo la chiusura del banner iniziale.
- La PWA apre `/staff`, ha un identificatore stabile e scorciatoie per le postazioni operative.
- Il titolare può cambiare ruolo e PIN dalla sezione **Staff e ruoli**.
- Cambio di ruolo, PIN, email o disattivazione revocano le vecchie sessioni dell'utente.
- Gli utenti con solo PIN non possono ricevere per errore un ruolo incompatibile.
- Il logout dello staff torna all'accesso PIN del ristorante memorizzato; quello del titolare torna al login email.
- Nuovo livello responsive finale per telefono, tablet, desktop, schermi piccoli e landscape.

## Configurazione produzione

Nel servizio backend aggiungere:

```env
SESSION_DAYS=14
STAFF_SESSION_DAYS=90
```

La PWA richiede HTTPS. Frontend e API devono mantenere `credentials: include`; usare domini coerenti come `ordynora.com` e `api.ordynora.com` evita problemi con i cookie sicuri sui browser mobili.

## Pubblicazione con Git

Dopo aver estratto lo ZIP nella cartella principale del progetto:

```bash
git add PATCH_ORDYNORA_STAFF_PWA_MOBILE.md backend/.env.example backend/.env.postgres.example backend/.env.production.example backend/controllers/auth.controller.js backend/controllers/user.controller.js backend/lib/session.js backend/tests/session-duration.test.js public/app.webmanifest public/sw.js src/components/AppInstallPrompt.jsx src/components/Navbar.jsx src/components/ProtectedRoute.jsx src/lib/staffDevice.js src/main.jsx src/pages/AdminPanel.jsx src/pages/StaffAccess.jsx src/styles/mobile-experience-v3.css tests/staff-device.test.js
git commit -m "Migliora app staff, ruoli e responsive mobile"
git push origin main
```

Sul provider del backend impostare anche `STAFF_SESSION_DAYS=90` e avviare un nuovo deploy.

## Verifica rapida su dispositivi reali

1. Dal pannello titolare copiare il link **App staff** e aprirlo sul telefono.
2. Installare Ordynora dalla pagina staff.
3. Accedere con un PIN e lasciare attivo **Mantieni collegato questo dispositivo**.
4. Chiudere completamente l'app e riaprirla: deve entrare nella postazione del ruolo senza richiedere di nuovo codice e PIN.
5. Cambiare il ruolo o il PIN dal pannello titolare: il dispositivo precedente deve richiedere una nuova autenticazione entro la scadenza del token breve.

## Controlli automatici eseguiti

- ESLint completo: superato.
- Test frontend: 5/5 superati.
- Test backend: 29/29 superati.
- Manifest PWA: JSON valido.

La build locale non è stata eseguita perché lo ZIP ricevuto contiene `node_modules` generato per Windows, mentre l'ambiente di verifica è Linux. In deploy, una normale installazione pulita delle dipendenze genera automaticamente i binari corretti per il server.
