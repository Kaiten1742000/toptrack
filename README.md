# TOP TRACK

Musik-Quiz: Ein zufälliger Künstler, 8 seiner Songs. Welcher hat die meisten Streams auf Spotify?

- Echte Spotify-Zahlen (monatliche Hörer, Streams pro Song) von [kworb.net](https://kworb.net/spotify/)
- Filter nach Sprache und monatlichen Hörern
- Reinhören per 30-Sekunden-Hörprobe oder eingebettetem Spotify-Player
- Daten aktualisieren sich **jeden Montag automatisch** per GitHub Actions

## Einrichtung (einmalig, ca. 5 Minuten)

1. **Repository anlegen:** Auf github.com → *New repository* → Name z. B. `toptrack` → **Public** → *Create repository*.
2. **Dateien hochladen:** Im neuen Repository → *Add file* → *Upload files* → den kompletten Inhalt dieses Ordners hineinziehen (inklusive des Ordners `.github`) → *Commit changes*.
3. **Rechte für den Bot:** *Settings → Actions → General → Workflow permissions* → **Read and write permissions** → *Save*.
4. **Ersten Datenlauf starten:** *Actions* → *Spotify-Daten aktualisieren* → *Run workflow*. Dauert ca. 10–15 Minuten.
5. **Webseite einschalten:** *Settings → Pages* → *Source: Deploy from a branch* → Branch `main`, Ordner `/ (root)` → *Save*.
   Nach 1–2 Minuten ist das Spiel erreichbar unter `https://DEIN-NAME.github.io/toptrack/`.

## Dateien

| Datei | Zweck |
|---|---|
| `index.html` | Das Spiel |
| `toptrack-daten.js` | Die Spotify-Daten (wird automatisch erzeugt) |
| `scripts/build-data.mjs` | Sammelt die Daten von kworb.net und bestimmt die Sprache |
| `.github/workflows/update-data.yml` | Startet das Sammeln jeden Montag |

## Anpassen

- **Häufigkeit:** In `update-data.yml` die Zeile `cron: "17 3 * * 1"` ändern (z. B. `"17 3 * * *"` = täglich).
- **Falsch einsortierte Künstler:** In `scripts/build-data.mjs` bei `OVERRIDES` eintragen, z. B. `"Künstlername":"de"`.
  Sprachen: `de` `en` `es` `fr` `it` `pt` `ko` `ja` `tr`, `xx` = ausblenden.
- **Lokal laufen lassen:** `node scripts/build-data.mjs` (Node 18+).

Die Daten stammen von kworb.net, einer privaten Seite. Das Skript fragt sie deshalb nur einmal pro Woche und mit kleinen Pausen ab.
