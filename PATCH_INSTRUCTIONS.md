# Come applicare la patch

1. Apri la cartella del progetto Ordynora.
2. Copia le cartelle/file di questa ZIP sopra il progetto esistente, mantenendo le stesse path.
3. Conferma la sostituzione dei file.
4. Esegui:

```bash
npm run lint -- --max-warnings=0
npm run build
cd backend
npm run check:env
```

5. Se tutto passa:

```bash
git add .
git commit -m "Ordynora: surprise hardening, PWA, ruoli e responsive"
git push origin main
```
