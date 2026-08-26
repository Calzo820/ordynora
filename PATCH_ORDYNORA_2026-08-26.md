# Patch Ordynora - 26 agosto 2026

Questa cartella contiene soltanto i file nuovi o modificati rispetto alla versione `ristorantee (36).zip`.

## Applicazione

1. Fai una copia di sicurezza del progetto.
2. Estrai la ZIP nella cartella principale di Ordynora e conferma la sovrascrittura dei file esistenti.
3. Non sostituire i tuoi file `.env`: non sono inclusi nella patch.
4. Installa le dipendenze e verifica:

```bash
npm install
cd backend
npm install
cd ..
npm run verify
```

## Miglioramenti principali

- Gli ordini offline non vengono più eliminati dopo i tentativi falliti: restano visibili e possono essere reinviati.
- Corretto l'evento di sincronizzazione rimasto con il nome EasyMenu.
- Separati i limiti delle API pubbliche: il polling dello stato ordine non viene più bloccato dal limite di creazione ordini.
- Gli endpoint pubblici accettano solo il token pubblico e non l'ID interno dell'ordine.
- Ruoli centralizzati e vecchi middleware resi sicuri: un header `role` non può più autorizzare richieste.
- Logout collegato alla revoca della sessione server e access token predefinito ridotto a 15 minuti.
- Token Socket.IO rimosso dalla query URL e aggiornato automaticamente in riconnessione.
- Suono comande generato localmente, senza dipendenza da un file Google esterno.
- Corretto il branding visibile e usata l'icona Ordynora leggera al posto del vecchio logo EasyMenu.
- Aggiunto controllo aggiornamenti PWA con scelta esplicita del momento di refresh.
- Migliorati cache del service worker, pagina offline e installazione degli aggiornamenti.
- Aggiunto `vercel.json` per deep link Vite, header di sicurezza e aggiornamento corretto del service worker.
- Le API inesistenti restituiscono JSON 404 e non più `index.html` con stato 200.
- JSON non valido gestito come errore client 400.
- Header di sicurezza, cache API `no-store`, CORS normalizzato e rate limit con pulizia memoria.
- Prisma reso portabile tra sviluppo Windows e deploy Linux.
- Aggiunti test per ruoli, routing API e coda offline.

## Verifiche eseguite

- ESLint: superato.
- Build Vite di produzione: superata.
- Test frontend: 2/2 superati.
- Test backend: 21/21 superati.
- Audit npm frontend e backend: 0 vulnerabilità note.

## Commit suggerito

```text
Ordynora: hardening sicurezza, ordini offline e aggiornamenti PWA
```
