# token-cache-band

Mod per Claude che mostra, sopra il prompt, i token consumati e l'uso della cache: input, output, cache letta, cache scritta e percentuale di cache hit, per l'ultimo turno e per l'intera sessione.

## Aspetto

Dopo il primo turno compare sopra il prompt un riquadro con bordo arrotondato, icone colorate ed etichette in chiaro:

```
╭─────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────╮
│ Ultimo turno          ↓ Input: 100 │ ↑ Output: 50 │ ◆ Cache letta: 900 │ ◇ Cache scritta: 0 │ ● Cache hit: █████████░ 90%   │
│ Sessione · 1 turno    ↓ Input: 100 │ ↑ Output: 50 │ ◆ Cache letta: 900 │ ◇ Cache scritta: 0 │ ● Cache hit: █████████░ 90%   │
│ Contesto              ▣ Usato: 84k / 200k │ ● Riempimento: ████░░░░░░ 42%                                              │
╰─────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────╯
```

Ogni valore è in grassetto nel colore della sua icona. La barra e la percentuale di hit sono verdi da 70% in su, gialle da 30% e rosse sotto. La riga si adatta alla larghezza: sotto 136 colonne le etichette si accorciano (`In`, `Out`, `Letta`, `Scritta`, `Hit`), sotto 110 sparisce anche la barra; con meno di 4 righe disponibili sparisce la cornice.

La riga «Contesto» mostra quanto è pieno il contesto della sessione principale: i token dell'ultima risposta sulla finestra del modello e la percentuale, gli stessi numeri della status line. È verde sotto il 50%, gialla fino all'80% e rossa oltre. Si aggiorna dopo ogni turno principale; subito dopo un `/compact`, finché non arriva una nuova risposta, non compare. La cornice compare solo se c'è spazio per tutte le righe più il bordo.

Prima del primo turno, o mentre è attivo un sondaggio, la banda non viene mostrata. I valori da mille in su sono abbreviati in migliaia e milioni, senza `.0` finale (`1.2k`, `2k`, `3.4M`). La banda è disegnata sulle superfici terminale e desktop.

### Vista di un agente

Quando dall'elenco delle attività si apre la trascrizione di un subagente, la banda mostra i conteggi di quell'agente: «Ultimo turno» è il suo ultimo turno e la seconda riga diventa «Agente · N turni». La riga «Contesto» non compare, perché riguarda la sessione principale. Funziona anche con `includeSubagents` disattivato. Se l'agente non ha ancora turni con dati di consumo, la banda non compare.

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
- `includeSubagents` (predefinito: disattivato): somma ai totali di sessione anche i token dei subagenti. Il conteggio dei turni li tiene separati (`Sessione · 12 turni + 5 sub`). «Ultimo turno» resta sempre riferito al thread principale: se finora hanno lavorato solo subagenti, quella riga non compare.

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
