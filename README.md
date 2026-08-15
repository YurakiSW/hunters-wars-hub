# Hunters Wars Hub

Sito di gilda per **Summoners War — Guild Siege**. Raccoglie le difese nemiche,
i counter che funzionano davvero, e li ricava in automatico dai log di
battaglia del gioco.

Next.js (App Router) · Upstash Redis · deploy su Vercel.

---

## Indice

1. [Cosa fa](#cosa-fa)
2. [Come è organizzato il codice](#come-è-organizzato-il-codice)
3. [Modello dati su Redis](#modello-dati-su-redis)
4. [Il percorso di un log di Siege](#il-percorso-di-un-log-di-siege)
5. [Come si calcolano le statistiche](#come-si-calcolano-le-statistiche)
6. [Trappole del dominio](#trappole-del-dominio) ← **leggere prima di toccare qualsiasi cosa**
7. [Ruoli e permessi](#ruoli-e-permessi)
8. [Deploy e configurazione](#deploy-e-configurazione)
9. [Manutenzione](#manutenzione)

---

## Cosa fa

- **Difese e Counter**: catalogo delle difese nemiche incontrate in Siege, con i
  counter che le battono. Ogni counter riporta rune, artefatti, relic,
  statistiche di combattimento, ordine dei turni e strategia.
- **Import dei log di Siege**: si carica il file JSON prodotto da SWEX/SWProxy e
  il sito ne estrae ogni battaglia, capisce quali counter funzionano davvero
  (percentuale di vittorie su tutte le siege osservate) e propone in automatico
  quelli sopra la soglia. Un Admin approva o rifiuta.
- **Deck di attacco**: squadre pronte, con l'elenco delle difese nemiche che
  coprono, ricavato dai counter approvati.
- **Difese di gilda**: statistiche delle difese schierate dalla propria gilda e
  di come hanno retto.
- **Bestiario**: elenco mostri sincronizzato da [swarfarm](https://swarfarm.com),
  con icone, stelle naturali, statistiche base e leader skill.
- **Roster automatico**: si carica l'export del gioco e utenti e ruoli si
  allineano da soli in base al grado in gilda.

---

## Come è organizzato il codice

```
app/
  page.js                 home
  login/ register/        accesso, con reset password via email
  defs/                   elenco difese nemiche
  defs/[id]/              dettaglio di una difesa + i suoi counter
  deck-build/             deck di attacco
  difese-gilda/           statistiche delle difese della propria gilda
  mine/ pending/          i propri counter, quelli in attesa di approvazione
  admin/page.js           pannello Admin — ATTENZIONE: 2.700 righe, tutti i tab
  api/                    tutte le route server
lib/                      logica applicativa, nessun componente React
components/               componenti React condivisi
```

### I file di `lib/`

| File | A cosa serve |
|---|---|
| `redis.js` | client Upstash unico, riusato ovunque |
| `auth.js` · `session.js` | login, cookie firmato, controllo ruoli |
| `passwordReset.js` · `email.js` | reset password via Resend |
| `roster.js` | roster di gilda dall'export del gioco |
| `monsters.js` | bestiario: sincronizzati, manuali, nomignoli, gemelli collab |
| `defs.js` | difese e counter (creazione, modifica, unione, pulizia doppioni) |
| `decks.js` | deck di attacco e le difese che coprono |
| `guildDefenses.js` | statistiche delle difese schierate dalla gilda |
| `siegeLogParser.js` | **lettura del file di log**: decompressione, estrazione battaglie e rune grezze |
| `siegeStats.js` | **cuore del sistema**: accumulo vittorie, varianti, proposte, approvazione |
| `runeSets.js` | **calcolo delle statistiche**: set, artefatti, relic, torre, leader skill |
| `artifactEffects.js` · `relicEffects.js` · `gameData.js` | tabelle di traduzione dei codici numerici del gioco |
| `textUtils.js` | normalizzazione nomi mostri, formattazione testo per chat |
| `backup.js` · `apiUtils.js` | esportazione dati, lettura sicura del corpo richiesta |

---

## Modello dati su Redis

Tutto sta su Upstash Redis. Non c'è un database relazionale: le relazioni si
tengono con indici espliciti (set di ID).

### Utenti e gilda

| Chiave | Contenuto |
|---|---|
| `user:{id}` | utente: email, nickname, hash password, ruolo |
| `guild:roster` | `[{ nickname, grade }]` dall'export del gioco |

### Bestiario

| Chiave | Contenuto |
|---|---|
| `monsters:synced` | elenco da swarfarm: nome, icona, `com2usId`, stelle naturali, statistiche base, leader skill |
| `monsters:manual` | mostri aggiunti a mano dall'Admin |
| `monsters:aliases` | `{ "nomignolo di gilda": "Nome Ufficiale" }` |
| `monsters:twins` | coppie collab ↔ versione normale (vedi trappole) |
| `monsters:neverCleanIds` | ID il cui nome NON va mai ripulito dal suffisso `(ID xxxxx)` |
| `monsters:newSinceLastSync` | novità dell'ultima sincronizzazione |

### Difese e counter

| Chiave | Contenuto |
|---|---|
| `def:ids` | set di tutti gli ID difesa |
| `def:{id}` | difesa: elenco mostri, note |
| `def:{id}:counters` | set degli ID counter di quella difesa |
| `counter:{id}` | counter: unità, rune, artefatti, ordine turni, strategia, stato |
| `deck:ids` · `deck:{id}` | deck di attacco |

### Statistiche Siege (il pezzo più delicato)

| Chiave | Contenuto |
|---|---|
| `siege_agg:{defK}::{counterK}` | **aggregato**: vittorie e totale della coppia difesa/counter, senza distinguere le build |
| `siege_variant:{defK}::{counterK}::{buildHash}` | **variante**: una specifica build (rune, artefatti) con le proprie vittorie e il nick di chi l'ha giocata |
| `siege_proposal:{defK}::{counterK}` | proposta generata quando la coppia supera la soglia |
| `siege_proposal:index` | set di tutte le proposte |
| `siege_battle_seen` | battaglie già conteggiate — impedisce doppi conteggi al reimport |
| `siege_capture_seen` | catture di rune già conteggiate, stessa funzione |
| `siege_stats_archive:{seasonId}` | archivio di fine stagione |

**Due livelli di chiave, e il motivo conta:**

- La chiave **aggregata** (`siege_agg`) ignora le build: serve a decidere *se*
  un counter funziona. Se dieci giocatori battono la stessa difesa con la stessa
  squadra ma rune diverse, contano tutti insieme.
- La chiave **variante** (`siege_variant`) distingue le build: serve a decidere
  *quale versione* proporre. Ogni giocatore vota per la propria.

---

## Il percorso di un log di Siege

```
file JSON di SWEX
   │
   ▼
siegeLogParser.js
   ├─ extractBattleEntries()      ogni battaglia: chi contro chi, vinta o persa
   └─ extractRichReplayDetails()  per i replay aperti in gioco: rune, artefatti,
                                  relic, statistiche base, leader — decomprimendo
                                  il blob `replay_data`
   │
   ▼
app/api/admin/import-siege-log/route.js
   ├─ abbina i mostri per `unit_master_id` (MAI per posizione nell'array)
   └─ costruisce le "catture": una build completa con il nick di chi l'ha giocata
   │
   ▼
siegeStats.js → recordCrossPlayerBattles()
   ├─ somma vittorie/totali nell'aggregato
   ├─ registra ogni cattura come variante separata
   └─ salta quelle già viste (dedup su `battleId` e `captureId`)
   │
   ▼
refreshProposals()
   └─ se la coppia supera la soglia, crea una proposta
   │
   ▼
Admin → Approvazioni Siege Log
   ├─ "Approva"            pubblica la variante migliore così com'è
   └─ "Modifica e approva" apre il form precompilato coi dati del log; se si
                           cambia la lead, le statistiche si ricalcolano
   │
   ▼
counter pubblicato, visibile a tutta la gilda
```

**Quale variante viene proposta:** la migliore secondo, in ordine, percentuale
di vittorie → vittorie assolute → efficienza media delle rune della squadra →
un criterio fisso per non dipendere dall'ordine di lettura di Redis.

---

## Come si calcolano le statistiche

Tutto in `lib/runeSets.js`, funzione `computeCombatStats()`.

Il replay contiene **solo** le statistiche base nude del mostro (HP, ATK, DEF,
SPD, RES) e le rune grezze. Tutto il resto va calcolato.

### Due valori distinti per ogni statistica

| Campo | Cos'è | Cosa include |
|---|---|---|
| `hp`, `atk`, `def`, `spd`… | **scheda del mostro**, come si vede in gioco fuori dal combattimento | base + rune + artefatti + relic + set portati dal mostro |
| `hpCombat`, `spdCombat`… | **valore vero in battaglia** | tutto il precedente + torre di gilda + leader skill + set di gilda |

`spdCombat` è quello che determina l'**ordine dei turni**. Sulla scheda non
compare mai, perché in gioco la torre e la leader skill non si vedono lì.

### Le due regole di arrotondamento (attenzione, sono diverse)

**Sulla scheda**, ogni fonte di percentuale si arrotonda per conto suo:

```
valore = base + ceil(base × %rune) + ceil(base × %set) + parte piatta
```

**In combattimento**, tutte le percentuali si sommano e si arrotonda una volta
sola:

```
valore = base + ceil(base × (%rune + %set + %leader + %torre)) + parte piatta
```

Sembra un dettaglio ma sposta 1-2 punti, abbastanza da sbagliare uno speed
tuning. Entrambe verificate confrontando col gioco.

### Statistiche che il replay non contiene

Crit rate, crit damage e accuracy base **variano da mostro a mostro** e arrivano
da swarfarm con la sincronizzazione. Esempi: Camilla parte da 30% di crit rate
(non 15), Tesarion da 25% di accuracy (non 0).

---

## Trappole del dominio

> Ogni voce qui sotto è costata almeno una giornata di debug. Leggere prima di
> mettere mano al calcolo delle statistiche o al bestiario.

### I mostri collab hanno un gemello identico

Ogni mostro da collaborazione ha una versione "normale" con **statistiche base
identiche** ma `unit_master_id` diverso. Non si può distinguerli dalle
statistiche: bisogna incrociare nome, icona o la tabella `monsters:twins`. La
corrispondenza è consultabile su [swgt.io](https://swgt.io).

Quando due voci hanno lo stesso nome, il sito ne rinomina una in
`Nome (ID xxxxx)`. La lista `monsters:neverCleanIds` protegge gli ID il cui nome
non va mai ripulito.

### La torre di gilda dà +15% SPD e non si vede da nessuna parte

Non compare né sulla scheda del mostro né nel replay, ma si applica sempre in
battaglia. Va aggiunta a mano nel calcolo dell'ordine turni.

### La leader skill si applica solo in combattimento

Il gioco non la mostra sulla scheda. Vale solo se l'area è `Guild` o `General`
(quelle marcate `Arena` o `Dungeon` in Siege non contano) e può essere ristretta
a un elemento, nel qual caso tocca solo i mostri di quell'elemento.

### Il leader è sempre il primo mostro della squadra

Verificato su 462 squadre reali. Il replay lo indica comunque in `leader_unit`,
che è la fonte da preferire.

### `natural_stars` non è `base_stars`

`natural_stars` è il numero di stelle al momento dell'evocazione e non cambia
mai. `base_stars` sale dopo il risveglio. L'idoneità alle torri di Siege dipende
da `natural_stars`.

### `archetype: "none"` non sono mostri

Nella risposta di swarfarm indica torri, cristalli e boss: vanno filtrati o
finiscono nel bestiario.

### swarfarm dà i valori della forma richiesta

Chiedendo l'ID della forma risvegliata si ottengono le statistiche **già
risvegliate**, bonus di risveglio incluso. Non va aggiunto a mano.

### Le rune vanno abbinate per `unit_master_id`

Mai per posizione nell'array: l'ordine dei mostri nel replay non corrisponde a
quello delle rune.

### Il set Swift dà +25% SPD

È l'unico set che tocca la SPD. Si vede anche sulla scheda in gioco, a
differenza della torre.

---

## Ruoli e permessi

| Ruolo | Può fare |
|---|---|
| **Admin** | tutto: approvazioni, gestione utenti, sincronizzazioni, manutenzione |
| **Revisore** | creare e modificare difese, gestire contenuti |
| **Membro** | proporre counter, consultare tutto |

I ruoli si assegnano da soli in base al grado in gilda quando si carica il
roster (grado 1 → Admin, grado 3 → può caricare il roster, 2 e 4 → Membro).
L'Admin può sempre sovrascrivere a mano.

---

## Deploy e configurazione

### Variabili d'ambiente

```
UPSTASH_REDIS_REST_URL
UPSTASH_REDIS_REST_TOKEN
SESSION_SECRET      # stringa lunga a caso: openssl rand -base64 32
CRON_SECRET         # altra stringa a caso, protegge il sync automatico
RESEND_API_KEY      # solo per il reset password via email
```

### Primo avvio

1. Repo su GitHub, progetto su Vercel collegato
2. Database Upstash Redis, credenziali nelle variabili d'ambiente
3. Deploy
4. Registrare il primo account con nickname del capogilda
5. Caricare il roster dall'export del gioco: i ruoli si assegnano da soli
6. Lanciare la sincronizzazione del bestiario (vedi sotto)

### Sviluppo locale

```bash
npm install
cp .env.example .env.local   # compilare le variabili
npm run dev
```

---

## Manutenzione

### Sincronizzazione bestiario

```
/api/monsters/sync?secret=IL_CRON_SECRET
```

Scarica l'elenco mostri da swarfarm: nomi, icone, stelle naturali, statistiche
base e leader skill. Va rilanciata dopo ogni collaborazione o patch che
modifichi le statistiche. Su cron-job.org conviene schedularla giornaliera.

### Strumenti in Admin → Diagnostica

| Strumento | Quando serve |
|---|---|
| **Ricalcola Combat Stats** | dopo una correzione alle regole di calcolo: i counter pubblicati hanno le statistiche congelate all'approvazione e non si aggiornano da soli. Non tocca i counter corretti a mano. |
| **Unisci Difese uguali** | quando la stessa difesa esiste in due versioni per via di un mostro collab registrato tardi. Mostra un'anteprima di cosa unirebbe: **controllarla, l'operazione non si annulla**. |
| **Pulisci counter doppi** | dopo un'unione di difese |
| **Controlla doppioni collab** | verifica e gestione delle coppie collab ↔ normale |
| **Salute dati** | difese senza counter, counter senza leader o senza build |

### Nota sui tempi di esecuzione

Le operazioni che scorrono tutti i counter (ricalcolo, unione) girano su Vercel
con un limite di 60 secondi. Sono scritte a gruppi paralleli per starci dentro;
alzando troppo la dimensione del gruppo si rischiano i limiti di frequenza di
Upstash.

---

*Sito sviluppato con l'assistenza di Claude AI (Anthropic). Non affiliato a
Com2uS/Gamevil.*
