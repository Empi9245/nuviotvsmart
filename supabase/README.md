# Backend condiviso Supabase

Un solo progetto Supabase gestisce account, profili, addon, libreria e avanzamento
di tutti gli utenti. URL e chiave pubblica vengono configurati nella build:
gli utenti installano l'app, creano un account e accedono. Nessun VPS, Docker,
server personale o nuova libreria nell'app.

Progetto indicato: `oltcrfpuccskppegnqwi`.

## Database

`npm run backend:prepare` genera `bootstrap.sql` dalle 11 migrazioni ufficiali
di [NuvioMedia/self-host](https://github.com/NuvioMedia/self-host), revisione
`39ea2bd1bc71636127f9d797599c23b4236960c4`. Sorgenti originali in `upstream/`,
licenza in `UPSTREAM-LICENSE`. Le modifiche per il servizio gestito rimuovono i
ruoli di monitoraggio del server e le modifiche ai privilegi di `supabase_admin`.
Lo script applica tutto in una transazione, abilita RLS su tutte le tabelle
pubbliche e conserva la lista esplicita di RPC autorizzate.

Va applicato una sola volta a un progetto nuovo e vuoto. Rifiuta l'esecuzione
se trova già le tabelle Nuvio. Non importa dati del backend precedente.
Gli avatar sono inclusi in `assets/avatars`; non occorre caricarli nello Storage.

## Collegamento dell'app

Usare `shared.example.properties` come base per `local.properties` e inserire
la chiave **publishable**. È supportata anche la chiave pubblica `anon` legacy.
Password del database, chiavi secret e `service_role` restano fuori dall'app.
La build rifiuta le chiavi privilegiate. Il backend condiviso usa email/password
e include il pulsante **Crea account**. Non usa il QR del sito Nuvio originale.
Il progetto resta collegato per tutti gli utenti della stessa build.

## Attivazione e verifica

Prima di pubblicare: applicare lo schema, eseguire `verify.sql`, controllare gli
advisor Supabase, e verificare che due account possano leggere soltanto i propri
dati. Provare registrazione, accesso e sincronizzazione da due dispositivi.
Le funzioni di abbonamento del backend ufficiale non vengono richieste.

La conferma email è gestita dalle impostazioni Auth del progetto. Se abilitata,
l'app chiede di confermare l'email prima dell'accesso. Per registrazioni pubbliche
con conferma serve configurare l'invio email di produzione: il servizio SMTP
predefinito Supabase è destinato ai test.
Vedere [la documentazione Auth](https://supabase.com/docs/guides/auth/passwords).

I test locali coprono configurazione condivisa, chiavi publishable, accesso,
registrazione e modalità locale senza chiamate al vecchio backend. Il test della
Home usa il DOM reale nel browser: aprire `tests/test-vidaa-home-patching.html`
con il server di sviluppo. Nessuna dipendenza aggiuntiva per i test.

L'app resta utilizzabile localmente se il backend non è ancora configurato.
La fluidità va misurata su una TV VIDAA reale; i test nel browser non misurano gli FPS.
