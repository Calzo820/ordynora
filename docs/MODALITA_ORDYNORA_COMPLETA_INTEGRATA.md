# Ordynora: modalità completa e modalità con gestionale

## Decisione di prodotto

Ordynora ha due configurazioni esplicite. Il ristorante sceglie **un solo sistema responsabile** di pagamenti e fiscalità.

| Area | Ordynora completa | Ordynora + gestionale |
|---|---|---|
| Menu QR e ordini | Ordynora | Ordynora |
| Sala, tavoli e prenotazioni | Ordynora | Ordynora |
| Portate, cucina e bar | Ordynora | Ordynora |
| Tempi operativi | Ordynora | Ordynora |
| Conto e registrazione pagamenti | Ordynora | Gestionale esterno |
| Pagamento online dal tavolo | Ordynora, quando commercialmente attivato | Gestionale esterno |
| Ricevuta di cortesia | Ordynora | Nascosta |
| Scontrino, fattura, RT e fiscalità | Gestionale fiscale certificato | Gestionale esterno |
| Chiusura giornaliera | Ordynora | Gestionale esterno |
| Incassi, metodi di pagamento e margini | Ordynora | Gestionale esterno |
| Registro Ordynora | Ordini e conti | Solo servizio e comande |

> Limite importante: la modalità completa registra pagamenti e produce un preconto/ricevuta **non fiscale**. Ordynora non diventa un registratore telematico certificato con questa patch. Per vendere la fiscalità come funzione propria servono partner, specifiche e certificazioni dedicate.

## Flusso per il piccolo ristorante

1. Il titolare sceglie **Ordynora completa**.
2. Configura logo, tavoli, menu, QR e staff.
3. Il cliente ordina; cucina e bar preparano; la sala serve.
4. La Cassa Ordynora imposta coperti, eventuali modifiche e pagamenti.
5. Ordynora chiude conto e giornata e rende disponibili i report economici interni.

## Flusso per il ristorante già assistito da un gestionale

1. Il titolare apre **Impostazioni → Gestionale collegato**.
2. Sceglie Tilby, TeamSystem Cassa in Cloud o Passepartout Menu e salva solo i dati realmente richiesti dal relativo percorso.
3. Ordynora passa a **modalità operativa** e rimuove dall'interfaccia Cassa, incassi, ricevute, chiusura giornaliera, margini e metodi di pagamento.
4. Ordynora continua a gestire QR, ordini, tavoli, portate, cucina, bar, tempi e disponibilità operative.
5. Dopo aver servito, lo staff chiude pagamento e documento nel gestionale esterno.
6. Dalla Sala preme **Pagato nel gestionale · libera tavolo**. Ordynora registra solo il completamento operativo (`settlementSource=external_pos`) e non crea una transazione di pagamento.

## Vincoli applicati dal backend

Nascondere un pulsante non è una protezione sufficiente. In modalità `integrated` il backend blocca con HTTP `409` e codice `EXTERNAL_POS_OWNS_FEATURE`:

- riepilogo e registrazione pagamenti Ordynora;
- chiusura conto con pagamento;
- configurazione economica del conto;
- cassa e chiusura giornaliera;
- ricevuta/preconto Ordynora;
- attivazione e dashboard Stripe Connect;
- checkout pubblico dal tavolo.

Il passaggio a modalità integrata è bloccato se esistono pagamenti Ordynora `paid` o `pending` su ordini ancora aperti. Questo evita di spostare a metà un conto già incassato o prenotato.

La chiusura operativa esterna:

- è disponibile solo in modalità integrata;
- richiede che la comanda sia già `served`;
- rifiuta ordini che contengono pagamenti Ordynora;
- è idempotente in caso di doppio tocco;
- chiude la sessione tavolo solo quando non restano altri ordini aperti;
- scrive un audit log dedicato.

## Dati mostrati in modalità integrata

Restano visibili:

- quantità, piatti, note, allergeni e reparti;
- stato di ordine, tavolo, portata, cucina e bar;
- prenotazioni, disponibilità e scorte operative;
- volumi, prodotti più richiesti e tempi di preparazione/servizio;
- errori operativi e stato dell'integrazione.

Vengono esclusi dalle risposte operative o dall'interfaccia:

- transazioni e metodi di pagamento;
- totale incassato, ticket medio, food cost e margini;
- costo materia prima e IVA nella gestione menu;
- chiusure giornaliere;
- log puramente Stripe/pagamenti nella vista del ristoratore.

I prezzi del menu restano in Ordynora perché servono al menu cliente e all'ordine. Il connettore dovrà stabilire quale sistema è master dei prezzi e applicare una strategia di sincronizzazione esplicita.

## Stato reale dei connettori

La struttura supporta tre percorsi:

- **Tilby**: credenziale bearer e test di connessione;
- **TeamSystem Cassa in Cloud**: scambio API key/token e test di connessione;
- **Passepartout Menu**: attivazione assistita, senza inventare una API pubblica non disponibile.

Le credenziali sono cifrate sul backend e non tornano al browser. Tuttavia, un test di autenticazione riuscito **non equivale** a un'integrazione ordini pronta per la produzione. Prima di promettere import/export automatico a un cliente servono per ogni fornitore:

1. contratto e accesso API ufficiale;
2. sandbox o punto vendita pilota;
3. mappatura prodotti, varianti, tavoli, IVA e annulli;
4. job idempotenti con retry e dead-letter;
5. riconciliazione e monitoraggio;
6. prova reale concordata con il ristorante e il partner.

Fino a quel momento Ordynora separa correttamente le responsabilità e offre il flusso operativo, ma non deve dichiarare “sincronizzazione fiscale certificata”.

## Criteri di accettazione prima della vendita

- La modalità scelta sopravvive a logout, refresh e accesso PIN dello staff.
- Un cassiere in modalità integrata entra su Tavoli, mai sulla Cassa Ordynora.
- Nessun endpoint di pagamento interno accetta scritture in modalità integrata.
- Il cliente può sempre ordinare, seguire l'ordine e chiedere il conto.
- Cucina e bar ricevono solo le rispettive righe e le portate rilasciate.
- Un tavolo non può essere liberato prima che l'ordine sia servito.
- Doppio tocco e due dispositivi non creano doppie chiusure.
- Il registro integrato non mostra importi o metodi di pagamento.
- Il cambio modalità rifiuta conti con pagamenti Ordynora in corso.
- Migrazione Prisma, riavvio Render e nuovo deploy frontend completano senza errori.
