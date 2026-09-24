# Ordynora — Sprint V2 portate e coordinamento sala

## Cosa cambia

- Corretto un bug che eliminava `courseNumber` durante la validazione dell'ordine pubblico.
- La prima portata dell'ordine viene inviata subito ai reparti.
- Le portate successive restano trattenute finché owner, admin o cameriere non premono **Invia Nª portata** dalla vista Tavoli.
- Il backend impedisce di saltare una portata e tratta il doppio invio come operazione già eseguita.
- Cucina e bar vedono solo la portata attiva; completata una portata, quella successiva compare quando viene chiamata dalla sala.
- La mappa tavoli mostra la sequenza con stati: in attesa, inviata, in cucina, pronta.
- Layout adattivo per telefono, tablet e desktop.

## Deploy

Da PowerShell, nella cartella del progetto:

```powershell
git add README.md package.json render.yaml backend src tests ORDYNORA_PREMIUM_AUDIT_2026-09-23.md PATCH_ORDYNORA_PORTATE_V2.md
git commit -m "Aggiunge chiamata portate dalla sala e corregge flusso KDS"
git push origin main
```

Render applicherà automaticamente la nuova migrazione:

`backend/prisma/migrations/20260923183000_course_release_flow/migration.sql`

La migrazione marca come già inviate le righe degli ordini esistenti, evitando di nascondere comande aperte durante l'aggiornamento.

## Controllo dopo il deploy

1. Apri un ordine con almeno due portate.
2. Verifica che cucina/bar vedano soltanto la prima.
3. Da Tavoli apri il tavolo e premi **Invia 2ª portata**.
4. Verifica che la seconda compaia sul KDS e che un doppio tocco non invii la terza.
5. Completa cucina/bar, conferma la consegna, paga e chiudi il conto.

## Verifiche eseguite

- ESLint: superato.
- Build Vite production: superata.
- Test frontend: 24/24.
- Test backend: 34/34.
- Schema Prisma: valido.
