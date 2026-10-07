# Indagine mirata VIDAA: codec, sottotitoli e input

Data: 7 ottobre 2026. Repository: `Empi9245/nuviotvsmart`, branch `main`, HEAD `0d61c808eae019d0c79406245c5d0f974af9e474`.

Target indicato dall'utente: Hisense VIDAA 9 / U09.60, firmware `V0000.09.60A.Q0707`, MTK9603, Odin/Chromium circa 111. Nessuna misura del dispositivo è stata effettuata durante questa indagine.

Sono stati letti i percorsi pertinenti e svolte prove Node con moduli applicativi reali e fixture in memoria. I risultati descrivono il checkout locale durante le verifiche, che contiene modifiche e cancellazioni concorrenti Home/diagnostica/test. Nessun sorgente applicativo è stato modificato da questa indagine. Questo rapporto è il solo file aggiunto da questa indagine. Nessun build, installazione, servizio, commit o PR.

## Conclusione architetturale

Il rischio principale riguarda il collegamento fra codec, pipeline e renderer. VIDAA ha già una preferenza per HLS nativo, selezione delle tracce native e fallback ASS condiviso. Tuttavia, alcune decisioni successive possono cambiare pipeline senza verificare il contenuto; altre trasformano un tentativo di selezione in un successo UI.

La prima correzione da progettare riguarda la transizione HLS nativo -> hls.js durante la scoperta dei sottotitoli e il significato di compatibilità audio. Una tabella fissa di codec Hisense o l'estensione indiscriminata dei branch Tizen/webOS non risolverebbero questi problemi.

Distinguere sempre:

- disponibilità dell'engine;
- indicazioni native per MIME/codec;
- indicazioni MSE per la combinazione concreta;
- tracce effettivamente esposte e selezionabili;
- risultato osservato di riproduzione/rendering;
- configurazione dell'uscita audio.

## 1. Codec e scelta della pipeline

### 1.1 La scoperta dei sottotitoli può forzare hls.js su VIDAA

`loadManifestTrackDataForCurrentStream()` termina chiamando `promoteHlsManifestSubtitlePlayback()`. Questa funzione esclude Tizen, ma non VIDAA: se esistono sottotitoli nel manifest e `canUseHlsJs()` è vero, richiede `forceEngine: "hls.js"`, anche dopo una partenza `native-hls`.

Riferimenti:

- `js/ui/screens/player/playerScreenMethods-14-load-manifest-track-data-for-current-stream.js:200`, `:211`, `:233`;
- `js/core/player/playerControllerMethods-01-is-expected-play-interruption.js:206`;
- `node_modules/hls.js/src/is-supported.ts:34`.

Il controllo generale `Hls.isSupported()` non è una verifica dei codec del manifest selezionato. La versione installata prova un insieme di combinazioni generali MSE, senza verificare in questo punto HEVC/AC3/EAC3/DTS/TrueHD del contenuto.

Probe: engine iniziale `native-hls`, manifest con sottotitoli, disponibilità generale hls.js positiva. La promozione restituisce `true` e richiede hls.js anche con indicazioni native codec negative. Il probe non stabilisce che quel codec fallisca via MSE: stabilisce che la transizione non distingue queste capacità.

Conseguenza da verificare sulla TV: un contenuto inizialmente riproducibile dal backend nativo può cambiare comportamento audio quando vengono scoperti i sottotitoli. È una spiegazione plausibile dei problemi su più contenuti, non una causa hardware già dimostrata.

### 1.2 Su VIDAA il supporto audio non viene misurato dalla policy delle tracce

`getAudioTrackSupportState()` restituisce la negazione di `isUnsupportedWebOsAudioTrack()`. Quest'ultima torna `false` fuori webOS: su VIDAA produce quindi `supported: true` senza uno stato distinto per supporto sconosciuto.

Riferimento: `js/ui/screens/player/playerScreenHelpers-04-format-subtitle-codec-label.js:431-449`.

Probe di sei descrizioni: AVC+AAC, HEVC+EAC3, `mp4a.A5`, DTS, TrueHD e Opus. Tutte restituiscono `supported: true`. Questo risultato rappresenta la policy dell'app, non una prova dei decoder della Hisense. La policy influenza voci del menu e scelta del fallback audio iniziale.

`getPlaybackCapabilities()` esiste già, ma usa `canPlayType()` nativo. Non espone capacità MSE separate né probe dedicati per tutte queste famiglie audio. La selezione iniziale VIDAA HLS si basa sul tipo HLS generale; quella dei file diretti non sceglie fra backend in base al codec audio.

Riferimenti:

- `js/core/player/playerControllerMethods-12-get-playback-engine-candidates.js:32`, `:114`, `:169`;
- `js/core/player/engines/nativeVideoEngine.js:4`;
- `js/core/player/engines/dashJsEngine.js:8`.

Probe root: `canPlayType` positivo soltanto per HLS, negativo per AC3/EAC3; candidati ancora `["native-hls", "hls.js"]`, senza query codec specifiche durante la scelta dei candidati. È una misura della logica, non del firmware.

La specifica HTML descrive `canPlayType()` come indicazione con diversi livelli di confidenza: non è una riproduzione di prova. Fonte primaria: [HTML Standard, MIME types](https://html.spec.whatwg.org/multipage/media.html#mime-types).

### 1.3 Il punteggio delle varianti non è un filtro dei codec

`pickManifestVariant()` usa le capability native e penalizza AC3/EAC3, ma somma anche risoluzione e banda. Una penalità può essere superata dal punteggio qualità.

Riferimento: `js/ui/screens/player/playerScreenMethods-14-load-manifest-track-data-for-current-stream.js:237-311`.

Probe: `audioEac3: false`; AVC/EAC3 3840x2160 a 15 Mbps contro AVC/AAC 1280x720 a 2 Mbps. Vince la variante EAC3: punteggio 40 contro 26. Questo è il comportamento euristico attuale, non una prova di incompatibilità del campione sulla TV.

Inoltre, i `CODECS` delle varianti HLS sono associati alle tracce audio come liste combinate audio/video del gruppo. Non sempre descrivono un codec audio univoco.

Riferimento: `js/ui/screens/player/playerScreenMethods-12-normalize-embedded-audio-tracks.js:291`.

### 1.4 Ulteriori limiti della classificazione

`formatAudioCodecName()` tratta qualsiasi stringa contenente `mp4a` come AAC. Il probe `mp4a.A5` viene quindi etichettato AAC. Il registro MP4RA riporta A5/A6 come identificatori ritirati, storicamente AC3/EAC3, e AD come Opus: il prefisso da solo non identifica AAC.

Riferimento: `js/core/player/audioTrackCodecMetadata.js:36`. Fonte primaria: [MP4RA Object Types](https://mp4ra.org/registered-types/object-types). Gli identificatori ritirati non sono qui raccomandati come forma attuale.

`attemptSilentAudioRecovery()` restituisce sempre `false`. Esiste un fallback di engine su errore/stall, ma non una recovery effettiva da questo hook per video che avanza senza audio.

Riferimento: `js/ui/screens/player/playerScreenMethods-35-play-stream-candidate.js:319`.

## 2. Audio: enumerazione e successo della selezione

### 2.1 Successo dichiarato senza cambio effettivo

`setNativeAudioTrack()` assorbe gli errori nelle scritture `enabled`/`selected`, quindi restituisce `true`. `applyAudioTrack()` aggiorna selezione UI e, quando richiesto, preferenza persistita. Esiste anche un fallback UI che ripete le scritture senza conferma.

Riferimenti:

- `js/core/player/playerControllerMethods-15-set-playback-rate.js:64-107`;
- `js/ui/screens/player/playerScreenMethods-61-apply-audio-track.js:174-218`.

Probe con due tracce congelate, inizialmente `[true, false]`: richiesta indice 1; controller `true`, stato ancora `[true, false]`. Invocando il metodo UI reale, la UI passa a indice 1 e chiama una volta la memorizzazione della preferenza. La presenza di tracce che rifiutano la scrittura sul firmware rimane da verificare; l'assenza di conferma è dimostrata.

Una futura correzione del solo booleano del controller sarebbe incompleta se il fallback UI continuasse a registrare il successo. Va definito il contratto completo fra richiesta, lettura dello stato e UI, tenendo conto dei backend asincroni.

### 2.2 Enumeratori differenti leggono la stessa lista diversamente

Con una lista simulata `{ length: 2, item(i) }`, senza accesso numerico o iteratore:

```text
nativeAudioTrackListToArray: 0 tracce
trackListToArray della UI:   2 tracce
```

Il controller torna subito da `Array.from(...).filter(Boolean)`, anche se il risultato è vuoto; usa `item()` soltanto dopo un'eccezione. La UI usa il fallback anche dopo un risultato vuoto.

Riferimenti:

- `js/core/player/playerControllerMethods-02-is-likely-direct-file-url.js:339-357`;
- `js/ui/screens/player/playerScreenHelpers-08-track-list-to-array.js:223`.

È un'incoerenza riproducibile per questa forma di lista. Non è stata dimostrata tale forma sulla Hisense.

### 2.3 Due rendition HLS nello stesso gruppo possono cambiare soltanto la selezione UI

Fixture HLS: due tracce audio con URI diversi, entrambe nel gruppo `aud`; una variante video. `applyManifestTrackSelection()` sceglie la variante in base al gruppo, non l'URI della singola rendition. Se l'URL video è già attivo, aggiorna l'ID selezionato e termina senza un comando al player.

Probe: selezione English, URI audio `en.m3u8`, URL attivo `video.m3u8`, zero chiamate di avvio player. La voce selezionata cambia; il metodo non richiede il cambio della rendition audio.

Riferimenti: `js/ui/screens/player/playerScreenMethods-15-apply-manifest-track-selection.js:8-31`; `js/ui/screens/player/playerScreenMethods-14-load-manifest-track-data-for-current-stream.js:237`.

Il percorso è rilevante quando mancano liste audio dell'engine e vengono esposte voci ricavate dal manifest. Non giustifica caricare da solo un playlist audio perdendo il video.

### 2.4 Discovery di metadata non equivale a API native VIDAA

Per un file diretto VIDAA il discovery embedded può essere ammesso, ma `localMediaTracksRepository` tenta i servizi su `127.0.0.1:2710-2714`. Nel probe con richieste simulate fallite restituisce zero tracce. Non è un'enumerazione attraverso API Hisense.

Riferimenti: `js/ui/screens/player/playerScreenMethods-11-release-current-engine-fs-stream-best-effort.js:132-163`; `js/data/repository/localMediaTracksRepository.js:202-221`.

Se vengono forniti metadata embedded senza corrispondenti tracce native, alcuni percorsi di selezione chiamano API webOS che rifiutano VIDAA. I metadata non creano automaticamente una capacità di selezione.

## 3. Sottotitoli: selezione, renderer e modifiche

### Percorsi già esistenti

- Native/embedded esposti da `video.textTracks`: helper VIDAA con disabilitazione prima dell'attivazione e lettura di `mode`.
- hls.js/dash.js: selezione attraverso le API dell'engine condiviso.
- Addon VTT/SRT: fetch/conversione VTT e montaggio `<track>`.
- Addon ASS/SSA: raggiunge già ass.js dal fallback generale; in caso di fallimento converte a VTT.

Riferimenti: `js/platform/vidaa/vidaaVideo.js:3`; controller methods15:156-182; screen methods48:72-174, methods54:146-249, methods55:98-183.

### 3.1 La UI vanifica anche il fallimento della selezione testo

Dopo `setNativeTextTrack() == false`, `applySubtitleEntry()` ripete le assegnazioni e registra comunque l'indice. Probe con setter `mode` senza effetto: UI indice 1 mentre la prima traccia resta `showing`. OFF: UI -1, prima traccia ancora `showing`.

Riferimento: `js/ui/screens/player/playerScreenMethods-54-apply-subtitle-entry.js:251-275`.

### 3.2 Native e ASS possono rimanere attivi insieme

Il successo del ramo ASS esterno ritorna prima della disabilitazione delle tracce native. Il helper che disabilita le selezioni embedded metadata non interviene quando non esiste tale selezione.

Probe: traccia nativa già `showing`, poi ASS applicato; renderer ASS attivo e traccia ancora `showing`. Né l'adapter ASS né la libreria installata disabilitano automaticamente `textTracks`. Manca l'esclusione nel percorso dell'app; l'eventuale doppio disegno va osservato sulla TV.

Riferimenti: `js/ui/screens/player/playerScreenMethods-55-apply-fallback-addon-subtitle.js:95-125`; methods40:116; methods43:49-81.

### 3.3 Le modifiche shared vengono eseguite, ma non sono validate per il renderer Hisense

Su VIDAA i controlli nativi sono abilitati dalla policy condivisa. Dimensione, colore/opacità, bold e outline alimentano CSS `::cue`; offset/delay modificano i cue accessibili. Non esiste una verifica VIDAA che tali operazioni abbiano l'effetto visivo atteso.

Probe con cue mutabile: dimensione 150%, colore al 50%, bold/outline, tempo `1-4s` spostato a `2-5s`. Conferma il percorso applicativo, non la resa del firmware.

Riferimenti: screen methods24:260-325, methods25:223-307, methods26:93-111, methods52:422-453; `css/components-29.css:183-197`.

La preferenza renderer `html` non attiva su VIDAA l'overlay VTT/SRT dedicato Tizen/webOS: il percorso continua con `<track>`. Non basta quindi osservare il valore dell'impostazione per sapere quale renderer stia disegnando.

Per ASS la policy `preserveAssStyles` disabilita i controlli di stile su tutte le piattaforme; delay resta disponibile. Questo comportamento non è un'esclusione solo VIDAA. Auto Sync ASS ha invece un difetto separato: il corpo ASS viene mandato direttamente al parser SRT/VTT senza conversione; la fixture produce zero cue e il messaggio di righe mancanti.

Riferimenti: `js/core/player/subtitlePresentationCapabilities.js:23-47`; screen methods55:31, methods46:146, methods57:247, methods43:83-118.

## 4. Addons/Plugins e tastiera

Addons ordinaria, Shared Addons con URL e Plugins con repository sono percorsi diversi. Sono stati eseguiti handler reali con DOM/eventi simulati e azioni finali sostituite da spy; nessun addon/repository è stato installato.

1. `.focused` su Install, ma `activeElement` e target sull'input: Shared Addons attiva Install su Enter; Plugins preserva Enter. Shared consulta l'input DOM soltanto se manca un controllo `.focused`. Il normale evento focus dovrebbe riallineare gli stati: non è stato dimostrato il disallineamento sul firmware.
2. Input attivo, Backspace/8 con target DIV: il FocusEngine chiama Router.back. Con target INPUT non naviga. L'eccezione editing Back guarda il target, senza l'input attivo.
3. Modifica silenziosa seguita da focusout e submit: il fallback tastiera aggiorna correttamente il draft prima del submit. Rimane da verificare l'ordine reale degli eventi di chiusura/commit.

Riferimenti: `js/ui/screens/plugin/sharedPluginScreen.js:401-427`; `js/ui/screens/plugin/pluginsScreenMethods-04-refresh-repository.js:97`; `js/platform/sharedKeys.js:145`; `js/ui/navigation/focusEngine.js:145`; `js/platform/vidaa/vidaaKeyboard.js:79`.

## Verifiche eseguite

Le quattro suite seguenti sono passate durante l'indagine:

```text
node ./tests/test-vidaa-runtime.mjs
node ./tests/test-vidaa-text-input-routing.mjs
node ./tests/test-vidaa-remote-repeat.mjs
node ./tests/test-vidaa-addon-ui.mjs
```

Al controllo finale, modifiche concorrenti hanno rimosso dal checkout `test-vidaa-text-input-routing.mjs` e `test-vidaa-addon-ui.mjs`, oltre ad altri file, e modificato `vidaaNavigationActivity.js`. Queste operazioni non sono state effettuate da questa indagine. I risultati sopra si riferiscono alle esecuzioni precedenti a tali rimozioni; non attestano una riesecuzione del checkout finale. Nessun file rimosso è stato ripristinato.

Sono state inoltre eseguite le fixture isolate descritte sopra, da stdin, senza file nel repository o richieste media reali. Dove era coinvolto un fetch, la funzione era sostituita da una risposta/errore in memoria.

Queste suite non verificano decoder, resa sottotitoli o tastiera della TV. Il test audio runtime sostituisce l'enumeratore con una lista già fornita. Il test FocusEngine sostituisce la schermata con un raccoglitore eventi; i replay aggiuntivi hanno invece attraversato gli handler reali, mantenendo DOM e azioni finali simulati.

## Sequenza dei prossimi interventi

1. Definire una decisione esplicita per la promozione native-HLS -> MSE, usando informazioni del contenuto e distinguendo capacità native/MSE da supporto sconosciuto. Evitare sia una promozione indiscriminata sia una blacklist fissa VIDAA.
2. Rendere coerenti richiesta di traccia, fallimento, conferma e UI per audio/testo. Gestire anche il fallback UI; non persistire una selezione fallita come se fosse applicata. Correggere l'esclusione native/ASS con un caso di regressione mirato.
3. Verificare sulla TV le modifiche VTT/SRT per renderer; abilitare controlli basandosi sul percorso effettivo. Valutare overlay HTML soltanto se necessario e isolato, senza trasferire servizi webOS.
4. In parallelo, correggere input soltanto dopo aver identificato schermata e sequenza reale target/focus/Back. Il commit su blur ha già una prova positiva.

Una futura capacità VIDAA avrebbe quindi consumatori concreti: decisione engine, compatibilità/unknown nella UI e disponibilità dei controlli del renderer. Non occorre decidere ora che debba diventare una nuova classe o un servizio.

## Matrice minima sul dispositivo

Non dipendere da un solo stream. Usare campioni con codec verificati, contenitori validi e identica configurazione di uscita audio. Coprire AAC come riferimento, AC3/EAC3, DTS/TrueHD e Opus dove disponibili nei contenuti effettivamente usati.

Per ogni combinazione registrare: container e codec/profilo/canali reali; indicazioni `canPlayType` e `MediaSource.isTypeSupported` separate; pipeline iniziale e dopo discovery sottotitoli; audio udibile; tracce esposte; selezione richiesta e stato letto; errore dell'engine; uscita speaker/HDMI/ARC.

Ripetere il confronto HLS nativo/hls.js sullo stesso manifest; per file diretti non presumere che esista un engine alternativo o un decoder software/transcoder. Annotare anche le richieste metadata ai servizi locali.

Per sottotitoli: native -> VTT/SRT esterni -> ASS -> OFF; dimensione/colore/outline/offset/delay confrontati con il renderer attivo, non soltanto con l'impostazione salvata. Per input: schermata esatta, target e activeElement, Su/Giù/Back, commit finale e submit.
