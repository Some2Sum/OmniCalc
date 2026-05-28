Führe einen vollständigen Pre-Deployment-Check für die OmniCalc App durch. Die App besteht aus drei Dateien: `index.html`, `style.css`, `app.js`.

Führe die folgenden Checks der Reihe nach aus und berichte das Ergebnis für jeden Check als ✅ PASS oder ❌ FAIL mit einer kurzen Begründung.

## Check 1 – JS-Syntax
Führe `node --check app.js` aus (im Projektverzeichnis `C:\Users\nilsw\Abakus3000`). Kein Output = kein Syntaxfehler = PASS.

## Check 2 – Datei-Referenzen in index.html
Lies `index.html` und prüfe:
- Enthält `<link rel="stylesheet" href="style.css">`
- Enthält `<script src="app.js"></script>`

## Check 3 – DOM-IDs vollständig
Extrahiere alle `getElementById('...')` Aufrufe aus `app.js`. Prüfe für jede gefundene ID, ob sie als `id="..."` in `index.html` vorkommt. Liste fehlende IDs auf (FAIL), oder bestätige dass alle vorhanden sind (PASS).

## Check 4 – Git-Status
Führe `git status --short` aus. Wenn die Ausgabe leer ist → PASS (nichts uncommitted). Wenn Änderungen vorhanden → FAIL mit Liste der geänderten Dateien.

## Abschluss
Gib eine Zusammenfassung aus:
- Alle 4 Checks PASS → "✅ Deployment bereit."
- Mindestens 1 FAIL → "❌ Deployment gestoppt – bitte Fehler beheben."
