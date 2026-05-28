# Abakus3000 – KH-Rechner

Kohlenhydrat-Rechner für Diabetiker. Einzelne HTML-Datei, kein Framework, kein Build-Step.

## Architektur

Fünf Dateien plus PWA-Assets, kein Build-Step, kein Framework:
- `index.html` – HTML-Struktur
- `style.css` – alle Styles
- `app.js` – gesamte Logik
- `manifest.json` – PWA-Manifest (Name, Icons, Theme-Color)
- `sw.js` – Service Worker (Cache-First für App-Shell, Network-Only für APIs)
- `icon-192.svg` / `icon-512.svg` – Home-Screen-Icons

Für HTTPS auf Mobilgeräten (Kamera-Zugriff): `npx serve` + `npx cloudflared tunnel --url http://localhost:8080` (zwei Terminals).

## State & Persistenz

```js
let state = {
  myFoods: [],  // {id, name, carbs100g, source, portionG}
  myMeals: [],  // {id, name, items:[{id,name,carbs100g,amount,source}]}
  meal: [],     // aktuelle Mahlzeit: [{id,name,carbs100g,amount,source}]
};
```

localStorage-Key: `kh_v1`. Onboarding-Flag: `kh_onboarded`.

## APIs

**BLS** (`https://blsdb.de/api/food/search?query=…`)
- CORS-Fehler sind normal und werden still geschluckt – `apiBLS()` gibt `null` zurück, kein Error-Banner.
- Felder-Namen im Response sind inkonsistent → defensive Multi-Key-Auflösung im Code.

**Open Food Facts** (`world.openfoodfacts.org/cgi/search.pl`)
- Parameter: `page_size=50`, `sort_by=popularity_key`, `lc=de&cc=de`, `fields=product_name,product_name_de,nutriments,brands`.
- Bevorzuge `product_name_de`, Fallback auf `product_name`.
- Barcode-Lookup: `/api/v0/product/{barcode}.json`.
- Nur OFF-Fehler zeigen den Error-Banner (BLS ist optional/ergänzend).

## Suchpipeline

Wichtig: nicht vereinfachen ohne Grund – jede Stufe löst ein konkretes Problem.

1. **`timedFetch`** – AbortController mit 7 s Timeout (BLS hängt sonst unbegrenzt).
2. **`_searchSeq`** – Race-Condition-Schutz: veraltete Responses werden verworfen.
3. **`_qCache`** – Session-Cache, 3-Minuten-TTL, max. 40 Einträge.
4. **OFF-Retry** – einmaliger Retry nach 1,2 s bei OFF-Fehler.
5. **`normDE()`** – Umlaut-Normalisierung (ä→a, ö→o, ü→u, ß→ss) für Vergleiche.
6. **`relevance()`** – 7-stufiges Scoring (100/90/78/62/48/32/8).
7. **`sortKey()`** – `relevance × 1000 − wordCount` als Tiebreaker (kürzere Namen gewinnen).
8. **`germanVariants()`** – Wortform-Fallback via OFF wenn 0 Ergebnisse.
9. **Deduplizierung** – normDE-Key, max. 42 Zeichen.

## Tabs & Navigation

3 Tabs: `search` | `meal` | `favorites`

`showTab(name)` schaltet Pages und Tab-Buttons. `favorites` ruft `renderFoods()` + `renderMeals()` auf. Der Scan-Button im Suchen-Tab öffnet das Scanner-Overlay direkt (kein Tab-Wechsel).

## Design-Sprache

- Farben: warme Erdtöne (`--primary: #5C7B6B`, `--bg: #F4F0EA`, `--secondary: #C4936A`).
- Keine Emojis – nur minimalistische SVG-Icons, sparsam eingesetzt.
- Buttons: immer mit sichtbarer Border oder Hintergrund erkennbar. `del-btn` hat `border: 1.5px solid var(--border)`.
- Button-Feedback: `:active` skaliert auf 95 % + `flashBtn()` für done-States (grün) und undone-States (rot).
- Kein Footer. Persistente KH-Leiste (`kh-bar`, 36 px) über der Tab-Bar, sichtbar auf allen Tabs.
- KH-Rechner-Tab hat Kalkulator-Optik: dunkles Display oben, Items als „Quittung", große Eingabe-Tasten unten.

## Wichtige Funktionen

| Funktion | Zweck |
|---|---|
| `refreshFooter()` | KH-Summe neu berechnen → Display, Badge, KH-Bar |
| `updateFavCounts()` | Zähler in Favoriten-Section-Headern aktualisieren |
| `flashBtn(el, cls, ms)` | Kurzes visuelles Feedback auf Button (`btn-flash-ok` / `btn-flash-warn`) |
| `saveFood(item, portionG)` | Lebensmittel speichern; gibt `false` bei Duplikat/kein KH-Wert |
| `openFoodModal(id)` | Mengen-Modal öffnen, befüllt mit gespeicherter `portionG` als Default |
| `openFavPicker()` | Bottom-Sheet mit Favoriten im KH-Rechner-Tab |

## Einheiten (g / ml)

Lebensmittel haben ein `unit`-Feld (`'g'` oder `'ml'`, Default `'g'`). Die KH-Berechnung ist identisch (`carbs100 × amount / 100`), nur die Anzeige ändert sich. Das `unit`-Feld wird in `saveFood()`, `addToMeal()` und allen Render-Funktionen propagiert. Suchkarten zeigen einen Toggle-Button (`.unit-toggle`) zwischen g und ml.

## PWA / Service Worker

Cache-Name in `sw.js`: `omnicalc-v1`.

**Nach jeder Änderung an `index.html`, `style.css` oder `app.js` muss der Cache-Name erhöht werden** (z.B. `omnicalc-v2`), damit Nutzer mit installierter PWA die neue Version erhalten. Der SW löscht beim Aktivieren automatisch alle Caches mit altem Namen.

API-Calls (BLS, OFF, ZXing CDN) werden nie gecacht – immer live. Nur die App-Shell liegt im Cache.

## Was vermeiden

- Kein `console.error` für erwartete API-Fehler (BLS CORS) – nur `console.warn`.
- KH-Summe nie direkt aus dem DOM lesen – immer aus `state.meal` berechnen.
- `renderFoods()` / `renderMeals()` rufen `updateFavCounts()` intern auf – nicht doppelt aufrufen.
- Keine neuen App-Dateien anlegen – Logik bleibt in `app.js`, Styles in `style.css`, Struktur in `index.html`. PWA-Infrastruktur (Manifest, SW, Icons) ist die Ausnahme.
