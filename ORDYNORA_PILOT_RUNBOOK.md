# Ordynora — procedura pilot in un ristorante vero

Questa procedura serve per i primi 3 ristoranti e per almeno 10 servizi completi. Il pilot non deve essere svolto direttamente sull'ambiente di sviluppo.

## Il giorno prima

- Confermare che Render sia always-on e che Vercel e Render mostrino l'ultimo commit.
- Aprire `/health` e `/ready`: entrambi devono rispondere `200`; `/ready` deve indicare `database: connected`.
- Verificare ultimo backup esterno e data dell'ultima prova di ripristino.
- Controllare menu, prezzi, allergeni, coperti, tavoli e QR.
- Preparare almeno un telefono sala, un tablet cucina, uno bar e uno cassa, tutti caricati e con PWA aggiornata.
- Annotare un canale di assistenza e chi può decidere il passaggio temporaneo alla procedura manuale.

## Trenta minuti prima del servizio

1. Accedere con ogni ruolo e verificare che apra direttamente la postazione corretta.
2. Dal tavolo prova inviare un ordine con una bevanda e due portate cucina.
3. Completare la bevanda al bar.
4. Completare la prima portata, chiamare la seconda dalla Sala e completarla in cucina.
5. Segnare la consegna, richiedere il conto, stampare il preconto, incassare e chiudere.
6. Controllare che il tavolo torni libero e che ordine, pagamento e statistiche siano coerenti.
7. Verificare che la coda offline mostri zero ordini pendenti.

Se uno di questi passaggi fallisce, non iniziare il servizio QR finché la causa non è identificata.

## Durante il servizio

| Situazione | Azione immediata | Quando passare al fallback |
| --- | --- | --- |
| Socket disconnesso ma pagine aggiornate | Attendere il polling automatico e non ripetere la comanda | Se gli stati non cambiano entro 30 secondi |
| Telefono senza rete | Cambiare Wi-Fi/4G; non cancellare dati o reinstallare l'app | Se la rete non torna entro 2 minuti |
| Backend in recupero | Lasciare aperta la schermata: controlla `/ready` automaticamente | Se dopo 6 tentativi non rientra |
| Database non disponibile | Sospendere subito nuovi ordini QR | Sempre: usare la procedura manuale |
| Ordine in coda | Non reinviarlo da un secondo telefono | Se diventa “richiede un nuovo tentativo” |
| Doppio pagamento sospetto | Non chiudere nuovamente il conto; controllare storico e transazioni | Coinvolgere titolare/supporto |

Il fallback deve essere semplice: bloccare temporaneamente nuovi QR, usare comande manuali o il gestionale fiscale già presente e non promettere al cliente che Ordynora sostituisce il registratore telematico.

## Dopo il servizio

- Coda ordini pendenti e falliti: zero.
- Nessun tavolo occupato senza conto aperto corrispondente.
- Totale cassa Ordynora riconciliato con incassi reali e sistema fiscale.
- Errori irrisolti esaminati con request ID e orario.
- Tempi cucina/bar e passaggi più lenti annotati.
- Feedback separato di titolare, cameriere, cucina/bar e cassa.

## Criteri di successo dopo 10 servizi

- zero comande perse o duplicate;
- zero pagamenti duplicati;
- almeno il 90% delle attività completate senza assistenza;
- nessun logout causato da un errore temporaneo;
- coda offline sempre riconciliata;
- tempi di risposta accettabili nelle ore di punta;
- procedura di backup e ripristino provata;
- decisione esplicita sul posizionamento fiscale e sui pagamenti online.

Solo dopo questi risultati Ordynora può passare da pilot assistito a vendita Premium più ampia.
