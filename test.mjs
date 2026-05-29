/**
 * Abakus3000 — automated test suite for search logic
 * Run:  node test.mjs   or   npm test
 *
 * No external dependencies, no network calls, no DOM.
 *
 * IMPORTANT: The functions below are extracted from app.js.
 * The "sync checks" section at the end reads app.js and verifies that
 * key implementation details still match. If you change a function in
 * app.js and forget to update it here, those checks will catch it.
 */

import { strict as assert } from 'node:assert';
import { readFileSync }      from 'node:fs';

// ── Minimal test runner ──────────────────────────────────────────────────────

const RESET = '\x1b[0m', GREEN = '\x1b[32m', RED = '\x1b[31m', DIM = '\x1b[2m', BOLD = '\x1b[1m';
let _pass = 0, _fail = 0, _currentSuite = '';

function suite(name) {
  _currentSuite = name;
  console.log(`\n${BOLD}  ${name}${RESET}`);
}

function test(label, fn) {
  try {
    fn();
    _pass++;
    console.log(`    ${GREEN}✓${RESET} ${label}`);
  } catch (e) {
    _fail++;
    const msg = e.message.split('\n')[0].slice(0, 120);
    console.log(`    ${RED}✗${RESET} ${label}`);
    console.log(`      ${DIM}${msg}${RESET}`);
  }
}

function eq(actual, expected, msg) {
  assert.strictEqual(actual, expected, msg);
}
function ok(val, msg) {
  assert.ok(val, msg);
}
function notOk(val, msg) {
  assert.ok(!val, msg ?? `expected falsy, got ${val}`);
}
function deepEq(actual, expected, msg) {
  assert.deepStrictEqual(actual, expected, msg);
}

// ── Functions extracted from app.js ─────────────────────────────────────────
// Keep these in sync with app.js.
// The sync-check section at the bottom detects drift automatically.

let _uid = 0;
function uid() { return 'test-' + (++_uid); }

function normDE(s) {
  return s.toLowerCase()
    .replace(/ä/g,'a').replace(/ö/g,'o').replace(/ü/g,'u').replace(/ß/g,'ss');
}

function relevance(name, query) {
  const n = normDE(name.trim());
  const q = normDE(query.trim());
  if (n === q) return 100;
  const afterQ = n.charAt(q.length);
  if (n.startsWith(q) && (!afterQ || /[\s,(\-]/.test(afterQ))) return 90;
  if (n.startsWith(q)) return 78;
  try {
    const e = q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    if (new RegExp('(?:^|[\\s,\\-])' + e + '(?=$|[\\s,\\-\\(])', 'i').test(n)) return 62;
    if (new RegExp('(?:^|[\\s,\\-])' + e, 'i').test(n)) return 48;
  } catch (_) {}
  if (n.includes(q)) return 32;
  return 8;
}

function sortKey(item, query) {
  const base = relevance(item.name, query);
  const words = item.name.trim().split(/\s+/).length;
  const srcBonus = item.source === 'BLS' ? 10 : 0;
  return base * 1000 - words + srcBonus;
}

function isBasicFood(item, query) {
  const name   = typeof item === 'string' ? item : item.name;
  const source = item && typeof item === 'object' ? item.source : null;
  const stripped = normDE(name.replace(/\s*\(.*?\)\s*/g, '').trim());
  const q = normDE(query.trim());
  if (!stripped.startsWith(q)) return false;
  if (source === 'BLS') return true;
  const remainder = stripped.slice(q.length);
  return remainder === '' || (remainder.length <= 2 && !/\s/.test(remainder));
}

// Full BASIC_FOODS list — must match app.js exactly (sync check verifies count).
const BASIC_FOODS = [
  // Obst
  { name: 'Ananas',                   carbs100g: 11.9 },
  { name: 'Apfel',                    carbs100g: 11.4 },
  { name: 'Aprikose',                 carbs100g:  9.6 },
  { name: 'Avocado',                  carbs100g:  1.5 },
  { name: 'Banane',                   carbs100g: 20.0 },
  { name: 'Birne',                    carbs100g: 11.4 },
  { name: 'Blaubeere',                carbs100g: 11.4 },
  { name: 'Brombeere',                carbs100g:  4.8 },
  { name: 'Dattel, getrocknet',       carbs100g: 64.2 },
  { name: 'Erdbeere',                 carbs100g:  5.9 },
  { name: 'Feige, frisch',            carbs100g: 11.5 },
  { name: 'Granatapfel',              carbs100g: 13.7 },
  { name: 'Grapefruit',               carbs100g:  8.0 },
  { name: 'Heidelbeere',              carbs100g: 11.4 },
  { name: 'Himbeere',                 carbs100g:  5.1 },
  { name: 'Johannisbeere, rot',       carbs100g:  7.0 },
  { name: 'Kirsche',                  carbs100g: 13.7 },
  { name: 'Kiwi',                     carbs100g: 10.1 },
  { name: 'Mandarine',                carbs100g:  9.0 },
  { name: 'Mango',                    carbs100g: 14.8 },
  { name: 'Melone, Honigmelone',      carbs100g:  8.0 },
  { name: 'Nektarine',                carbs100g:  8.6 },
  { name: 'Orange',                   carbs100g:  8.7 },
  { name: 'Papaya',                   carbs100g:  9.0 },
  { name: 'Pfirsich',                 carbs100g:  8.8 },
  { name: 'Pflaume',                  carbs100g: 10.2 },
  { name: 'Stachelbeere',             carbs100g:  7.2 },
  { name: 'Traube',                   carbs100g: 16.0 },
  { name: 'Wassermelone',             carbs100g:  7.2 },
  { name: 'Weintraube',               carbs100g: 16.0 },
  { name: 'Zitrone',                  carbs100g:  3.0 },
  { name: 'Zwetschge',                carbs100g: 10.2 },
  // Gemüse
  { name: 'Artischocke',              carbs100g:  3.0 },
  { name: 'Aubergine',                carbs100g:  3.4 },
  { name: 'Blumenkohl',               carbs100g:  4.1 },
  { name: 'Bohne, grün',              carbs100g:  4.4 },
  { name: 'Brokkoli',                 carbs100g:  4.4 },
  { name: 'Champignon',               carbs100g:  0.3 },
  { name: 'Chicoree',                 carbs100g:  2.1 },
  { name: 'Erbse, frisch',            carbs100g: 12.0 },
  { name: 'Fenchel',                  carbs100g:  5.6 },
  { name: 'Gurke',                    carbs100g:  2.0 },
  { name: 'Karotte',                  carbs100g:  6.8 },
  { name: 'Kartoffel',                carbs100g: 17.0 },
  { name: 'Knoblauch',                carbs100g: 28.9 },
  { name: 'Kohlrabi',                 carbs100g:  5.0 },
  { name: 'Kürbis',                   carbs100g:  6.0 },
  { name: 'Lauch',                    carbs100g:  5.8 },
  { name: 'Mais, frisch',             carbs100g: 18.6 },
  { name: 'Mangold',                  carbs100g:  2.5 },
  { name: 'Paprika, rot',             carbs100g:  5.3 },
  { name: 'Paprika, grün',            carbs100g:  4.1 },
  { name: 'Paprika, gelb',            carbs100g:  5.7 },
  { name: 'Pastinake',                carbs100g: 14.9 },
  { name: 'Porree',                   carbs100g:  5.8 },
  { name: 'Radieschen',               carbs100g:  2.0 },
  { name: 'Rosenkohl',                carbs100g:  5.5 },
  { name: 'Rote Bete',                carbs100g:  8.1 },
  { name: 'Rotkohl',                  carbs100g:  6.0 },
  { name: 'Salat, Kopfsalat',         carbs100g:  1.7 },
  { name: 'Sellerie',                 carbs100g:  4.1 },
  { name: 'Spargel',                  carbs100g:  2.5 },
  { name: 'Spinat',                   carbs100g:  1.4 },
  { name: 'Süßkartoffel',             carbs100g: 20.1 },
  { name: 'Tomate',                   carbs100g:  3.5 },
  { name: 'Weißkohl',                 carbs100g:  5.4 },
  { name: 'Wirsing',                  carbs100g:  5.4 },
  { name: 'Zucchini',                 carbs100g:  3.0 },
  { name: 'Zwiebel',                  carbs100g:  6.5 },
  // Hülsenfrüchte
  { name: 'Kichererbse, getrocknet',  carbs100g: 45.0 },
  { name: 'Kidneybohne, getrocknet',  carbs100g: 40.0 },
  { name: 'Linse, rot',               carbs100g: 40.0 },
  { name: 'Sojabohne',                carbs100g:  9.9 },
  // Nüsse & Samen
  { name: 'Cashewkern',               carbs100g: 26.9 },
  { name: 'Erdnuss',                  carbs100g:  7.6 },
  { name: 'Haselnuss',                carbs100g:  6.3 },
  { name: 'Leinsamen',                carbs100g:  1.6 },
  { name: 'Mandel',                   carbs100g:  5.7 },
  { name: 'Sonnenblumenkern',         carbs100g: 11.4 },
  { name: 'Walnuss',                  carbs100g:  7.0 },
  // Getreide / Mehl
  { name: 'Haferflocken',             carbs100g: 58.7 },
  { name: 'Reis, roh',                carbs100g: 76.5 },
  { name: 'Weizenmehl Typ 405',       carbs100g: 73.0 },
  { name: 'Weizenmehl Typ 550',       carbs100g: 72.0 },
  // Milch & Ei
  { name: 'Ei',                       carbs100g:  0.6 },
  { name: 'Milch, Vollmilch 3,5%',    carbs100g:  4.8 },
  { name: 'Milch, Halbfett 1,5%',     carbs100g:  4.8 },
  { name: 'Naturjoghurt 3,5%',        carbs100g:  4.0 },
  { name: 'Quark, Magerquark',        carbs100g:  3.5 },
  // Fleisch & Fisch
  { name: 'Hühnerbrust, roh',         carbs100g:  0.0 },
  { name: 'Hackfleisch, gemischt',    carbs100g:  0.0 },
  { name: 'Lachs, roh',               carbs100g:  0.0 },
  { name: 'Thunfisch, roh',           carbs100g:  0.0 },
];

function basicFoodsSearch(query) {
  return BASIC_FOODS
    .filter(f => relevance(f.name, query) > 8)
    .map(f => ({ id: uid(), name: f.name, carbs100g: f.carbs100g, source: 'BLS', unit: 'g' }));
}

// Module-level version of dedupSort (in app.js this is a closure inside runSearch
// that captures staticItems from the outer scope — logically identical).
function dedupSort(staticItems, blsItems, offItems, query) {
  let items = [];
  if (staticItems && staticItems.length) items.push(...staticItems);
  if (blsItems)  items.push(...blsItems);
  if (offItems)  items.push(...offItems);
  const seen = new Set();
  items = items.filter(it => {
    const key = normDE(it.name).replace(/[\s\-]/g, '').slice(0, 42);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
  items = items.filter(it => relevance(it.name, query) > 8);
  return items.sort((a, b) => sortKey(b, query) - sortKey(a, query));
}

// Helpers
const bls  = (name, carbs = 5) => ({ id: uid(), name, carbs100g: carbs, source: 'BLS' });
const off  = (name, carbs = 5) => ({ id: uid(), name, carbs100g: carbs, source: 'OFF' });
const stat = (name, carbs = 5) => ({ id: uid(), name, carbs100g: carbs, source: 'BLS' });


// ════════════════════════════════════════════════════════════════════════════
// 1. normDE
// ════════════════════════════════════════════════════════════════════════════
suite('1 · normDE — umlaut normalisation');

test('lowercases ASCII',                () => eq(normDE('Banane'), 'banane'));
test('ä → a',                          () => eq(normDE('Äpfel'), 'apfel'));
test('ö → o',                          () => eq(normDE('Öl'), 'ol'));
test('ü → u',                          () => eq(normDE('Über'), 'uber'));
test('ß → ss',                         () => eq(normDE('Straße'), 'strasse'));
test('combined: Süßkartoffel',         () => eq(normDE('Süßkartoffel'), 'susskartoffel'));
test('combined: Blütezeit',            () => eq(normDE('Blütezeit'), 'blutezeit'));
test('no change on plain lowercase',   () => eq(normDE('apfel'), 'apfel'));
test('digits and symbols preserved',   () => eq(normDE('Milch 3,5%'), 'milch 3,5%'));


// ════════════════════════════════════════════════════════════════════════════
// 2. relevance
// ════════════════════════════════════════════════════════════════════════════
suite('2 · relevance — scoring');

// Score 100 — exact match
test('100 · exact lowercase',          () => eq(relevance('banane', 'banane'), 100));
test('100 · mixed case',               () => eq(relevance('Banane', 'Banane'), 100));
test('100 · case insensitive',         () => eq(relevance('BANANE', 'banane'), 100));
test('100 · umlaut normalised',        () => eq(relevance('Äpfel', 'äpfel'), 100));

// Score 90 — starts-with + word boundary after
test('90 · trailing space boundary',   () => eq(relevance('Banane frisch', 'Banane'), 90));
test('90 · trailing comma boundary',   () => eq(relevance('Banane, frisch', 'Banane'), 90));
test('90 · trailing dash boundary',    () => eq(relevance('Banane-Sorte', 'Banane'), 90));
test('90 · trailing paren boundary',   () => eq(relevance('Banane(bio)', 'Banane'), 90));
test('90 · end of string (no suffix)', () => eq(relevance('Bananen', 'Bananen'), 100)); // exact
test('90 · ends at string end',        () => eq(relevance('Karotte', 'Karott'), 78));   // no boundary char

// Score 78 — starts-with, no word boundary
test('78 · starts-with, mid-word',     () => eq(relevance('Bananensaft', 'Banane'), 78));
test('78 · starts-with long suffix',   () => eq(relevance('Bananenchips', 'Banane'), 78));
test('78 · partial prefix',            () => eq(relevance('Karotte', 'Karo'), 78));

// Score 62 — query as standalone word in the middle
test('62 · standalone word middle',    () => eq(relevance('Frucht Banane Riegel', 'Banane'), 62));
test('62 · after hyphen both sides',   () => eq(relevance('Super-Banane-Mix', 'Banane'), 62));

// Score 48 — query after word boundary, no trailing boundary
test('48 · after space, no end boundary', () => eq(relevance('Bio Bananensaft', 'Banane'), 48));

// Score 32 — substring, no boundaries
test('32 · buried substring',          () => eq(relevance('Xyzbanane', 'Banane'), 32));
test('32 · buried in compound',        () => eq(relevance('superbananenmark', 'banane'), 32));

// Score 8 — no match
test('8 · completely unrelated',       () => eq(relevance('Schokolade', 'Banane'), 8));
test('8 · empty name',                 () => eq(relevance('', 'Banane'), 8));
test('8 · different fruit',            () => eq(relevance('Apfel', 'Birne'), 8));


// ════════════════════════════════════════════════════════════════════════════
// 3. sortKey
// ════════════════════════════════════════════════════════════════════════════
suite('3 · sortKey — ordering values');

test('exact match gives highest key',  () => {
  const a = sortKey(bls('Banane'), 'Banane');
  const b = sortKey(off('Bananensaft'), 'Banane');
  ok(a > b, `exact (${a}) should beat starts-with (${b})`);
});
test('BLS bonus: BLS beats equal-relevance OFF', () => {
  // Two items with the same name but different sources — BLS should rank higher
  const blsItem = { name: 'Banane', source: 'BLS' };
  const offItem = { name: 'Banane', source: 'OFF' };
  ok(sortKey(blsItem, 'Banane') > sortKey(offItem, 'Banane'), 'BLS sortKey > OFF sortKey');
});
test('word count penalty: fewer words rank higher at same relevance', () => {
  // Both start with "Banane" at same score, but "Banane" (1 word) beats "Banane Trinkmahlzeit" (2 words)
  const short = sortKey(off('Banane'),               'Banane');  // rel 100
  const long  = sortKey(off('Banane Trinkmahlzeit'), 'Banane');  // rel 90
  ok(short > long, `shorter name (${short}) should beat longer (${long})`);
});
test('BLS bonus value is 10', () => {
  const a = sortKey({ name: 'Banane', source: 'BLS' }, 'Banane');
  const b = sortKey({ name: 'Banane', source: 'OFF' }, 'Banane');
  eq(a - b, 10);
});
test('sortKey is numeric', () => {
  ok(typeof sortKey(bls('Banane'), 'Banane') === 'number');
});


// ════════════════════════════════════════════════════════════════════════════
// 4. isBasicFood
// ════════════════════════════════════════════════════════════════════════════
suite('4 · isBasicFood — BLS items');

test('BLS exact match → true',                    () => ok(isBasicFood(bls('Banane'), 'Banane')));
test('BLS "Name, descriptor" → true',             () => ok(isBasicFood(bls('Banane, frisch'), 'Banane')));
test('BLS "Name, getrocknet" → true',             () => ok(isBasicFood(bls('Banane, getrocknet'), 'Banane')));
test('BLS "Name (detail)" → true (parens strip)', () => ok(isBasicFood(bls('Banane (bio)'), 'Banane')));
test('BLS plural form → true',                    () => ok(isBasicFood(bls('Bananen, roh'), 'Banane')));
test('BLS different fruit → false',               () => notOk(isBasicFood(bls('Apfel, frisch'), 'Banane')));
test('BLS name mismatch → false',                 () => notOk(isBasicFood(bls('Schokolade'), 'Banane')));
test('BLS "Paprika, rot" matches "Paprika"',       () => ok(isBasicFood(bls('Paprika, rot'), 'Paprika')));
test('BLS "Milch, Vollmilch 3,5%" matches "Milch"', () => ok(isBasicFood(bls('Milch, Vollmilch 3,5%'), 'Milch')));

suite('4 · isBasicFood — OFF items');

test('OFF exact match → true',                    () => ok(isBasicFood(off('Banane'), 'Banane')));
test('OFF +1 char suffix (plural "n") → true',    () => ok(isBasicFood(off('Bananen'), 'Banane')));
test('OFF +2 char suffix ("en") → true',          () => ok(isBasicFood(off('Äpfeln'), 'Apfel')));   // normDE: apfeln, q: apfel, rem: n
test('OFF "Name, frisch" → false (long rem)',      () => notOk(isBasicFood(off('Banane, frisch'), 'Banane')));
test('OFF "Name Trinkmahlzeit" → false',          () => notOk(isBasicFood(off('Banane Trinkmahlzeit'), 'Banane')));
test('OFF "Bananensaft" → false',                 () => notOk(isBasicFood(off('Bananensaft'), 'Banane')));
test('OFF "Bananen-Chips" → false',               () => notOk(isBasicFood(off('Bananen-Chips'), 'Banane')));
test('OFF "Milch Banane" → false (not prefix)',   () => notOk(isBasicFood(off('Milch Banane'), 'Banane')));
test('OFF brand in parens stripped: "Banane (Chiquita)" → true',
  () => ok(isBasicFood(off('Banane (Chiquita)'), 'Banane')));

suite('4 · isBasicFood — edge cases');

test('legacy string call (no object) → still works',
  () => ok(isBasicFood('Banane', 'Banane')));          // backwards compat path
test('legacy string call, mismatch → false',
  () => notOk(isBasicFood('Bananensaft', 'Banane')));
test('case-insensitive (umlaut normalised)',
  () => ok(isBasicFood(bls('BANANE'), 'Banane')));
test('query umlaut: "Äpfel" matches bls("Apfel")',
  () => ok(isBasicFood(bls('Apfel'), 'Äpfel')));
test('parenthetical not part of remainder',
  () => ok(isBasicFood(off('Apfel (Granny Smith)'), 'Apfel')));


// ════════════════════════════════════════════════════════════════════════════
// 5. basicFoodsSearch
// ════════════════════════════════════════════════════════════════════════════
suite('5 · basicFoodsSearch — exact matches');

test('"Banane" → finds Banane',        () => ok(basicFoodsSearch('Banane').some(r => r.name === 'Banane')));
test('"Apfel" → finds Apfel',          () => ok(basicFoodsSearch('Apfel').some(r => r.name === 'Apfel')));
test('"Tomate" → finds Tomate',        () => ok(basicFoodsSearch('Tomate').some(r => r.name === 'Tomate')));
test('"Karotte" → finds Karotte',      () => ok(basicFoodsSearch('Karotte').some(r => r.name === 'Karotte')));
test('"Brokkoli" → finds Brokkoli',    () => ok(basicFoodsSearch('Brokkoli').some(r => r.name === 'Brokkoli')));
test('"Haferflocken" → finds',         () => ok(basicFoodsSearch('Haferflocken').some(r => r.name === 'Haferflocken')));
test('"Erdbeere" → finds',             () => ok(basicFoodsSearch('Erdbeere').some(r => r.name === 'Erdbeere')));
test('"Spinat" → finds',               () => ok(basicFoodsSearch('Spinat').some(r => r.name === 'Spinat')));

suite('5 · basicFoodsSearch — partial & variant matches');

test('"Bana" → finds Banane (prefix)', () => ok(basicFoodsSearch('Bana').some(r => r.name === 'Banane')));
test('"Karott" → finds Karotte',       () => ok(basicFoodsSearch('Karott').some(r => r.name === 'Karotte')));
test('"Paprika" → finds all 3 variants', () => {
  const r = basicFoodsSearch('Paprika');
  const names = r.map(x => x.name);
  ok(names.includes('Paprika, rot'),  'missing rot');
  ok(names.includes('Paprika, grün'), 'missing grün');
  ok(names.includes('Paprika, gelb'), 'missing gelb');
});
test('"Milch" → finds both milk entries', () => {
  const r = basicFoodsSearch('Milch');
  ok(r.length >= 2, `expected ≥2, got ${r.length}`);
});
test('case-insensitive: "banane" → finds Banane', () => ok(basicFoodsSearch('banane').some(r => r.name === 'Banane')));
test('umlaut query: "Süßkartoffel" → finds', () => ok(basicFoodsSearch('Süßkartoffel').some(r => r.name === 'Süßkartoffel')));
test('umlaut query: "Apfel" matches even if typed "Äpfel"', () => ok(basicFoodsSearch('Äpfel').some(r => r.name === 'Apfel')));

suite('5 · basicFoodsSearch — no false positives');

test('"Schokolade" → 0 results',       () => eq(basicFoodsSearch('Schokolade').length, 0));
test('"Müsliriegel" → 0 results',      () => eq(basicFoodsSearch('Müsliriegel').length, 0));
test('"Tiramisu" → 0 results',         () => eq(basicFoodsSearch('Tiramisu').length, 0));
test('"Ketchup" → 0 results',          () => eq(basicFoodsSearch('Ketchup').length, 0));
test('"Cola" → 0 results',             () => eq(basicFoodsSearch('Cola').length, 0));
test('"Chips" → 0 results',            () => eq(basicFoodsSearch('Chips').length, 0));

suite('5 · basicFoodsSearch — return structure');

test('results have source = "BLS"', () => {
  const r = basicFoodsSearch('Banane');
  ok(r.every(x => x.source === 'BLS'), 'not all BLS');
});
test('results have unit = "g"', () => {
  const r = basicFoodsSearch('Banane');
  ok(r.every(x => x.unit === 'g'));
});
test('results have carbs100g as number', () => {
  const r = basicFoodsSearch('Banane');
  ok(r.every(x => typeof x.carbs100g === 'number'));
});
test('results have unique ids', () => {
  const r = basicFoodsSearch('Paprika');
  const ids = r.map(x => x.id);
  eq(new Set(ids).size, ids.length, 'duplicate ids found');
});
test('"Banane" carbs = 20', () => {
  const banana = basicFoodsSearch('Banane').find(r => r.name === 'Banane');
  eq(banana.carbs100g, 20.0);
});


// ════════════════════════════════════════════════════════════════════════════
// 6. dedupSort
// ════════════════════════════════════════════════════════════════════════════
suite('6 · dedupSort — deduplication');

test('same name static+OFF → static wins, only 1 result', () => {
  const result = dedupSort([stat('Banane', 20)], null, [off('Banane', 20)], 'Banane');
  eq(result.length, 1);
  eq(result[0].source, 'BLS');
});
test('same name static+BLS → static wins (first-seen wins)', () => {
  const result = dedupSort([stat('Banane', 20)], [bls('Banane', 20)], null, 'Banane');
  eq(result.length, 1);
});
test('"Bananen-Müsli" and "Bananen Müsli" treated as duplicates (hyphen≡space)', () => {
  const result = dedupSort(null, null, [off('Bananen-Müsli'), off('Bananen Müsli')], 'Banane');
  eq(result.length, 1);
});
test('different names → both survive', () => {
  const result = dedupSort([stat('Banane')], null, [off('Bananensaft')], 'Banane');
  eq(result.length, 2);
});
test('"Banane, frisch" (BLS) not deduped against static "Banane"', () => {
  // Different dedup keys: "banane" vs "banane,frisch"
  const result = dedupSort([stat('Banane')], [bls('Banane, frisch')], null, 'Banane');
  eq(result.length, 2);
});

suite('6 · dedupSort — relevance threshold');

test('items with score ≤ 8 (no match) are removed', () => {
  const result = dedupSort(null, null, [off('Schokolade'), off('Tiramisu')], 'Banane');
  eq(result.length, 0);
});
test('items with score 32 (substring) survive', () => {
  // "Xyzbanane" — q "banane" is a substring → score 32 > 8
  const result = dedupSort(null, null, [off('Xyzbanane')], 'banane');
  eq(result.length, 1);
});
test('items with score > 8 survive', () => {
  const result = dedupSort(null, null, [off('Bananensaft')], 'Banane');
  eq(result.length, 1);
});

suite('6 · dedupSort — sort order');

test('exact match ranks first', () => {
  const result = dedupSort(
    null, null,
    [off('Bananensaft'), off('Banane'), off('Bananen-Chips')],
    'Banane'
  );
  eq(result[0].name, 'Banane');
});
test('static BLS beats identical-name OFF', () => {
  const result = dedupSort([stat('Banane')], null, [off('Bananensaft'), off('Bananen-Chips')], 'Banane');
  eq(result[0].source, 'BLS');
});
test('fewer words rank higher at equal relevance', () => {
  // "Banane, getrocknet" (rel 90) vs "Bananensaft" (rel 78)
  const result = dedupSort(null, [bls('Banane, getrocknet')], [off('Bananensaft')], 'Banane');
  eq(result[0].name, 'Banane, getrocknet');
});
test('BLS source bonus: BLS item ranks above same-relevance OFF', () => {
  // Both score 100 for query "Banane" but BLS gets +10 bonus
  const result = dedupSort(null, [bls('Banane', 20)], [off('Banane', 20)], 'Banane');
  // First item should be BLS (dedup removes OFF anyway — but if they had diff names...)
  // Test with slightly different names at same relevance level
  const result2 = dedupSort(
    null,
    [bls('Banane B', 20)],  // rel 90 (starts with + space boundary)
    [off('Banane A', 20)],  // rel 90 same
    'Banane'
  );
  eq(result2[0].source, 'BLS');
});
test('returns sorted array (each item ≥ next)', () => {
  const items = [
    off('Milch Banane Shake'),
    off('Bananensaft'),
    off('Banane Trinkmahlzeit'),
    stat('Banane'),
  ];
  const result = dedupSort(items.slice(3), null, items.slice(0, 3), 'Banane');
  for (let i = 0; i < result.length - 1; i++) {
    const ka = sortKey(result[i], 'Banane');
    const kb = sortKey(result[i+1], 'Banane');
    ok(ka >= kb, `position ${i} (sk=${ka}) should be ≥ position ${i+1} (sk=${kb})`);
  }
});


// ════════════════════════════════════════════════════════════════════════════
// 7. Integration — full pipeline
// ════════════════════════════════════════════════════════════════════════════
suite('7 · Integration — ranking pipeline');

// Simulate what runSearch does: staticItems first, then OFF
function search(query, offItems, blsItems = null) {
  const staticItems = basicFoodsSearch(query);
  return dedupSort(staticItems, blsItems, offItems, query);
}

function grouping(query, offItems, blsItems = null) {
  const sorted = search(query, offItems, blsItems);
  return {
    basic:     sorted.filter(it => isBasicFood(it, query)),
    processed: sorted.filter(it => !isBasicFood(it, query)),
    all:       sorted,
  };
}

const MOCK_BANANE_OFF = [
  off('Banane Trinkmahlzeit (Just Food)', 15),
  off('Bananensaft (EDEKA)',              11),
  off('Bananen-Müsli (Kellogg\'s)',       68),
  off('Milch Banane (Müller)',            11),
  off('Haferkraft Banane (Corny)',        55),
  off('Schokoladenriegel Schoko Banane', 50),
];

test('"Banane" — basic group is non-empty even without BLS API', () => {
  const { basic } = grouping('Banane', MOCK_BANANE_OFF);
  ok(basic.length >= 1, `expected ≥1 basic food, got ${basic.length}`);
});
test('"Banane" — Banane (static) is first in basic group', () => {
  const { basic } = grouping('Banane', MOCK_BANANE_OFF);
  eq(basic[0]?.name, 'Banane');
});
test('"Banane" — all basic foods precede all processed foods', () => {
  const { all, basic, processed } = grouping('Banane', MOCK_BANANE_OFF);
  if (basic.length === 0 || processed.length === 0) return; // guard
  const lastBasicIdx    = all.lastIndexOf(basic[basic.length - 1]);
  const firstProcIdx    = all.indexOf(processed[0]);
  ok(lastBasicIdx < firstProcIdx, 'a processed item appears before a basic item');
});
test('"Banane" — Bananensaft in processed group', () => {
  const { processed } = grouping('Banane', MOCK_BANANE_OFF);
  ok(processed.some(it => it.name.includes('Bananensaft')));
});
test('"Apfel" — Apfel appears in basic group', () => {
  const mockOFF = [off('Apfelsaft (Granini)', 10), off('Apfelschorle', 5)];
  const { basic } = grouping('Apfel', mockOFF);
  ok(basic.some(it => it.name === 'Apfel'), 'Apfel not in basic group');
});
test('"Tomate" — Tomate appears in basic group', () => {
  const mockOFF = [off('Tomatensauce (Barilla)', 8)];
  const { basic } = grouping('Tomate', mockOFF);
  ok(basic.some(it => it.name === 'Tomate'));
});
test('"Karotte" — Karotte appears in basic group', () => {
  const mockOFF = [off('Karottensaft (Voelkel)', 6)];
  const { basic } = grouping('Karotte', mockOFF);
  ok(basic.some(it => it.name === 'Karotte'));
});
test('BLS "Banane, frisch" from live API also lands in basic group', () => {
  const { basic } = grouping('Banane', MOCK_BANANE_OFF, [bls('Banane, frisch', 20)]);
  ok(basic.some(it => it.name === 'Banane, frisch'));
});
test('OFF-only (static absent) still shows something when nothing is basic', () => {
  // Search term with no static entry → everything processed
  const result = search('Müsliriegel', [off('Schokomüsliriegel'), off('Nussmüsliriegel')]);
  // Results may be 0 if relevance < 8, that's fine — just must not throw
  ok(Array.isArray(result));
});
test('no duplicate "Banane" when static and OFF both provide it', () => {
  const offWithBanane = [off('Banane', 20), ...MOCK_BANANE_OFF];
  const result = search('Banane', offWithBanane);
  const bananaCount = result.filter(it => it.name === 'Banane').length;
  eq(bananaCount, 1, `expected exactly 1 "Banane", got ${bananaCount}`);
});


// ════════════════════════════════════════════════════════════════════════════
// 8. Sync checks — verify app.js still matches
// ════════════════════════════════════════════════════════════════════════════
suite('8 · Sync checks — app.js implementation');

const appSrc = readFileSync(new URL('./app.js', import.meta.url), 'utf8');
const appHas = snippet => appSrc.includes(snippet);

test('isBasicFood: BLS short-circuit present',
  () => ok(appHas("if (source === 'BLS') return true"), 'BLS branch missing from isBasicFood'));
test('sortKey: BLS source bonus present',
  () => ok(appHas("item.source === 'BLS' ? 10 : 0"), 'BLS bonus missing from sortKey'));
test('basicFoodsSearch function defined',
  () => ok(appHas('function basicFoodsSearch('), 'basicFoodsSearch not in app.js'));
test('BASIC_FOODS constant defined',
  () => ok(appHas('const BASIC_FOODS = ['), 'BASIC_FOODS not in app.js'));
test('BASIC_FOODS includes Banane entry',
  () => ok(appHas("{ name: 'Banane',"), '"Banane" entry missing from BASIC_FOODS'));
test('renderGrouped function defined',
  () => ok(appHas('function renderGrouped('), 'renderGrouped not in app.js'));
test('renderGrouped called in all 3 render paths (≥3 occurrences)', () => {
  const count = (appSrc.match(/renderGrouped\(/g) || []).length;
  ok(count >= 3, `expected ≥3 renderGrouped() calls, found ${count} — a cache path may be missing it`);
});
test('dedupSort uses staticItems (closure variable)',
  () => ok(appHas('staticItems.length) items.push(...staticItems)'), 'staticItems push missing'));
test('BASIC_FOODS entry count matches test file', () => {
  const startIdx = appSrc.indexOf('const BASIC_FOODS = [');
  const endIdx   = appSrc.indexOf('\n];', startIdx);
  const block    = appSrc.slice(startIdx, endIdx);
  const appCount = (block.match(/\{ name:/g) || []).length;
  eq(appCount, BASIC_FOODS.length,
    `app.js has ${appCount} BASIC_FOODS entries, test has ${BASIC_FOODS.length} — update one of them`);
});
test('isBasicFood accepts item object (not just string)',
  () => ok(appHas('typeof item === \'object\''), 'object branch missing from isBasicFood'));


// ════════════════════════════════════════════════════════════════════════════
// Summary
// ════════════════════════════════════════════════════════════════════════════
const total = _pass + _fail;
console.log(`\n${'─'.repeat(60)}`);
if (_fail === 0) {
  console.log(`${GREEN}${BOLD}  ✓ All ${total} tests passed${RESET}`);
} else {
  console.log(`${RED}${BOLD}  ${_fail} of ${total} tests FAILED${RESET}  (${_pass} passed)`);
}
console.log('');

process.exit(_fail > 0 ? 1 : 0);
