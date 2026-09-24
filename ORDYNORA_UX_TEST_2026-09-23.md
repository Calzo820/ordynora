# Ordynora — test completo e UX intuitiva

Data: 23 settembre 2026

## Risultato

La nuova interfaccia riduce i punti in cui un ristoratore o un membro dello staff deve indovinare il passo successivo, senza eliminare funzioni. Il percorso quotidiano è separato dalle configurazioni e ogni ruolo riceve istruzioni coerenti con il proprio lavoro.

## Migliorie applicate

### Primo accesso

- Guida iniziale di tre passaggi per owner, admin, cameriere, cucina, bar e cassa.
- La guida compare una sola volta per ruolo sul dispositivo e resta disponibile da **Come si usa**.
- Ogni passaggio porta direttamente alla schermata corretta.

### Navigazione

- Sezione **Servizio**: Sala e tavoli, Cucina, Bar, Cassa.
- Sezione **Gestione**: Dashboard, Menu e prodotti, Statistiche, Storico ordini.
- Impostazioni secondarie raccolte in un solo gruppo espandibile.
- Voci mostrate in base al ruolo, evitando schermate non utilizzabili.
- Sidebar fissa su desktop e a scomparsa su tablet/telefono.

### Azioni operative

- Cucina e bar: **Inizia preparazione** → **Segna pronto**.
- Sala: stato delle portate, chiamata della portata successiva e conferma consegna.
- Cassa: percorso visivo **Scegli tavolo** → **Controlla il conto** → **Incassa e chiudi**.
- Dashboard: accessi immediati a Sala, Cucina, Cassa e Menu.
- Gestione: schede sempre visibili per Menu, Tavoli, Staff e Impostazioni.

## Matrice di controllo

| Area | Controllo | Esito |
| --- | --- | --- |
| Login e ruoli | Guide e destinazioni per 6 ruoli | Superato |
| Navigazione | Funzioni operative separate dalla configurazione | Superato |
| Cliente | Carrello, portate, ordine e coda offline | Superato nei test automatici |
| Sala | Tavolo, stato comanda, portate e consegna | Superato nel codice e nei test di flusso |
| Cucina | Presa in carico, preparazione e pronto | Superato nel codice |
| Bar | Coda separata e pronto | Superato nel codice |
| Cassa | Selezione, conto, pagamento e chiusura | Superato nei test backend |
| Duplicati | Ordine, acconto e chiusura idempotenti | Superato nei test backend |
| Responsive | Breakpoint telefono, tablet e desktop nelle nuove viste | Superato in build e controllo CSS |
| Accessibilità base | Focus visibile, etichette, dialog e pulsanti disabilitati | Superato nel controllo statico |
| Build | Bundle Vite di produzione | Superato |
| Lint | Regole ESLint | Superato |
| Backend | Suite Node | 34/34 superati |
| Frontend | Suite Node | 24/24 superati |

## Percorso consigliato al ristoratore

1. **Prepara il locale**: setup guidato, menu, tavoli, QR e staff.
2. **Avvia il servizio**: usa Sala e tavoli come punto di partenza.
3. **Segui le comande**: Cucina e Bar mostrano solo ciò che va lavorato.
4. **Chiudi il conto**: Cassa ordina i tavoli per priorità.
5. **Controlla dopo il turno**: Dashboard, Statistiche e Storico.

## Prova umana ancora necessaria

I test automatici verificano regressioni, logica e build, ma non possono certificare da soli che una persona nuova capisca tutto senza aiuto. Prima della vendita Premium va svolto un pilot con almeno tre persone che non conoscono Ordynora:

- un titolare deve configurare menu, tavoli e staff in meno di 15 minuti;
- un cameriere deve trovare un tavolo, chiamare una portata e consegnare senza spiegazioni;
- cucina e bar devono completare una comanda al primo tentativo;
- la cassa deve chiudere un conto senza tornare indietro;
- tutti devono completare almeno il 90% dei compiti senza assistenza.

Il test E2E che scrive ordini e pagamenti reali resta intenzionalmente separato e protetto da `E2E_ALLOW_WRITE=true`: va eseguito soltanto su staging con database dedicato.

## Controllo dopo il deploy

1. Accedere una volta con ciascun ruolo e verificare la relativa guida.
2. Provare la navigazione a 390 px, 768 px, 1024 px e desktop.
3. Creare un ordine con una voce bar e due portate cucina.
4. Completare bar, chiamare la seconda portata dalla Sala e completare la cucina.
5. Confermare la consegna, chiedere il conto, incassare e chiudere.
6. Riaprire Dashboard e Storico e verificare che i dati siano coerenti.
