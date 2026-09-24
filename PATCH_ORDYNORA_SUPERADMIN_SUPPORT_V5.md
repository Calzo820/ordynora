# Ordynora — correzione accesso assistenza Super Admin V5

## Problema risolto

Premendo **Apri supporto**, il backend generava correttamente un token limitato al
ristorante scelto. Il middleware confrontava però quel `restaurantId` con il
ristorante associato all'account piattaforma del Super Admin. Il confronto
falliva con `401`, il refresh ripristinava il token piattaforma e la dashboard
del ristorante non veniva aperta.

## Correzione

- Il token di assistenza viene validato come sessione distinta.
- Il Super Admin deve essere ancora attivo e presente in `SUPER_ADMIN_EMAILS`.
- `userId`, `platformUserId` ed email devono coincidere con l'account autenticato.
- Il `restaurantId` rimane quello del ristorante selezionato.
- I token normali non possono cambiare tenant.
- La sessione piattaforma viene salvata prima dell'accesso e ripristinata dal
  comando **Torna a Super Admin**.
- All'uscita vengono eliminati nome, slug e identificativo del ristorante
  visitato, evitando che rimangano dati del tenant precedente.
- Se lo snapshot locale è danneggiato, la sessione locale viene azzerata e il
  cookie di refresh può ricostruire in sicurezza l'accesso piattaforma.

## File principali

- `backend/middleware/auth.middleware.js`
- `src/lib/superAdminSession.js`
- `src/pages/SuperAdmin.jsx`
- `src/pages/Dashboard.jsx`
- `src/components/Navbar.jsx`
- `src/lib/session.js`

## Verifica manuale dopo il deploy

1. Accedi a `/super-admin`.
2. Scegli un ristorante e premi **Apri supporto**.
3. Inserisci un motivo di almeno 8 caratteri.
4. Verifica l'apertura di `/dashboard` con il nome del ristorante scelto.
5. Verifica il banner **Modalità assistenza SuperAdmin**.
6. Premi **Torna a Super Admin** e controlla il ritorno alla lista ristoranti.
7. Ripeti con un secondo ristorante per verificare l'assenza di dati residui.

La correzione richiede il deploy sia del backend Render sia del frontend Vercel.
