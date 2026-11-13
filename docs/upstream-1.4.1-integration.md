# Integrazione NuvioTVSmart 1.4.1 — 13 novembre 2026

Riferimento ufficiale: `NuvioMedia/NuvioTVSmart`, commit `f5c67388`
(release 1.4.1). Il fork VIDAA era fermo alla base 1.2.9 (`c8674f2d`), con il
lavoro VIDAA salvato in `c385f671`.

## Merge

- Merge reale `--no-ff` di `upstream/main`; 70 conflitti iniziali, risolti
  mantenendo il comportamento del fork e ripristinando le integrazioni
  upstream mancanti guidate da build e test.
- Commit di merge: `84084001` — 531 file, versione applicativa e lockfile a
  **1.4.1**.
- Push su `origin/main` (`Empi9245/nuviotvsmart`); Vercel ha completato il
  deploy di produzione sul commit `84084001`.

## Adattamenti VIDAA mantenuti o riparati

- Navigazione a fuoco continuo VIDAA (`vidaaFocusScroll`) invariata; per le
  altre piattaforme resta lo spring scroll, salvo la policy di performance
  upstream che può scegliere lo scroll immediato.
- Idratazione poster Home: l'indice usa il selettore delle immagini ancora
  differite (`[data-src]`), non il selettore lifecycle upstream che include
  poster già dipinti; altrimenti le passate idle non accodano nulla.
- Finestra righe Home: il fork tiene tutte le righe montate, quindi
  `prepareHomeRowsForRestore` è un no-op esplicito e la chiamata upstream è
  opzionale nei percorsi di ripristino.
- Player: composta anche `playerScreenMethods-74-automatic-subtitle-sync.js`
  accanto al modulo upstream 74 sullo stream delay; senza questa composizione
  l'overlay HTML VIDAA falliva con `setAddonSubtitleAutoSyncSource is not a
function`.
- Audio di presentazione all'avvio: l'overlay che si nasconde durante il
  watchdog non smuta subito; lo smuto resta al completamento della
  presentazione, come previsto dal fork VIDAA.

## Verifiche eseguite

| Verifica                                          | Esito                                              |
| ------------------------------------------------- | -------------------------------------------------- |
| `npm run build`                                   | ✅                                                 |
| `npm run package:vidaa`                           | ✅ `dist/vidaa` + `dist/nuvio-vidaa.zip` (8,18 MB) |
| `npm run test:vidaa`                              | ✅ **94 suite**                                    |
| `npm run format:check`                            | ✅                                                 |
| Live `https://nuviotvsmart.vercel.app/vidaa.html` | ✅ HTTP 200, build `8897b7c349114430`              |
| Live `appinfo.json`                               | ✅ versione `1.4.1`                                |

Il wrapper Cloudflare `SIDEE-SUITE/UTENTI/core/src/forge/apps/nuvio.apphtml`
continua a puntare a `https://nuviotvsmart.vercel.app/vidaa.html`: l'URL non è
cambiato, quindi non è stato necessario ridistribuire il Worker Sidee.

## Limiti

- Nessuna prova su TV VIDAA fisica in questa tornata: decoding, resa video e
  comportamento del telecomando restano da verificare sul dispositivo.
- Il test DOM reale della Home resta separato
  (`tests/test-vidaa-home-patching.html`) e non è stato eseguito qui.
- Il deploy Vercel è stato verificato via HTTP e metadati di build, non con
  un'ispezione visuale della schermata TV.
