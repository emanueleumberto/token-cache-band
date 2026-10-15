# token-cache-band

Mod per Claude che mostra, sopra il prompt, i token consumati e l'uso della cache: input, output, cache letta, cache scritta e percentuale di cache hit, per l'ultimo turno e per l'intera sessione.

## Aspetto

Dopo il primo turno compaiono due righe attenuate sopra il prompt:

```
Ultimo turno: in 100 · out 50 · cache letta 900 · cache scritta 0 · hit 90%
Sessione (1 turno): in 100 · out 50 · cache letta 900 · cache scritta 0 · hit 90%
```

Prima del primo turno, o mentre è attivo un sondaggio, la banda non viene mostrata. I valori superiori a mille sono abbreviati (`1.2k`). La banda è disegnata sulle superfici terminale e desktop.

## Installazione

Il repository GitHub `emanueleumberto/token-cache-band` deve esistere e contenere questa cartella alla radice (compreso `.claude-plugin/marketplace.json`).

Dal prompt di una sessione da terminale:

```
/plugin install token-cache-band --marketplace emanueleumberto/token-cache-band
```

Da shell:

```
claude plugin install token-cache-band --marketplace emanueleumberto/token-cache-band
```

Nell'app desktop, dove `/plugin` non è eseguibile: fare clic su + accanto al prompt, poi Plugins, Add marketplace con `emanueleumberto/token-cache-band`, quindi Add plugin.

## Disinstallazione

```
claude plugin uninstall token-cache-band
```

Facoltativamente, per rimuovere anche il marketplace: `claude plugin marketplace remove token-cache-band`.

## Opzioni

Impostabili dal menu di configurazione del plugin:

- `showStatus` (predefinito: disattivato): aggiunge a ogni turno la voce di stato «cache hit % · out», che ripete dati già presenti nella banda.
- `includeSubagents` (predefinito: disattivato): somma ai totali di sessione anche i token dei subagenti. «Ultimo turno» resta sempre riferito al thread principale.

## Note

- La percentuale di hit è: cache letta / (input non in cache + cache letta + cache scritta).
- I turni senza dati di consumo (interruzioni, errori API) non vengono contati.
- Le statistiche valgono per la sessione corrente e ripartono da zero a ogni nuova sessione.
- Con `includeSubagents` disattivato, il consumo dei subagenti non è incluso e il totale può risultare inferiore a quello reale.

## Sviluppo

```
claude plugin validate .
claude plugin test .
```

## Licenza

MIT (vedere `LICENSE`).
