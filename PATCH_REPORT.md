# Ordynora — Patch report pre-vendita

Data: 13 agosto 2026

## Base usata

- Base completa: `EasyMenu-aggiornato.zip` (9 agosto 2026), la versione completa più recente disponibile nell'ambiente.
- Integrato il pacchetto incrementale `EasyMenu-solo-file-modificati.zip` (10 agosto 2026).
- L'archivio richiesto `/mnt/data/ristorantee (32).zip` non era disponibile.

## PWA e installazione

- Centralizzata la cattura di `beforeinstallprompt` in un provider globale: la possibilità di installare non dipende più dalla visibilità del banner.
- La chiusura del banner vale soltanto per la sessione corrente e non elimina la possibilità di installazione.
- Aggiunta la voce persistente **Installa l'app** nella navbar per tutti i ruoli autenticati.
- Gestiti i casi Android/desktop, iOS/iPadOS con istruzioni manuali e lo stato già installato.
- Aggiornati manifest, titolo pagina e metadati visibili a **Ordynora**.

## Ruoli e permessi

- Corretto l'accesso Bar nella navbar per owner/admin, già previsto da route frontend e backend.
- Verificato l'allineamento di owner, admin, kitchen, bar, cashier e waiter sulle schermate principali.
- Rafforzato `requireAuth`: ogni richiesta protetta ricontrolla nel database esistenza, stato attivo, ristorante e ruolo corrente.
- Disattivazioni e cambi ruolo diventano quindi effettivi subito, anche se il vecchio JWT non è ancora scaduto.
- Conservati i vincoli owner-only per riapertura conti/cassa ed eliminazione account/esportazione dati.
- Conservata la separazione per ristorante e il blocco dei dati privati durante impersonificazione SuperAdmin.

## Responsività

- Confermate le regole specifiche già presenti per landing, demo, autenticazione, dashboard, menu cliente, onboarding, amministrazione, cucina/bar/cassa/tavoli, QR, report e SuperAdmin.
- Aggiunta una rete di sicurezza condivisa per immagini, SVG, form, tabelle, shell e dialog.
- Rafforzati i layout tablet (721–1180 px), wrapping delle toolbar su mobile, dialog entro viewport e contenitori tabellari scorrevoli.
- Mantenuti i layout operativi a touch target ampi e navigazione laterale adattiva.

## Coerenza e funzioni non pronte

- Uniformato il marchio visibile da EasyMenu a **Ordynora** nelle schermate React, lasciando invariati identificatori tecnici/storage e password demo per compatibilità.
- Pagamento online dal tavolo resta indicato come disponibile presto ed è bloccato anche lato server.
- Integrato il precedente consolidamento multilingua IT/EN/DE/ES/RU per landing e demo.
- Corretti caratteri danneggiati emersi durante la normalizzazione dei testi.

## Dipendenze e sicurezza

- Aggiornati lockfile frontend e backend con versioni compatibili tramite audit fix.
- Audit frontend dopo l'aggiornamento: 0 vulnerabilità.
- Audit backend dopo l'aggiornamento: 0 vulnerabilità.
- Nessun `npm audit fix --force` eseguito; non sono stati introdotti aggiornamenti forzati incompatibili.

## Verifiche eseguite

- `npm run lint -- --max-warnings=0`: superato, 0 errori e 0 warning.
- `npm run build`: superato con Vite 8.2.1, 132 moduli trasformati.
- Controllo sintattico middleware autenticazione: superato.
- Test traduzioni: 3/3 superati.
- Test blocco pagamenti tavolo/Stripe Connect: 4/4 superati.
- Totale test mirati: 7 superati, 0 falliti.
- Manifest PWA: JSON valido.
- Scansione caratteri corrotti nei sorgenti UI: nessuna occorrenza residua.

## Note operative

- Il progetto dichiara Node.js 20; i controlli locali sono stati eseguiti con Node.js 24.14.0, producendo il solo avviso `EBADENGINE` durante l'installazione.
- Il pacchetto finale esclude `node_modules`, `dist`, file `.env` reali e cache locali.
- Prima della vendita restano necessari test manuali su dispositivi reali, configurazione ambiente di produzione, migrazioni database, controllo legale dei documenti e prova completa con un ristorante pilota.
