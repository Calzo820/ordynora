# Ordynora - patch scala 100 ristoranti

Questa patch rende piu solida la base multi-ristorante senza cambiare il flusso operativo gia esistente.

## Cosa cambia

- Console SuperAdmin paginata lato server: 25 ristoranti per pagina, ricerca per nome, slug e owner, filtri per stato e piano.
- Query SuperAdmin alleggerita: carica solo l'owner e i conteggi necessari, non tutto lo staff.
- Indici PostgreSQL multi-tenant per ordini, tavoli, sessioni, menu, prenotazioni, pagamenti, log e abbonamenti.
- Cache LRU breve e isolata per ristorante sui menu pubblici, con deduplicazione delle richieste simultanee.
- Invalidazione della cache dopo modifiche al menu o movimenti di scorta collegati agli ordini.
- Rendering progressivo delle liste dense e tabella SuperAdmin con intestazione fissa.
- Vista SuperAdmin mobile trasformata da tabella larga a schede leggibili.
- Rifinitura grafica comune per dashboard, cucina, bar, cassa, tavoli, menu cliente e responsive.
- Supporto `prefers-reduced-motion` e maggiore coerenza di focus, contrasti e touch target.

## Deploy

1. Copiare i file della patch mantenendo le cartelle.
2. Eseguire `npm install` nella root e in `backend` solo se mancano gia i moduli.
3. Eseguire `npx prisma generate --schema=backend/prisma/schema.prisma`.
4. Eseguire `npx prisma migrate deploy --schema=backend/prisma/schema.prisma`.
5. Eseguire `npm run verify`.
6. Pubblicare frontend e backend e controllare `/ready`.

Su Render lo script `start` del backend esegue gia `prisma migrate deploy` e `prisma generate` prima di avviare il server.

## Verifiche eseguite

- ESLint completo: superato.
- Build Vite di produzione: superata.
- Validazione schema Prisma: superata.
- Test frontend: 2/2 superati.
- Test backend: 26/26 superati.

## Nota sulla capacita

Il numero di ristoranti non e codificato come limite applicativo. Gli interventi rimuovono i principali colli di bottiglia prevedibili a 100 tenant; la capacita finale dipende comunque dal piano database, dal pooling PostgreSQL, dalle risorse Render e dal numero di ordini simultanei. In produzione usare l'URL pooled di Neon e monitorare latenza, connessioni e query lente.
