# Ordynora come livello operativo integrato

## Decisione di prodotto

Ordynora non deve diventare una seconda cassa completa. Il suo vantaggio è il flusso operativo dal tavolo ai reparti: menu QR, ordine, sala, cucina, bar, portate, tempi, consegna e richiesta conto. Il gestionale esistente mantiene la responsabilità fiscale e amministrativa.

Questa separazione evita doppio inserimento, riduce il rischio normativo e rende Ordynora più semplice da adottare in un ristorante già attivo.

| Area | Ordynora | Gestionale collegato |
| --- | --- | --- |
| Menu cliente e QR | Responsabile | Riceve o fornisce anagrafiche dopo la mappatura |
| Sala, cucina, bar e portate | Responsabile | Riceve gli eventi concordati |
| Stato tavolo e tempi servizio | Responsabile | Eventuale sincronizzazione |
| Preconto e divisione del conto | Supporto operativo | Importo fiscale definitivo |
| Pagamento, scontrino e RT | Solo stato operativo | Responsabile |
| Fatture e contabilità | Non implementare in Ordynora | Responsabile |
| Chiusura fiscale | Non implementare in Ordynora | Responsabile |

## Primo catalogo

Le tre varianti iniziali non sono presentate come una classifica di quota di mercato, perché non è disponibile una fonte pubblica omogenea. Sono state scelte per rilevanza nel mercato italiano e per coprire tre modalità tecniche diverse.

| Connettore | Primo livello implementato | Vincolo reale |
| --- | --- | --- |
| Zucchetti Tilby | Salvataggio cifrato del token, ambiente e prova connessione | Accesso partner, sandbox e certificazione/abilitazione alla produzione |
| TeamSystem Cassa in Cloud | Salvataggio cifrato API key e scambio di prova con token temporaneo | Licenza Retail/Risto Enterprise, API key e mappatura punto vendita |
| Passepartout Menu | Raccolta dati installazione e percorso assistito | Il canale dipende da versione, installazione e partner; non viene simulata una API pubblica universale |

## Funzioni da tenere, delegare e rinviare

### Tenere e migliorare in Ordynora

- menu QR, ordini e idempotenza;
- KDS cucina e bar, portate e priorità;
- tavoli, chiamata cameriere e richiesta conto;
- ruoli staff, PWA, offline/fallback e audit;
- tempi di preparazione e dashboard proprietario;
- import menu, ma attraverso mapping controllato.

### Delegare al gestionale

- scontrino fiscale e registratore telematico;
- fattura elettronica e corrispettivi;
- contabilità, prima nota e chiusura fiscale;
- gestione certificata dei pagamenti e riconciliazione fiscale;
- magazzino amministrativo quando il gestionale è la fonte autorevole.

### Non completare prima dei pilot

- motore fiscale proprietario;
- tre sincronizzazioni bidirezionali complete in parallelo;
- generazione automatica di mapping senza conferma umana;
- un connettore “universale” che prometta compatibilità senza API documentata;
- automazioni AI che possano modificare dati di produzione senza anteprima e approvazione.

## Sicurezza e affidabilità incluse

- Una sola integrazione attiva per ristorante, isolata tramite `restaurantId`.
- Credenziali cifrate con AES-256-GCM e chiave solo server-side.
- Nessuna chiave API viene restituita al browser, ai log o alle risposte del test.
- Endpoint esterni predefiniti nel codice: il cliente non può inserire URL arbitrari.
- Rate limit sui test di connessione.
- Audit di configurazione, test e disconnessione senza registrare segreti.
- Tabelle per mapping e job idempotenti pronte per import, export, retry e monitoraggio.
- La disconnessione elimina credenziali, mapping e coda per evitare invii al gestionale sbagliato.

## Sequenza di rilascio consigliata

1. Configurare `INTEGRATION_ENCRYPTION_KEY` su Render e applicare la migrazione Prisma.
2. Ottenere sandbox e autorizzazioni partner per Tilby e Cassa in Cloud.
3. Collegare un ristorante pilota per un solo gestionale.
4. Mappare punto vendita, prodotti e tavoli con conferma dell'owner.
5. Esportare gli ordini in sandbox usando `externalId` e la coda idempotente.
6. Provare retry, duplicati, annulli e indisponibilità del gestionale.
7. Attivare la produzione solo dopo riconciliazione manuale di almeno un servizio completo.
8. Replicare il driver validato sugli altri gestionali.

## Confine dell'intelligenza artificiale

L'AI può leggere una specifica OpenAPI, proporre una mappatura e generare un adattatore da revisionare. Non può inventare endpoint, ottenere credenziali, superare autorizzazioni del fornitore o certificare un flusso fiscale. Ogni nuovo connettore deve avere contratto documentato, sandbox, test e approvazione esplicita prima della produzione.
