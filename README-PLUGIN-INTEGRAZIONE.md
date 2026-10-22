# nuviotvsmart-plugins — copia di lavoro per l'integrazione plugin

Copia di `D:\nuvio\nuviotvsmart` (fork Empi9245/nuviotvsmart v1.2.7, HEAD `c8bfd565`)
creata il 21/10/2026 (robocopy: 4.914 file, 170 MB, 0 falliti; log in
`../05-DOCUMENTAZIONE/log-copie/robocopy-nuviotvsmart-plugins.txt`).

**REGOLA: qui si lavora. La versione deployata `D:\nuvio\nuviotvsmart` (usata da tutti)
NON si tocca** — verificata intatta il 21/10 (git status pulito, HEAD c8bfd565).

Esclusi dalla copia (reinstallabili): `node_modules/` (rigenerato con `npm ci`:
432 pacchetti) e `.cache/`.

## Stato integrazione plugin (21/10/2026)

| Verifica                                                                   | Esito                                                                                                                      |
| -------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| `npm ci`                                                                   | ✅ 432 pacchetti                                                                                                           |
| `npm run test:plugins` (suite ufficiale: build + 8 test VIDAA)             | ✅ TUTTA VERDE (exit 0 verificato con pipefail/PIPESTATUS)                                                                 |
| `PORT=4173 node scripts/serve.mjs --vidaa`                                 | ✅ HTTP 200 — ATTENZIONE: l'ambiente di sistema ha `PORT=0` che rompe il bind; usare sempre `PORT=4173`                    |
| Schermata Plug-in nel browser (URL `http://127.0.0.1:4173/?wrapper=vidaa`) | ✅ raggiungibile e funzionante (Aggiungi repository, toggle fornitori)                                                     |
| Gate UI plugin su VIDAA                                                    | ✅ già aperto (`canUsePlugins()` = true non-Tizen)                                                                         |
| Rete plugin su VIDAA                                                       | ⚠️ `directBrowserFetch` (networkMode "browser") → **rotto per CORS**; risolto col proxy same-origin (sotto)                |
| Search/stream con plugin reali                                             | ✅ 21/10: 5 fonti / 10 stream su The Office S1E1 (prima: 1-2 fonti), riproduzione verificata (video in play, readyState 4) |
| Proxy plugin `/api/plugin-proxy` (fix CORS)                                | ✅ 166 richieste provider relayate via proxy; 0 errori CORS residui (prima: quasi tutti fallivano `Failed to fetch`)       |
| Funzione Vercel `api/plugin-proxy.js`                                      | ✅ codice pronto (stesso protocollo di serve.mjs); attiva al deploy su nuviotvsmart.vercel.app                             |
| Suite ufficiale post-proxy                                                 | ✅ 8 test + 5 nuovi del proxy (13 transport invariati), exit 0                                                             |

## Fix CORS plugin (21/10/2026) — leggere prima di toccare la rete plugin

**Bug:** su VIDAA e in browser il transport plugin usava `fetch()` della pagina:
quasi nessun provider ha `Access-Control-Allow-Origin`, quindi ogni richiesta
falliva con `TypeError: Failed to fetch` e la ricerca trovava 1 fonte su 30.
Confermato anche sulla TV reale (sonda 8/10/2026, `docs/vidaa-network-research.md`).

**Fix:** le richieste plugin cross-origin passano per un proxy same-origin:

- `scripts/pluginProxyCore.mjs` — protocollo e inoltro (validazione URL, cap 4MB,
  blocco header pericolosi: set-cookie/clear-site-data/HSTS/CSP/alt-svc; cookie
  di upstream esposti come `x-nuvio-proxy-set-cookie`);
- `scripts/serve.mjs` — endpoint `POST /api/plugin-proxy` (serve:vidaa);
- `api/plugin-proxy.js` + `vercel.json` — stessa API per la produzione Vercel;
- `js/platform/pluginBrowserTransport.js` — usa il proxy per target cross-origin
  quando la pagina è http(s); se l'host risponde 404/405/501 senza header
  `x-nuvio-plugin-proxy` ritorna al fetch diretto (host statici);
- `js/core/player/pluginProxyProtocol.js` — costanti condivise client/server;
- test: `tests/test-vidaa-plugin-browser-proxy.mjs` (5 check) nella suite ufficiale.

Effetti collaterali positivi: i redirect manuali ora restituiscono status+
`Location` (prima `opaqueredirect` inaccessibile) e lo User-Agent dello scraper
raggiunge davvero il provider (prima il browser lo eliminava).

## AutoSync (provider PriSynx "⚡ DualSync") — analisi 21/10/2026

"AutoSync" NON è una funzione dell'app: è il servizio esterno
`https://autosync.stremio-italia.eu/plugin/jobs` usato dal provider PriSynx
`dualsync.js` per misurare l'offset fra audio ITA e video.

- Il messaggio visto ("❌ AutoSync fallito (Punti di verifica insufficienti o
  correlazione debole)") è il **verdetto del servizio** su quegli stream: durate
  discordanti (es. video 0:23:01 vs audio ITA 0:23:21) → correlazione impossibile.
  Anche con l'app perfetta quello stream resterebbe "fallito" (consiglio del
  provider: audio originale o offset manuale).
- **Gap reale dell'app:** quando la misurazione riesce, il provider emette
  `behaviorHints: { audioDelayMs, audioDelayLanguage: "it" }` e l'app dovrebbe
  applicare quel ritardo alla traccia ITA (lo fa l'app Android NuvioTV via
  PR #3781 + #4027; vedi stringhe `audio_remember_delay_per_device` nelle res).

### Stato del porting (22/10/2026)

| Parte                                                                                                                                                                     | Stato                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Contratto (`js/core/player/streamAudioDelay.js`: normalizzazione lingue, clamp ±60s, scope per traccia, semantica esatta di `StreamDelayScope`/`AudioDelayParts` Android) | ✅ + 6 test nella suite                                                                                                                                                                                                                                                                                                                                                                                                                     |
| Plumbing: `resultToStream` preserva i `behaviorHints` del provider (prima li droppava)                                                                                    | ✅ testato                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| Plumbing: cache `streamLinkReuse` conserva `audioDelayMs`/`audioDelayLanguage`                                                                                            | ✅                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| Applicazione sottotitoli (offset embedded per lingua, PR #4027)                                                                                                           | ✅ completata 22/10: tutti i punti di applicazione uniformati (cue nativi, ASS init + re-apply, finestre embedded webOS/VIDAA, bitmap, overlay HTML, adapter VIDAA) via `playerScreenMethods-74-stream-subtitle-delay.js`; addon/esterni e AVPlay external restano solo-ritardo-utente, offset mai persistito — 6 check di wiring + contratto Android nella suite                                                                           |
| Applicazione ritardo audio                                                                                                                                                | ⚠️ **blocco di piattaforma**: Tizen AVPlay e webOS NON hanno API di ritardo audio (verificato sulle doc ufficiali); il Web Audio DelayNode silenzia gli stream cross-origin su TV (è il motivo per cui `supportsTvWebAudioAmplification()` è disattivato su Tizen/webOS/VIDAA). L'unica via è un **engine dual-element** (audio ITA su `<audio>` separato con clock-sync, entrambi i segni possibili) — da progettare come passo successivo |

Verifica browser 22/10 (The Office S1E2): gli stream DualSync/MovyITA arrivano
con `⏱️ Ritardo audio +0,075 s` (hint presenti e ora preservati dal mapping);
un solo stream "❌ AutoSync fallito" correttamente segnalato dal servizio
(audio di contenuto diverso: video 0:33:12 vs audio 0:22:02).

### Offset sottotitoli applicato (22/10/2026)

Il ritardo sottotitoli effettivo è `ritardo utente + offset sorgente stream`,
calcolato al momento dell'applicazione e **mai salvato** (la persistenza resta
solo `subtitleDelayMs`). Allineamento esatto ad Android (diff PR #4027):

- lo shift vale **solo** per sottotitoli embedded/estratti la cui lingua
  coincide con `behaviorHints.audioDelayLanguage` (it/ita/italian…; `es-419` ≠
  `es`); senza `audioDelayLanguage` nessuno shift (nulla identifica quali
  sottotitoli arrivino dalla sorgente audio);
- sottotitoli addon/esterni (OpenSubtitles, MovyITA, VixSrc, file esterni
  AVPlay) e la traccia audio originale restano allineati al video;
- punti uniformati: cue nativi (`getSubtitleCueDelayMsForTrack`), ass.js
  (`getAssSubtitleDelayMs`, contesto sorgente catturato in `applyAssSubtitleBody`),
  finestre embedded webOS/VIDAA e bitmap (`getEmbeddedSubtitleDelayMs`), overlay
  HTML (`getActiveSubtitleDelayMs`), adapter VIDAA; il riferimento UI e lo slider
  mostrano come da PR solo il ritardo dell'utente.
- test: `tests/test-vidaa-stream-subtitle-offset-wiring.mjs` (6 check di wiring)
  - contratto Android in `test-vidaa-plugin-stream-audio-delay.mjs`.

## Note tecniche trovate

- Login: il gate QR si salta con `localStorage.setItem('skipAuthQrGate','1')`.
- Modalità esperienza: scegliere **Avanzata** (include i plug-in).
- Il `serve:vidaa` avvia anche l'EngineFS companion (porte 2710/3710) — è il
  motore P2P/torrent locale (Nuvio Engine) utile per i test futuri del resolver P2P.
- Il plugin runtime è nel build standard (`dist/assets/runtime/plugin-worker.js`).
