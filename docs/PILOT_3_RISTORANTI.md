# Ordynora — piano operativo per 3 ristoranti pilota

Questo piano trasforma il pilot in una prova misurabile. I ristoranti vanno avviati uno alla volta, lasciando almeno 48 ore tra il primo servizio di un locale e l'avvio del successivo.

## Campione consigliato

| Pilot | Profilo | Cosa deve mettere alla prova | Servizi iniziali |
| --- | --- | --- | ---: |
| R1 | Bistrot/bar, massimo 40 coperti, flusso semplice | Primo accesso, menu QR, bar, conto e facilità d'uso | 2 |
| R2 | Ristorante 40–80 coperti, cucina e bar separati | Instradamento comande, portate, ruoli e cambio operatore | 4 |
| R3 | Locale con picco intenso e dispositivi misti | Concorrenza, rete instabile, recovery, cassa e chiusura | 4 |

I 10 servizi iniziali servono a trovare i difetti più evidenti. Prima di dichiarare il prodotto Premium su larga scala, ogni ristorante deve completare almeno 10 servizi e almeno 3 consecutivi senza problemi P0/P1.

## Persone e dispositivi minimi

- un titolare o responsabile;
- un cameriere che non ha mai visto Ordynora;
- una persona cucina e, quando presente, una persona bar;
- una persona cassa;
- due telefoni cliente, un telefono sala, un tablet cucina/bar e un dispositivo cassa;
- almeno un Android, un iPhone/iPad e un computer nei tre pilot complessivi.

## Test “prima volta” senza spiegazioni

L'osservatore consegna solo il risultato da ottenere. Interviene esclusivamente dopo 90 secondi di blocco e registra ogni aiuto.

| Ruolo | Compito | Obiettivo |
| --- | --- | --- |
| Titolare | Creare un tavolo, aggiungere un prodotto e invitare un membro staff | completato in 15 minuti, massimo 1 aiuto |
| Cameriere | Entrare con PIN, trovare T8, leggere lo stato e gestire la portata | completato in 3 minuti, nessun aiuto |
| Cucina/bar | Prendere in carico T8 e segnarla pronta | completato in 90 secondi, nessun aiuto |
| Cassa | Aprire T8, controllare il totale, creare il preconto e chiudere | completato in 3 minuti, massimo 1 aiuto |
| Titolare | Ritrovare incasso e tempo di preparazione | completato in 2 minuti, nessun aiuto |

Se tre persone diverse sbagliano lo stesso passaggio, il problema è dell'interfaccia fino a prova contraria: non va risolto con altra formazione.

## Prova completa prima di ogni servizio

1. Cliente apre il QR di T8 e invia un piatto cucina e una bevanda bar.
2. Cucina e bar ricevono una sola copia, nelle postazioni corrette.
3. Le postazioni cambiano stato; sala vede gli aggiornamenti e gestisce la portata successiva.
4. Sala segna la consegna e richiede il conto.
5. Cassa verifica articoli e totale, genera il preconto, registra il pagamento e chiude.
6. T8 torna libero; storico, pagamento e dashboard restano coerenti.
7. Ripetere una volta con rete interrotta per 30 secondi, verificando retry e assenza di duplicati.

## Classificazione dei problemi

| Livello | Esempi | Decisione |
| --- | --- | --- |
| P0 | comanda persa/duplicata, pagamento duplicato, dati di un altro ristorante, perdita dati | fermare nuovi ordini e usare il fallback |
| P1 | ruolo bloccato, conto non chiudibile, stati incoerenti, login impossibile | non avviare il servizio successivo finché corretto |
| P2 | passaggio poco chiaro con workaround sicuro, layout scomodo, aggiornamento lento | correggere nel prossimo ciclo prima di estendere il pilot |
| P3 | testo, spaziatura o dettaglio estetico senza impatto operativo | raccogliere e ordinare per frequenza |

## Ciclo bug quotidiano

1. A fine servizio esportare il file `pilot-feedback-template.csv` e allegare screenshot, orario e request ID.
2. Raggruppare segnalazioni duplicate per causa, non per persona.
3. Riprodurre il difetto su staging con lo stesso ruolo, dispositivo e stato rete.
4. Aggiungere un test automatico quando il bug è riproducibile.
5. Correggere, verificare l'intera suite e distribuire prima su staging.
6. Far confermare la correzione alla persona che aveva trovato il problema.

## Cancelli di uscita

- zero P0 e P1 aperti;
- zero comande o pagamenti persi/duplicati;
- almeno 90% dei compiti completati senza aiuto;
- tre servizi consecutivi puliti in ciascun locale;
- riconciliazione cassa corretta a fine turno;
- recovery di rete provato senza doppio invio;
- backup e ripristino provati su un ambiente non produttivo;
- titolare, sala, cucina/bar e cassa dichiarano esplicitamente che userebbero il prodotto nel turno successivo.

Se un cancello non passa, la formula commerciale corretta resta **pilot assistito**. Non è un fallimento: indica esattamente quale rischio eliminare prima di ampliare la vendita.
