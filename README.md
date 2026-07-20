# Hunters Wars Hub

Sito di gilda per i counter di Guild Siege — login, ruoli, roster automatico, Difese e Counter con approvazione, sincronizzazione mostri da swarfarm.

## Cosa c'è già (v1)

- **Login/registrazione** con password (hashata), sessione via cookie firmato
- **Roster automatico**: carichi l'export JSON del gioco (SWEX/SWProxy), il sito confronta i nickname e approva/assegna ruolo in automatico secondo il grado (1=Admin, 3=permesso upload roster, 2/4=Membro). L'Admin può sempre sovrascrivere a mano.
- **Difese e Counter**: creazione (Difese solo Admin/Revisore, Counter aperti a tutti), modifica, eliminazione singola e in blocco, approvazione
- **Autocomplete mostri** collegato a un elenco reale (vedi sotto), niente nomi a caso
- **Pannello Admin/Gestione**: roster, utenti e ruoli (solo Admin), mostri manuali e gestione contenuti (anche Revisori)

## Cosa manca ancora / prossimi passi

- Compressione immagini lato client ed embed video (nella bozza funzionava, va riportato qui)
- Rifinitura visiva (il tema cosmico/oro della bozza è solo abbozzato in `app/globals.css`)
- La sincronizzazione mostri (`app/api/monsters/sync/route.js`) **va verificata al primo giro**: l'endpoint esatto dell'API di swarfarm non è documentato in modo leggibile pubblicamente, il codice assume la convenzione REST standard usata dal resto del sito. Se il primo sync fallisce o torna vuoto, va controllata la risposta reale di `https://swarfarm.com/api/v2/monsters/` da browser e aggiustati i nomi dei campi in quel file.

## Deploy

1. **Crea un repo GitHub nuovo** (es. `hunters-wars-hub`) e carica questa cartella
2. **Crea un progetto Vercel** collegato a quel repo
3. **Crea un database Upstash Redis** (nuovo, separato da quello di SW Auto Redeemer) e copia URL + token
4. Su Vercel, imposta le variabili d'ambiente (vedi `.env.example`):
   - `UPSTASH_REDIS_REST_URL`
   - `UPSTASH_REDIS_REST_TOKEN`
   - `SESSION_SECRET` (stringa lunga a caso, es. generata con `openssl rand -base64 32`)
   - `CRON_SECRET` (altra stringa a caso)
5. Deploy
6. **Registra il primo account** con l'email/nickname del Capogilda (grado 1 → diventa Admin in automatico se il roster è già stato caricato, altrimenti va promosso a mano la prima volta da Redis o aggiungendo un endpoint temporaneo — dimmelo e te lo preparo)
7. Su **cron-job.org**, crea un nuovo cron (stesso principio del redeemer) che chiama ogni giorno:
   `https://tuo-sito.vercel.app/api/monsters/sync?secret=IL_TUO_CRON_SECRET`
   per tenere aggiornato l'elenco mostri da swarfarm

## Sviluppo locale

```
npm install
cp .env.example .env.local   # compila le variabili
npm run dev
```
