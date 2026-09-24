# Ordynora — patch V3 interfaccia intuitiva

## Cosa contiene

- guida contestuale al primo accesso per ogni ruolo;
- menu organizzato tra Servizio, Gestione e Impostazioni;
- accessi rapidi dalla Dashboard;
- percorso guidato nella Cassa;
- testi operativi più chiari per Cucina e Bar;
- schede di gestione Menu, Tavoli, Staff e Impostazioni sempre riconoscibili;
- adattamenti specifici per telefono e tablet;
- 7 nuovi test sulle guide ruolo.

## Installazione

Da PowerShell, nella cartella del progetto:

```powershell
git add README.md package.json render.yaml backend src tests ORDYNORA_PREMIUM_AUDIT_2026-09-23.md ORDYNORA_UX_TEST_2026-09-23.md PATCH_ORDYNORA_PORTATE_V2.md PATCH_ORDYNORA_UX_V3.md
git commit -m "Rende Ordynora piu intuitivo su ogni dispositivo"
git push origin main
```

Render applicherà le migrazioni backend e Vercel ricostruirà il frontend. Dopo il deploy, aprire il sito in una finestra anonima o cancellare la chiave locale `ordynora_quick_guide_v1_<ruolo>` per rivedere la guida del primo accesso.

## Verifica locale

```powershell
npm install
cd backend
npm install
cd ..
npm run verify
```

Risultato atteso: lint e build superati, 24 test frontend e 34 test backend superati.
