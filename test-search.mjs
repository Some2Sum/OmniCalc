// Run: node test-search.mjs
// Tests search ranking for "Banane" — reproduces the live pipeline from app.js

// NOTE: Keep the logic below in sync with app.js.
// ── Copied from app.js ───────────────────────────────────────────────────────

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
  } catch(_) {}
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
  const name = typeof item === 'string' ? item : item.name;
  const source = item && typeof item === 'object' ? item.source : null;
  const stripped = normDE(name.replace(/\s*\(.*?\)\s*/g, '').trim());
  const q = normDE(query.trim());
  if (!stripped.startsWith(q)) return false;
  if (source === 'BLS') return true;
  const remainder = stripped.slice(q.length);
  return remainder === '' || (remainder.length <= 2 && !/\s/.test(remainder));
}

// Minimal BASIC_FOODS for test (subset — just enough to cover Banane & common queries)
const BASIC_FOODS = [
  { name: 'Banane',        carbs100g: 20.0 },
  { name: 'Apfel',         carbs100g: 11.4 },
  { name: 'Karotte',       carbs100g:  6.8 },
  { name: 'Erdbeere',      carbs100g:  5.9 },
  { name: 'Kartoffel',     carbs100g: 17.0 },
  { name: 'Orange',        carbs100g:  8.7 },
  { name: 'Brokkoli',      carbs100g:  4.4 },
  { name: 'Tomate',        carbs100g:  3.5 },
  { name: 'Haferflocken',  carbs100g: 58.7 },
];

let _uid = 0;
function uid() { return 'test-' + (++_uid); }

function basicFoodsSearch(query) {
  return BASIC_FOODS
    .filter(f => relevance(f.name, query) > 8)
    .map(f => ({ id: uid(), name: f.name, carbs100g: f.carbs100g, source: 'BLS', unit: 'g' }));
}

function dedupSort(staticItems, blsItems, offItems, query) {
  let items = [];
  if (staticItems) items.push(...staticItems);
  if (blsItems) items.push(...blsItems);
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

// ── Unit tests ───────────────────────────────────────────────────────────────

const PASS = '\x1b[32m✓\x1b[0m';
const FAIL = '\x1b[31m✗\x1b[0m';
let failures = 0;

function assert(label, actual, expected) {
  const ok = actual === expected;
  console.log(`  ${ok ? PASS : FAIL} ${label}`);
  if (!ok) { console.log(`      expected: ${expected}  got: ${actual}`); failures++; }
}

console.log('\n\x1b[1m── Unit tests: isBasicFood ─────────────────────────────────────\x1b[0m');
// BLS items: always basic if name starts with query
assert('BLS "Banane, frisch"   → basic',  isBasicFood({name:'Banane, frisch', source:'BLS'}, 'Banane'), true);
assert('BLS "Bananen, roh"     → basic',  isBasicFood({name:'Bananen, roh', source:'BLS'}, 'Banane'), true);
assert('BLS "Banane (bio)"     → basic',  isBasicFood({name:'Banane (bio)', source:'BLS'}, 'Banane'), true);
assert('BLS "Apfel, frisch"    → not basic (query mismatch)',
       isBasicFood({name:'Apfel, frisch', source:'BLS'}, 'Banane'), false);
// OFF items: strict remainder check
assert('OFF "Banane"           → basic',  isBasicFood({name:'Banane', source:'OFF'}, 'Banane'), true);
assert('OFF "Bananen"          → basic',  isBasicFood({name:'Bananen', source:'OFF'}, 'Banane'), true);
assert('OFF "Bananensaft"      → NOT basic', isBasicFood({name:'Bananensaft', source:'OFF'}, 'Banane'), false);
assert('OFF "Bananen Müsli"    → NOT basic', isBasicFood({name:'Bananen Müsli', source:'OFF'}, 'Banane'), false);
assert('OFF "Bananen-Chips"    → NOT basic', isBasicFood({name:'Bananen-Chips', source:'OFF'}, 'Banane'), false);
assert('OFF "Milch Banane"     → NOT basic', isBasicFood({name:'Milch Banane', source:'OFF'}, 'Banane'), false);

console.log('\n\x1b[1m── Unit tests: relevance scores ────────────────────────────────\x1b[0m');
const cases = [
  ['Banane',              'Banane', 100],
  ['Banane, frisch',      'Banane',  90],
  ['Bananen',             'Banane',  78],
  ['Bananensaft',         'Banane',  78],
  ['Bananen-Chips',       'Banane',  78],
  ['Milch-Banane',        'Banane',  62],
  ['Frucht Banane Riegel','Banane',  62],  // standalone word → score 62
];
for (const [name, q, expected] of cases) {
  const got = relevance(name, q);
  const ok = got === expected;
  console.log(`  ${ok ? PASS : FAIL} relevance("${name}", "${q}") = ${got}${ok ? '' : ` (expected ${expected})`}`);
  if (!ok) failures++;
}

console.log('\n\x1b[1m── Simulated ranking: static + BLS + OFF ───────────────────────\x1b[0m');
const mockStatic = basicFoodsSearch('Banane');
const mockBLS = [
  { name: 'Banane, frisch', carbs100g: 20.0, source: 'BLS' },
  { name: 'Banane, getrocknet', carbs100g: 65.0, source: 'BLS' },
];
const mockOFF = [
  { name: 'Bananensaft (Valensina)', carbs100g: 10.5, source: 'OFF' },
  { name: 'Bananen-Müsli (Kellogg\'s)', carbs100g: 68.0, source: 'OFF' },
  { name: 'Milch Banane (Müller)', carbs100g: 11.2, source: 'OFF' },
  { name: 'Banane', carbs100g: 20.0, source: 'OFF' },
  { name: 'Bananenchips', carbs100g: 58.0, source: 'OFF' },
];
const ranked = dedupSort(mockStatic, mockBLS, mockOFF, 'Banane');
ranked.forEach((it, i) => {
  const basic = isBasicFood(it, 'Banane');
  const sk = sortKey(it, 'Banane');
  const tag = basic ? '\x1b[32m[Lebensmittel]\x1b[0m' : '\x1b[33m[Verarbeitet] \x1b[0m';
  console.log(`  ${String(i+1).padStart(2)}. ${tag} ${it.name.padEnd(35)} src=${it.source} sk=${sk}`);
});
const firstBasicIdx = ranked.findIndex(it => isBasicFood(it, 'Banane'));
const firstProcessedIdx = ranked.findIndex(it => !isBasicFood(it, 'Banane'));
const groupingOk = firstBasicIdx < firstProcessedIdx || firstProcessedIdx === -1;
console.log(`  ${groupingOk ? PASS : FAIL} All basic foods appear before processed products`);
if (!groupingOk) failures++;

// ── Live API calls ───────────────────────────────────────────────────────────

console.log('\n\x1b[1m── Live API: BLS ───────────────────────────────────────────────\x1b[0m');
let blsLive = null;
try {
  const ctrl = new AbortController();
  setTimeout(() => ctrl.abort(), 4000);
  const r = await fetch('https://blsdb.de/api/food/search?query=Banane', { signal: ctrl.signal });
  if (r.ok) {
    const raw = await r.json();
    const arr = Array.isArray(raw) ? raw : (raw.items || raw.results || raw.foods || raw.data || []);
    blsLive = arr.slice(0, 10).map(item => {
      const name = item.name || item.bezeichnung || item.description || item.title || '(no name)';
      const carbs = item.carbohydrates_100g ?? item.kohlenhydrate ?? item.kh ?? item.carbs ?? '?';
      return { name, carbs100g: parseFloat(carbs) || 0, source: 'BLS' };
    });
    console.log(`  ${PASS} BLS responded (${blsLive.length} results):`);
    blsLive.forEach(it => console.log(`     • ${it.name} (KH: ${it.carbs100g})`));
  } else {
    console.log(`  ${FAIL} BLS HTTP ${r.status}`);
  }
} catch (e) {
  console.log(`  ${FAIL} BLS unreachable: ${e.message}`);
  console.log('  \x1b[33m→ CORS wird vom Browser blockiert; BLS-Items erscheinen nie in Suchergebnissen!\x1b[0m');
  console.log('  \x1b[33m→ Der source=BLS-Fix hilft nur wenn BLS erreichbar ist.\x1b[0m');
}

console.log('\n\x1b[1m── Live API: OFF (page_size=20, sort_by=popularity_key) ────────\x1b[0m');
let offLive = null;
try {
  const url = 'https://world.openfoodfacts.org/cgi/search.pl' +
    '?search_terms=Banane&search_simple=1&action=process&json=1' +
    '&fields=product_name,product_name_de,nutriments,brands' +
    '&lc=de&cc=de&page_size=20&sort_by=popularity_key';
  const r = await fetch(url);
  if (r.ok) {
    const data = await r.json();
    offLive = (data.products || []).map(p => {
      const name = (p.product_name_de || p.product_name || '').trim();
      const brand = p.brands?.split(',')[0]?.trim();
      const displayName = brand && name && !name.toLowerCase().includes(brand.toLowerCase())
        ? `${name} (${brand})` : name;
      const carbs = p.nutriments?.carbohydrates_100g ?? null;
      return displayName ? { name: displayName, carbs100g: carbs, source: 'OFF' } : null;
    }).filter(Boolean);
    console.log(`  ${PASS} OFF responded (${offLive.length} results):`);
    offLive.forEach((it, i) => {
      const basic = isBasicFood(it, 'Banane');
      const rel = relevance(it.name, 'Banane');
      const tag = basic ? '\x1b[32m[basic]\x1b[0m    ' : '\x1b[33m[processed]\x1b[0m';
      console.log(`     ${String(i+1).padStart(2)}. ${tag} rel=${String(rel).padStart(3)}  ${it.name}`);
    });
  } else {
    console.log(`  ${FAIL} OFF HTTP ${r.status}`);
  }
} catch(e) {
  console.log(`  ${FAIL} OFF unreachable: ${e.message}`);
}

if (offLive) {
  console.log('\n\x1b[1m── Live ranking simulation (as user sees it) ───────────────────\x1b[0m');
  const liveStatic = basicFoodsSearch('Banane');
  const liveRanked = dedupSort(liveStatic, blsLive, offLive, 'Banane');
  const liveBasic = liveRanked.filter(it => isBasicFood(it, 'Banane'));
  const liveProcessed = liveRanked.filter(it => !isBasicFood(it, 'Banane'));

  if (liveBasic.length === 0) {
    console.log('  \x1b[31m✗ PROBLEM: Keine einzige Ergebnis wird als "Lebensmittel" erkannt!\x1b[0m');
    console.log('  \x1b[31m  → Alle Ergebnisse kommen von OFF; BLS wurde blockiert (CORS).\x1b[0m');
    console.log('  \x1b[31m  → Der Fix für source=BLS greift nicht, weil BLS nie antwortet.\x1b[0m');
    console.log('  \x1b[33m  → Lösung nötig: OFF-Ergebnisse mit kurzem Namen müssen als Grundnahrungsmittel gelten.\x1b[0m');
    failures++;
  } else {
    console.log(`  ${PASS} ${liveBasic.length} Grundnahrungsmittel / ${liveProcessed.length} Verarbeitet`);
  }

  console.log('\n  [Lebensmittel]');
  liveBasic.forEach((it,i) => console.log(`     ${i+1}. ${it.name.padEnd(40)} src=${it.source}`));
  console.log('  [Verarbeitete Produkte]');
  liveProcessed.slice(0,8).forEach((it,i) => console.log(`     ${i+1}. ${it.name.padEnd(40)} src=${it.source}`));
}

// ── Summary ──────────────────────────────────────────────────────────────────

console.log(`\n\x1b[1m── Summary ─────────────────────────────────────────────────────\x1b[0m`);
if (failures === 0) {
  console.log(`  \x1b[32mAll unit tests passed.\x1b[0m`);
} else {
  console.log(`  \x1b[31m${failures} test(s) failed — see above.\x1b[0m`);
}
console.log('');
