'use strict';
// ══════════════════════════════════════════════════════
// CONSTANTS & STATE
// ══════════════════════════════════════════════════════
const STORAGE_KEY = 'kh_v1';

let state = {
  myFoods: [],    // {id, name, carbs100g, source}
  myMeals: [],    // {id, name, items:[{id,name,carbs100g,amount,source}]}
  meal: [],       // current meal items
  mealHistory: [], // [{id, ts, kh, items:[...]}] – max 20, newest first
};

let searchCache = [];
let foodModalTarget = null;
let nameModalCb = null;
let scannerActive = false;
let zxingLoaded = false;
let activeCReader = null;
let torchOn = false;

// ══════════════════════════════════════════════════════
// STORAGE
// ══════════════════════════════════════════════════════
function loadState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return;
    const s = JSON.parse(raw);
    state.myFoods     = s.myFoods     || [];
    state.myMeals     = s.myMeals     || [];
    state.meal        = s.meal        || [];
    state.mealHistory = s.mealHistory || [];
  } catch(e) { /* corrupt – start fresh */ }
}

function persist() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({
      myFoods:     state.myFoods,
      myMeals:     state.myMeals,
      meal:        state.meal,
      mealHistory: state.mealHistory,
    }));
  } catch(e) {
    toast('Speichern fehlgeschlagen – Speicher möglicherweise voll.', 'error');
  }
}

// ══════════════════════════════════════════════════════
// UTILS
// ══════════════════════════════════════════════════════
function uid() { return Date.now().toString(36) + Math.random().toString(36).slice(2); }

function parseNum(v) {
  if (v === null || v === undefined || v === '') return NaN;
  const s = String(v).replace(',', '.');
  return parseFloat(s);
}

function safeNum(v) { const n = parseNum(v); return isNaN(n) ? 0 : n; }

function fmt1(n) { return safeNum(n).toFixed(1).replace('.', ','); }

function calcKH(carbs100g, amount) {
  const c = safeNum(carbs100g);
  const a = safeNum(amount);
  if (a <= 0) return 0;
  return (c * a) / 100;
}

function esc(s) {
  return String(s)
    .replace(/&/g,'&amp;').replace(/</g,'&lt;')
    .replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

function flashBtn(el, cls = 'btn-flash-ok', ms = 650) {
  if (!el) return;
  el.classList.add(cls);
  setTimeout(() => el.classList.remove(cls), ms);
}

function fmtDate(ts) {
  const d = new Date(ts);
  const now = new Date();
  const time = d.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' });
  if (d.toDateString() === now.toDateString()) return `Heute, ${time}`;
  if (d.toDateString() === new Date(now - 864e5).toDateString()) return `Gestern, ${time}`;
  return d.toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit' }) + `, ${time}`;
}

function addToHistory(items) {
  if (!items.length) return;
  const kh = items.reduce((s, it) => s + calcKH(it.carbs100g, it.amount), 0);
  state.mealHistory.unshift({ id: uid(), ts: Date.now(), kh, items: items.map(it => ({ ...it })) });
  if (state.mealHistory.length > 20) state.mealHistory.length = 20;
}

let _toastTimer;
function toast(msg, type = 'success') {
  clearTimeout(_toastTimer);
  const el = document.getElementById('toast');
  el.innerHTML = `<div class="alert alert-${type}">${esc(msg)}</div>`;
  el.classList.remove('hidden');
  _toastTimer = setTimeout(() => { el.classList.add('hidden'); el.innerHTML = ''; }, 3500);
}

// ══════════════════════════════════════════════════════
// FOOTER
// ══════════════════════════════════════════════════════
function refreshFooter() {
  const kh = state.meal.reduce((s, it) => s + calcKH(it.carbs100g, it.amount), 0);
  const summary = document.getElementById('kh-summary-val');
  if (summary) summary.textContent = fmt1(kh);
  const barVal = document.getElementById('kh-bar-val');
  if (barVal) barVal.textContent = fmt1(kh) + ' g KH';
}

// ══════════════════════════════════════════════════════
// TABS
// ══════════════════════════════════════════════════════
function showTab(name) {
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
  document.getElementById('page-' + name).classList.add('active');
  document.querySelector(`[data-tab="${name}"]`).classList.add('active');
  const khBar = document.getElementById('kh-bar');
  if (khBar) khBar.style.display = name === 'meal' ? 'none' : '';
  document.querySelector('.main').style.paddingBottom =
    name === 'meal'
      ? '0'
      : 'calc(var(--tabbar-h) + var(--kh-bar-h) + 32px)';
  if (name === 'meal')      renderMeal();
  if (name === 'search') {
    const q = (document.getElementById('search-input')?.value || '').trim();
    if (q.length < 2) {
      document.getElementById('search-home-body').style.display = '';
      document.getElementById('search-results').innerHTML = '';
    }
    renderSearchQuick();
  }
  if (name === 'favorites') { renderFoods(); renderMeals(); renderHistory(); }
}

document.querySelectorAll('.tab-btn').forEach(btn =>
  btn.addEventListener('click', () => showTab(btn.dataset.tab))
);

// ══════════════════════════════════════════════════════
// UNIT AUTO-DETECTION
// ══════════════════════════════════════════════════════
function detectUnit(name) {
  const n = normDE(name);
  return /saft|nektar|limonade|\blimo\b|cola|bier|wein|sekt|champagner|prosecco|milch|kefir|\btee\b|kaffee|cappuccino|latte|espresso|wasser|mineralwasser|sauce|sosse|dressing|marinade|sirup|\bol\b|brühe|bruhe|suppe|smoothie|shake|getr[äa]nk|drink|trinkjoghurt|joghurtdrink|kakao|eistee|sportgetr[äa]nk|energy|eiskaffee|fruchtsaft/.test(n) ? 'ml' : 'g';
}

// ══════════════════════════════════════════════════════
// PORTION HINTS
// ══════════════════════════════════════════════════════
const PORTION_HINTS = [
  // Obst
  ['banane',      120], ['apfel',       150], ['birne',       150],
  ['orange',      130], ['mandarine',    80], ['kiwi',         80],
  ['erdbeere',    150], ['himbeere',    100], ['weintraub',   150],
  ['pfirsich',    130], ['pflaume',      50], ['mango',       150],
  ['ananas',      150], ['melone',      200], ['avocado',     100],
  // Gemüse
  ['tomate',      100], ['gurke',       150], ['paprika',     150],
  ['brokkoli',    150], ['zucchini',    200], ['mohre',       100],
  ['karotte',     100], ['zwiebel',      80], ['knoblauch',     5],
  ['spinat',      100], ['salat',        60], ['kohl',        150],
  ['erbsen',       80], ['mais',        100], ['bohnen',      100],
  // Getreide & Frühstück
  ['haferflocken', 60], ['cornflakes',   40], ['musli',        60],
  ['granola',      50],
  // Brot & Backwaren
  ['brotchen',     60], ['toast',        25], ['brot',         50],
  ['croissant',    60], ['brezel',       80],
  // Nudeln & Reis (roh)
  ['nudeln',       80], ['spaghetti',    80], ['reis',         70],
  ['couscous',     70], ['quinoa',       70],
  // Milch & Käse
  ['milch',       200], ['joghurt',     150], ['quark',       150],
  ['gouda',        30], ['mozzarella',  125], ['feta',         50],
  ['kase',         30], ['frischkase',   30], ['sahne',        30],
  // Getränke
  ['saft',        200], ['cola',        250], ['bier',        330],
  ['wein',        150], ['kaffee',      200], ['tee',         200],
  ['smoothie',    250], ['limo',        250], ['wasser',      250],
  // Fleisch & Fisch
  ['hahnchen',    150], ['schwein',     150], ['rind',        150],
  ['hackfleisch', 150], ['wurst',        30], ['lachs',       150],
  ['thunfisch',    80], ['garnele',     100],
  // Eier & Sonstiges
  ['ei',           60], ['butter',       10], ['margarine',    10],
  ['ol',           10], ['zucker',       10], ['honig',        15],
  ['nutella',      20], ['marmelade',    20], ['schokolade',   20],
  ['chips',        30], ['gummibarchen', 50],
];

function suggestPortion(name, servingG) {
  if (servingG > 0 && servingG <= 2000) return Math.round(servingG);
  const n = normDE(name);
  for (const [key, portion] of PORTION_HINTS) {
    if (n.includes(key)) return portion;
  }
  return 100;
}

// ══════════════════════════════════════════════════════
// APIs
// ══════════════════════════════════════════════════════
async function timedFetch(url, ms = 7000) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), ms);
  try {
    const r = await fetch(url, { signal: ctrl.signal });
    clearTimeout(t);
    return r;
  } catch(e) {
    clearTimeout(t);
    throw e;
  }
}

async function apiBLS(query) {
  try {
    const r = await timedFetch(`https://blsdb.de/api/food/search?query=${encodeURIComponent(query)}`, 3000);
    if (!r.ok) throw new Error('HTTP ' + r.status);
    const raw = await r.json();

    const arr = Array.isArray(raw)
      ? raw
      : (raw.items || raw.results || raw.foods || raw.data || []);

    return arr.map(item => {
      const name = item.name || item.bezeichnung || item.description || item.title || '';
      if (!name) return null;

      const carbsRaw =
        item.carbohydrates_100g   ??
        item.carbohydrates        ??
        item.kohlenhydrate        ??
        item.kh ?? item.carbs ?? item.KH ??
        item['carbohydrates-100g']??
        item.nutrients?.carbohydrates_100g ??
        item.nährwerte?.kohlenhydrate ?? null;

      if (carbsRaw === null) {
        console.debug('[BLS] no carbs field for:', name, '| keys:', Object.keys(item).join(', '));
        return null;
      }
      return { id: uid(), name, carbs100g: safeNum(carbsRaw), source: 'BLS', unit: detectUnit(name) };
    }).filter(Boolean);

  } catch(e) {
    console.warn('[BLS] Fehler:', e.message);
    return null;
  }
}

async function apiOFFSearch(query) {
  try {
    const url =
      `https://world.openfoodfacts.org/cgi/search.pl` +
      `?search_terms=${encodeURIComponent(query)}` +
      `&search_simple=1&action=process&json=1` +
      `&fields=product_name,product_name_de,nutriments,brands,serving_quantity` +
      `&lc=de&cc=de&page_size=20&sort_by=popularity_key`;
    const r = await timedFetch(url, 5000);
    if (!r.ok) throw new Error('HTTP ' + r.status);
    const data = await r.json();

    return (data.products || []).map(p => {
      const name = (p.product_name_de || p.product_name || '').trim();
      if (!name) return null;
      if (typeof p.nutriments?.carbohydrates_100g === 'undefined') return null;
      const c = safeNum(p.nutriments.carbohydrates_100g);
      const brand = p.brands?.split(',')[0]?.trim();
      const displayName = brand && !name.toLowerCase().includes(brand.toLowerCase())
        ? `${name} (${brand})` : name;
      return {
        id: uid(), name: displayName,
        carbs100g: c, source: 'OFF',
        unit: detectUnit(displayName),
        portionHint: safeNum(p.serving_quantity) || 0,
      };
    }).filter(Boolean);

  } catch(e) {
    console.warn('[OFF search] Fehler:', e.message);
    return null;
  }
}

async function apiOFFBarcode(barcode) {
  const r = await fetch(
    `https://world.openfoodfacts.org/api/v0/product/${barcode}.json` +
    `?fields=product_name,nutriments,brands,serving_quantity`
  );
  if (!r.ok) throw new Error('HTTP ' + r.status);
  const data = await r.json();
  if (data.status !== 1) return null;
  const p = data.product || {};
  const name = (p.product_name || p.brands || '').trim();
  const hasCarbs = typeof p.nutriments?.carbohydrates_100g !== 'undefined';
  return {
    id: uid(),
    name: name || barcode,
    carbs100g: hasCarbs ? safeNum(p.nutriments.carbohydrates_100g) : null,
    source: 'OFF',
    hasCarbs,
    portionHint: safeNum(p.serving_quantity) || 0,
  };
}

// ══════════════════════════════════════════════════════
// SEARCH
// ══════════════════════════════════════════════════════
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
  return base * 1000 - words;
}

function germanVariants(q) {
  const v = new Set();
  if (q.endsWith('en'))      { v.add(q.slice(0,-2)); v.add(q.slice(0,-1)); }
  else if (q.endsWith('er')) { v.add(q+'n'); v.add(q.slice(0,-2)); }
  else if (q.endsWith('el')) { v.add(q+'n'); v.add(q+'s'); }
  else if (q.endsWith('n'))  { v.add(q.slice(0,-1)); v.add(q+'en'); }
  else if (q.endsWith('e'))  { v.add(q+'n'); v.add(q+'r'); v.add(q+'s'); }
  else if (q.endsWith('s'))  { v.add(q.slice(0,-1)); }
  else                       { v.add(q+'e'); v.add(q+'en'); v.add(q+'n'); v.add(q+'er'); v.add(q+'s'); }
  return [...v].filter(x => x !== q && x.length >= 3);
}

const _qCache = new Map();
function getCached(q) {
  const e = _qCache.get(q);
  return e && Date.now() - e.ts < 180_000 ? e.items : null;
}
function setCached(q, items) {
  if (_qCache.size > 40) _qCache.delete(_qCache.keys().next().value);
  _qCache.set(q, { items, ts: Date.now() });
}

const PCACHE_KEY = 'kh_scache2';
const PCACHE_TTL = 24 * 60 * 60 * 1000;
function getPcache(q) {
  try {
    const store = JSON.parse(localStorage.getItem(PCACHE_KEY) || '{}');
    const e = store[q];
    return e && Date.now() - e.ts < PCACHE_TTL ? e.items : null;
  } catch { return null; }
}
function setPcache(q, items) {
  try {
    const store = JSON.parse(localStorage.getItem(PCACHE_KEY) || '{}');
    store[q] = { items, ts: Date.now() };
    const keys = Object.keys(store).sort((a, b) => store[a].ts - store[b].ts);
    if (keys.length > 50) keys.slice(0, keys.length - 50).forEach(k => delete store[k]);
    localStorage.setItem(PCACHE_KEY, JSON.stringify(store));
  } catch {}
}

function isBasicFood(itemName, query) {
  const stripped = normDE(itemName.replace(/\s*\(.*?\)\s*/g, '').trim());
  const q = normDE(query.trim());
  if (!stripped.startsWith(q)) return false;
  const remainder = stripped.slice(q.length);
  return remainder === '' || (remainder.length <= 2 && !/\s/.test(remainder));
}

let _searchTimer;
let _searchSeq = 0;

document.getElementById('search-input').addEventListener('input', e => {
  clearTimeout(_searchTimer);
  const q = e.target.value.trim();
  if (q.length < 2) {
    document.getElementById('search-results').innerHTML = '';
    document.getElementById('search-home-body').style.display = '';
    _activeCatId = null;
    document.querySelectorAll('.search-cat-chip').forEach(c => c.classList.remove('active'));
    renderSearchQuick();
    return;
  }
  if (/^\d{8,13}$/.test(q)) {
    _searchTimer = setTimeout(() => handleBarcode(q), 500);
  } else {
    _searchTimer = setTimeout(() => runSearch(q), 380);
  }
});

async function runSearch(query) {
  const seq = ++_searchSeq;
  const box = document.getElementById('search-results');
  const cacheKey = query.toLowerCase();

  // Session-Cache (3 min)
  const sessionHit = getCached(cacheKey);
  if (sessionHit) {
    document.getElementById('search-home-body').style.display = 'none';
    searchCache = sessionHit;
    box.innerHTML = sessionHit.length
      ? sessionHit.map((it,i) => searchCard(it,i)).join('')
      : `<div class="empty"><p>Keine Ergebnisse für „${esc(query)}".</p></div>`;
    bindSearchCards();
    return;
  }

  // Persistenter Cache (24 h) – sofortiges Anzeigen ohne API-Call
  const persistHit = getPcache(cacheKey);
  if (persistHit) {
    document.getElementById('search-home-body').style.display = 'none';
    searchCache = persistHit;
    setCached(cacheKey, persistHit);
    box.innerHTML = persistHit.length
      ? persistHit.map((it,i) => searchCard(it,i)).join('')
      : `<div class="empty"><p>Keine Ergebnisse für „${esc(query)}".</p></div>`;
    bindSearchCards();
    return;
  }

  box.innerHTML = '<div class="spinner"></div>';
  document.getElementById('search-home-body').style.display = 'none';

  // BLS parallel starten (3 s Timeout), OFF abwarten und sofort zeigen
  const blsPromise = apiBLS(query);
  let off = await apiOFFSearch(query);
  if (seq !== _searchSeq) return;

  if (off === null) {
    await new Promise(r => setTimeout(r, 300));
    if (seq !== _searchSeq) return;
    off = await apiOFFSearch(query);
    if (seq !== _searchSeq) return;
  }

  function dedupSort(blsItems, offItems) {
    let items = [];
    if (blsItems) items.push(...blsItems);
    if (offItems)  items.push(...offItems);
    const seen = new Set();
    items = items.filter(it => {
      const key = normDE(it.name).replace(/[\s\-]/g, '').slice(0, 42);
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
    return items.sort((a, b) => sortKey(b, query) - sortKey(a, query));
  }

  function showItems(items) {
    if (seq !== _searchSeq) return;
    searchCache = items;
    let html = '';
    if (!items.length) {
      if (off === null)
        html = `<div class="alert alert-warning">Datenbank nicht erreichbar – bitte kurz warten und erneut suchen.</div>`;
      else
        html = `<div class="empty"><p>Keine Ergebnisse für „${esc(query)}".<br>Versuche einen anderen Begriff.</p></div>`;
    } else {
      const basic = items.filter(it => isBasicFood(it.name, query));
      const processed = items.filter(it => !isBasicFood(it.name, query));
      const twoGroups = basic.length > 0 && processed.length > 0;
      if (twoGroups) html += `<div class="search-group-hd">Lebensmittel</div>`;
      html += basic.map((it, i) => searchCard(it, i)).join('');
      if (twoGroups) html += `<div class="search-group-hd">Verarbeitete Produkte</div>`;
      html += processed.map((it, i) => searchCard(it, basic.length + i)).join('');
    }
    box.innerHTML = html;
    bindSearchCards();
  }

  // OFF-Ergebnisse sofort anzeigen (progressiv)
  showItems(dedupSort(null, off));

  // BLS abwarten – UI nur aktualisieren, wenn BLS neue Treffer bringt
  const bls = await blsPromise;
  if (seq !== _searchSeq) return;
  if (bls && bls.length) showItems(dedupSort(bls, off));

  // Wortform-Fallback wenn noch keine Ergebnisse
  if (!searchCache.length && off !== null) {
    const variant = germanVariants(query)[0];
    if (variant) {
      const extra = await apiOFFSearch(variant);
      if (seq !== _searchSeq) return;
      if (extra && extra.length) { off = extra; showItems(dedupSort(bls, extra)); }
    }
  }

  // Ergebnis in beiden Caches speichern
  setCached(cacheKey, searchCache);
  setPcache(cacheKey, searchCache);
}

function searchCard(it, i) {
  const portion = suggestPortion(it.name, it.portionHint || 0);
  const kh = fmt1(calcKH(it.carbs100g, portion));
  const alreadySaved = !!state.myFoods.find(f => f.name.toLowerCase() === it.name.toLowerCase());
  const savedCls = alreadySaved ? ' saved' : '';
  const savedTitle = alreadySaved ? 'Gespeichert – erneut klicken zum Entfernen' : 'Als Favorit speichern';
  return `
  <div class="card" data-si="${i}">
    <div class="card-head">
      <div>
        <div class="card-name">${esc(it.name)}</div>
        <div class="card-sub">${fmt1(it.carbs100g)} g KH / 100 ${it.unit || 'g'}</div>
      </div>
    </div>
    <div class="amount-row">
      <input type="number" inputmode="decimal" class="amount-input s-amt"
             data-si="${i}" value="${portion}" min="1">
      <button class="unit-toggle s-unit${it.unit === 'ml' ? ' ml' : ''}" data-si="${i}" data-unit="${it.unit || 'g'}">${it.unit || 'g'}</button>
      <div class="kh-live-wrap">
        <span class="kh-live-pre">Das ergibt</span>
        <span class="kh-live" id="klive-${i}">${kh} g KH</span>
      </div>
    </div>
    <div class="btn-row">
      <button class="btn btn-primary s-add" data-si="${i}" style="flex:1">Hinzufügen</button>
      <button class="btn btn-outline s-fav${savedCls}" data-si="${i}" style="flex:0;padding:11px 14px"
              title="${savedTitle}" aria-label="Als Favorit speichern">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"/></svg>
      </button>
    </div>
  </div>`;
}

function bindSearchCards() {
  document.querySelectorAll('.s-amt').forEach(inp => {
    inp.addEventListener('input', () => {
      const i = +inp.dataset.si;
      const it = searchCache[i];
      if (!it) return;
      const kh = calcKH(it.carbs100g, safeNum(inp.value));
      const el = document.getElementById('klive-' + i);
      if (el) el.textContent = fmt1(kh) + ' g KH';
    });
  });

  document.querySelectorAll('.s-unit').forEach(btn => {
    btn.addEventListener('click', () => {
      const newUnit = btn.dataset.unit === 'g' ? 'ml' : 'g';
      btn.dataset.unit = newUnit;
      btn.textContent = newUnit;
      btn.classList.toggle('ml', newUnit === 'ml');
    });
  });

  document.querySelectorAll('.s-add').forEach(btn => {
    btn.addEventListener('click', () => {
      const i = +btn.dataset.si;
      const it = searchCache[i];
      const amt = safeNum(document.querySelector(`.s-amt[data-si="${i}"]`)?.value);
      if (amt <= 0) { toast('Bitte gültige Menge eingeben.', 'warning'); return; }
      const unit = document.querySelector(`.s-unit[data-si="${i}"]`)?.dataset.unit || 'g';
      addToMeal({ ...it, amount: amt, unit });
      flashBtn(btn);
      toast(`${it.name} zur Mahlzeit hinzugefügt.`);
    });
  });

  document.querySelectorAll('.s-fav').forEach(btn => {
    btn.addEventListener('click', () => {
      const i = +btn.dataset.si;
      const item = searchCache[i];
      const existing = state.myFoods.find(f => f.name.toLowerCase() === item.name.toLowerCase());
      if (existing) {
        deleteFood(existing.id);
        btn.classList.remove('saved');
        btn.title = 'Als Favorit speichern';
        toast(`„${item.name}" aus Favoriten entfernt.`, 'warning');
      } else {
        const amount = safeNum(document.querySelector(`.s-amt[data-si="${i}"]`)?.value) || 100;
        const unit = document.querySelector(`.s-unit[data-si="${i}"]`)?.dataset.unit || 'g';
        const saved = saveFood(item, amount, unit);
        if (saved) { btn.classList.add('saved'); btn.title = 'Gespeichert – erneut klicken zum Entfernen'; }
      }
    });
  });
}

// ══════════════════════════════════════════════════════
// MEAL
// ══════════════════════════════════════════════════════
function addToMeal(item) {
  state.meal.push({
    id: uid(),
    name: item.name,
    carbs100g: item.carbs100g,
    amount: item.amount || 100,
    source: item.source,
    unit: item.unit || 'g',
  });
  persist();
  refreshFooter();
  if (document.getElementById('page-meal').classList.contains('active')) renderMeal();
}

function renderMeal() {
  const box = document.getElementById('meal-list');
  if (!state.meal.length) {
    box.innerHTML = `<div class="meal-empty">Noch nichts auf dem Teller.<br>Leg los — die Buttons unten warten schon.</div>`;
    return;
  }
  box.innerHTML = state.meal.map(it => `
    <div class="meal-item">
      <div class="meal-item-info">
        <div class="meal-item-name">${esc(it.name)}</div>
        <div class="meal-item-sub">${fmt1(it.carbs100g)} g KH / 100 ${it.unit || 'g'}</div>
      </div>
      <input type="number" inputmode="decimal" class="meal-amount"
             value="${it.amount}" data-mid="${it.id}" min="1">
      <span class="meal-item-unit">${esc(it.unit || 'g')}</span>
      <span class="meal-kh" id="mkh-${it.id}">${fmt1(calcKH(it.carbs100g, it.amount))} g</span>
      <button class="del-btn" data-mid="${it.id}" aria-label="Entfernen">
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
      </button>
    </div>`).join('');

  box.querySelectorAll('.meal-amount').forEach(inp => {
    inp.addEventListener('input', () => {
      const id = inp.dataset.mid;
      const it = state.meal.find(m => m.id === id);
      if (!it) return;
      const a = safeNum(inp.value);
      it.amount = a;
      const el = document.getElementById('mkh-' + id);
      if (el) el.textContent = fmt1(calcKH(it.carbs100g, a)) + ' g';
      refreshFooter();
    });
    inp.addEventListener('change', persist);
  });

  box.querySelectorAll('.del-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      state.meal = state.meal.filter(m => m.id !== btn.dataset.mid);
      persist(); refreshFooter(); renderMeal();
    });
  });
}

document.getElementById('clear-meal-btn').addEventListener('click', () => {
  if (!state.meal.length) return;
  if (!confirm('Aktuelle Mahlzeit leeren?')) return;
  addToHistory(state.meal);
  state.meal = [];
  persist(); refreshFooter(); renderMeal();
  flashBtn(document.getElementById('clear-meal-btn'), 'btn-flash-warn');
});

document.getElementById('save-meal-btn').addEventListener('click', () => {
  if (!state.meal.length) { toast('Mahlzeit ist leer.', 'warning'); return; }
  openNameModal('Mahlzeit speichern', '', name => {
    if (!name.trim()) return;
    state.myMeals.push({
      id: uid(),
      name: name.trim(),
      items: state.meal.map(it => ({ ...it })),
    });
    persist();
    flashBtn(document.getElementById('save-meal-btn'));
    toast(`Mahlzeit „${name}" gespeichert!`);
    if (document.getElementById('page-favorites').classList.contains('active')) renderMeals();
  });
});

// ══════════════════════════════════════════════════════
// MY FOODS
// ══════════════════════════════════════════════════════
function saveFood(item, portionG, unit = 'g') {
  if (item.carbs100g === null || item.carbs100g === undefined) {
    toast('Kein KH-Wert vorhanden – kann nicht gespeichert werden.', 'warning');
    return false;
  }
  if (state.myFoods.find(f => f.name.toLowerCase() === item.name.toLowerCase())) {
    toast(`„${item.name}" ist bereits gespeichert.`, 'warning');
    return false;
  }
  const portion = safeNum(portionG) > 0 ? safeNum(portionG) : 100;
  state.myFoods.push({
    id: uid(), name: item.name,
    carbs100g: item.carbs100g, source: item.source,
    portionG: portion, unit,
  });
  persist();
  toast(`„${item.name}" gespeichert!`);
  if (document.getElementById('page-favorites').classList.contains('active')) renderFoods();
  renderSearchQuick();
  return true;
}

function renderSearchQuick() {
  const section = document.getElementById('search-quick-section');
  const list = document.getElementById('search-quick-list');
  if (!section || !list) return;
  if (!state.myFoods.length) { section.style.display = 'none'; return; }
  section.style.display = 'block';
  list.innerHTML = state.myFoods.map(f => `
    <div class="search-quick-chip" onclick="openFoodModal('${f.id}')">
      <div class="search-quick-chip-name">${esc(f.name)}</div>
      <div class="search-quick-chip-kh">${fmt1(calcKH(f.carbs100g, f.portionG || 100))} g KH</div>
      <div class="search-quick-chip-unit">${f.portionG || 100} ${f.unit || 'g'}</div>
    </div>`).join('');
}

// ── Vordefinierte Kategorien ───────────────────────────
const CAT_FOODS = {
  brot: { label: 'Getreide & Frühstück', items: [
    { name: 'Haferflocken',          carbs100g: 59, source: 'intern', unit: 'g' },
    { name: 'Cornflakes',            carbs100g: 84, source: 'intern', unit: 'g' },
  ]},
  obst: { label: 'Obst', items: [
    { name: 'Erdbeere',              carbs100g: 6,  source: 'intern', unit: 'g' },
    { name: 'Himbeere',              carbs100g: 5,  source: 'intern', unit: 'g' },
    { name: 'Orange',                carbs100g: 9,  source: 'intern', unit: 'g' },
    { name: 'Kiwi',                  carbs100g: 10, source: 'intern', unit: 'g' },
  ]},
  gemuese: { label: 'Gemüse', items: [
    { name: 'Gurke',                 carbs100g: 2,  source: 'intern', unit: 'g' },
    { name: 'Zucchini',             carbs100g: 3,  source: 'intern', unit: 'g' },
    { name: 'Tomate',                carbs100g: 4,  source: 'intern', unit: 'g' },
    { name: 'Brokkoli',              carbs100g: 4,  source: 'intern', unit: 'g' },
    { name: 'Rote Paprika',          carbs100g: 6,  source: 'intern', unit: 'g' },
    { name: 'Edamame',               carbs100g: 6,  source: 'intern', unit: 'g' },
  ]},
  nudeln: { label: 'Nudeln & Reis', items: [
    { name: 'Nudeln, roh',           carbs100g: 70, source: 'intern', unit: 'g' },
    { name: 'Reis, roh',             carbs100g: 77, source: 'intern', unit: 'g' },
  ]},
  milch: { label: 'Milch & Käse', items: [
    { name: 'Vollmilch (3,5%)',      carbs100g: 5,  source: 'intern', unit: 'ml' },
    { name: 'Joghurt natur',         carbs100g: 4,  source: 'intern', unit: 'g' },
    { name: 'Quark (mager)',         carbs100g: 4,  source: 'intern', unit: 'g' },
    { name: 'Gouda',                 carbs100g: 0,  source: 'intern', unit: 'g' },
    { name: 'Mozzarella',            carbs100g: 0,  source: 'intern', unit: 'g' },
    { name: 'Feta',                  carbs100g: 1,  source: 'intern', unit: 'g' },
    { name: 'Frischkäse',            carbs100g: 3,  source: 'intern', unit: 'g' },
    { name: 'Sahne (30%)',           carbs100g: 3,  source: 'intern', unit: 'ml' },
  ]},
  fleisch: { label: 'Fleisch & Fisch', items: [
    { name: 'Hähnchenbrustfilet',    carbs100g: 0,  source: 'intern', unit: 'g' },
    { name: 'Schweinefleisch, roh',  carbs100g: 0,  source: 'intern', unit: 'g' },
    { name: 'Hackfleisch (gem.)',    carbs100g: 0,  source: 'intern', unit: 'g' },
    { name: 'Lachs',                 carbs100g: 0,  source: 'intern', unit: 'g' },
    { name: 'Thunfisch (Dose, Natur)', carbs100g: 0, source: 'intern', unit: 'g' },
    { name: 'Ei',                    carbs100g: 1,  source: 'intern', unit: 'g' },
    { name: 'Tofu (Natur)',          carbs100g: 1,  source: 'intern', unit: 'g' },
  ]},
  snacks: { label: 'Snacks & Süßes', items: [
    { name: 'Gummibärchen',          carbs100g: 77, source: 'intern', unit: 'g' },
    { name: 'Honig',                 carbs100g: 80, source: 'intern', unit: 'g' },
    { name: 'Zucker',                carbs100g: 100,source: 'intern', unit: 'g' },
  ]},
  getraenke: { label: 'Getränke', items: [
    { name: 'Cola',                  carbs100g: 11, source: 'intern', unit: 'ml' },
    { name: 'Cola light / zero',     carbs100g: 0,  source: 'intern', unit: 'ml' },
    { name: 'Orangensaft',           carbs100g: 9,  source: 'intern', unit: 'ml' },
    { name: 'Apfelsaft',             carbs100g: 10, source: 'intern', unit: 'ml' },
    { name: 'Bier (Pils)',           carbs100g: 3,  source: 'intern', unit: 'ml' },
    { name: 'Weißwein (trocken)',    carbs100g: 1,  source: 'intern', unit: 'ml' },
  ]},
};

let _activeCatId = null;

function showCategory(catId) {
  const cat = CAT_FOODS[catId];
  if (!cat) return;
  _activeCatId = catId;
  document.querySelectorAll('.search-cat-chip').forEach(c =>
    c.classList.toggle('active', c.dataset.cat === catId)
  );
  document.getElementById('search-home-body').style.display = 'none';
  searchCache = cat.items;
  const box = document.getElementById('search-results');
  box.innerHTML =
    `<div class="cat-filter-bar">
       <span class="cat-filter-label">${esc(cat.label)}</span>
       <button class="cat-filter-clear" onclick="clearCategory()">Alle Kategorien</button>
     </div>
     <p class="cat-note">Richtwerte für Naturware – Packungsangabe hat immer Vorrang.</p>` +
    cat.items.map((it, i) => searchCard(it, i)).join('');
  bindSearchCards();
}

function clearCategory() {
  _activeCatId = null;
  document.querySelectorAll('.search-cat-chip').forEach(c => c.classList.remove('active'));
  document.getElementById('search-results').innerHTML = '';
  document.getElementById('search-home-body').style.display = '';
  renderSearchQuick();
}

// ── Wissenskarte ───────────────────────────────────────
const KH_TIPS = [
  'Nudeln <em>al dente</em> lassen den Blutzucker langsamer steigen als weich gekochte — der glykämische Index sinkt beim Bissfest-Kochen spürbar.',
  'Vollkornbrot und Weißbrot haben ähnlich viele KH, doch die Ballaststoffe im Vollkorn bremsen die Aufnahme erheblich.',
  'Abgekühlte Kartoffeln oder Nudeln bilden resistente Stärke — dadurch wirken sie sich weniger stark auf den Blutzucker aus als frisch gekochte.',
  'Reife Bananen enthalten mehr Fruchtzucker als grüne. Je gelber, desto schneller steigt der Blutzucker.',
  'Hülsenfrüchte wie Linsen sind KH-reich, haben aber trotzdem einen sehr niedrigen glykämischen Index.',
  'Ein Spritzer Essig oder Zitronensaft zur Mahlzeit kann den Blutzuckeranstieg danach leicht verlangsamen.',
];

let _tipIdx = 0;
let _tipTimer;

function renderTip() {
  const text = document.getElementById('search-tip-text');
  const dots = document.getElementById('search-tip-dots');
  if (!text || !dots) return;
  text.innerHTML = KH_TIPS[_tipIdx];
  dots.innerHTML = KH_TIPS.map((_, i) =>
    `<div class="search-tip-dot${i === _tipIdx ? ' active' : ''}"></div>`
  ).join('');
}

function advanceTip() {
  _tipIdx = (_tipIdx + 1) % KH_TIPS.length;
  renderTip();
}

document.getElementById('search-tip-card').addEventListener('click', () => {
  clearInterval(_tipTimer);
  advanceTip();
  _tipTimer = setInterval(advanceTip, 8000);
});

function updateFavCounts() {
  const fc = document.getElementById('fav-foods-count');
  const mc = document.getElementById('fav-meals-count');
  const hc = document.getElementById('fav-history-count');
  if (fc) fc.textContent = state.myFoods.length;
  if (mc) mc.textContent = state.myMeals.length;
  if (hc) hc.textContent = state.mealHistory.length;
}

function renderFoods() {
  const box = document.getElementById('fav-foods-list');
  updateFavCounts();
  if (!state.myFoods.length) {
    box.innerHTML = `<div class="fav-empty">Noch keine Lebensmittel gespeichert.<br>Suche ein Produkt und tippe das Lesezeichen-Symbol.</div>`;
    return;
  }
  box.innerHTML = state.myFoods.map(f => `
    <div class="fav-food-row">
      <div class="fav-food-info">
        <div class="fav-food-name">${esc(f.name)}</div>
        <div class="fav-food-sub">${fmt1(calcKH(f.carbs100g, f.portionG || 100))} g KH · ${f.portionG || 100} ${f.unit || 'g'} Portion</div>
      </div>
      <button class="btn btn-primary" style="padding:9px 13px;flex-shrink:0"
              onclick="openFoodModal('${f.id}')" aria-label="Zur Mahlzeit hinzufügen">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
      </button>
      <button class="del-btn" onclick="deleteFood('${f.id}')" aria-label="Löschen">
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/></svg>
      </button>
    </div>`).join('');
}

function deleteFood(id) {
  state.myFoods = state.myFoods.filter(f => f.id !== id);
  persist(); renderFoods(); renderSearchQuick();
}

function openFoodModal(id) {
  const f = state.myFoods.find(x => x.id === id);
  if (!f) return;
  foodModalTarget = f;
  const unit = f.unit || 'g';
  document.getElementById('food-modal-name').textContent = f.name;
  document.getElementById('food-modal-info').textContent =
    `KH-Gehalt: ${fmt1(f.carbs100g)} g pro 100 ${unit}`;
  document.getElementById('food-modal-unit').textContent = unit;
  const defaultPortion = f.portionG || 100;
  document.getElementById('food-modal-amount').value = defaultPortion;
  document.getElementById('food-modal-kh').textContent = 'Das ergibt: ' + fmt1(calcKH(f.carbs100g, defaultPortion)) + ' g KH';
  document.getElementById('food-modal').classList.add('open');
}

document.getElementById('food-modal-amount').addEventListener('input', e => {
  if (!foodModalTarget) return;
  const kh = calcKH(foodModalTarget.carbs100g, safeNum(e.target.value));
  document.getElementById('food-modal-kh').textContent = 'Das ergibt: ' + fmt1(kh) + ' g KH';
});

document.getElementById('food-modal-cancel').addEventListener('click', () => {
  document.getElementById('food-modal').classList.remove('open');
  foodModalTarget = null;
});

document.getElementById('food-modal-ok').addEventListener('click', () => {
  if (!foodModalTarget) return;
  const a = safeNum(document.getElementById('food-modal-amount').value);
  if (a <= 0) { toast('Bitte gültige Menge eingeben.', 'warning'); return; }
  addToMeal({ ...foodModalTarget, amount: a });
  flashBtn(document.getElementById('food-modal-ok'));
  document.getElementById('food-modal').classList.remove('open');
  foodModalTarget = null;
  toast('Zur Mahlzeit hinzugefügt!');
  showTab('meal');
});

// ══════════════════════════════════════════════════════
// MY MEALS
// ══════════════════════════════════════════════════════
function renderMeals() {
  const box = document.getElementById('fav-meals-list');
  updateFavCounts();
  if (!state.myMeals.length) {
    box.innerHTML = `<div class="fav-empty">Noch keine Mahlzeiten gespeichert.<br>Stelle eine Mahlzeit zusammen und speichere sie.</div>`;
    return;
  }
  box.innerHTML = state.myMeals.map(m => {
    const kh = m.items.reduce((s, it) => s + calcKH(it.carbs100g, it.amount), 0);
    const preview = m.items.slice(0, 3).map(it => `${esc(it.name)} (${it.amount} ${it.unit || 'g'})`).join(', ')
      + (m.items.length > 3 ? ` +${m.items.length - 3} weitere` : '');
    return `
    <div class="fav-food-row">
      <div class="fav-food-info">
        <div class="fav-food-name">${esc(m.name)}</div>
        <div class="fav-food-sub">${fmt1(kh)} g KH · ${preview}</div>
      </div>
      <button class="btn btn-primary" style="padding:9px 13px;flex-shrink:0"
              onclick="loadMeal('${m.id}')" aria-label="In KH-Rechner laden">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
      </button>
      <button class="del-btn" onclick="deleteMeal('${m.id}')" aria-label="Löschen">
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/></svg>
      </button>
    </div>`;
  }).join('');
}

function loadMeal(id) {
  const m = state.myMeals.find(x => x.id === id);
  if (!m) return;
  if (state.meal.length && !confirm('Aktuelle Mahlzeit wird ersetzt. Fortfahren?')) return;
  addToHistory(state.meal);
  state.meal = m.items.map(it => ({ ...it, id: uid() }));
  persist(); refreshFooter();
  showTab('meal');
}

function renderHistory() {
  const box = document.getElementById('fav-history-list');
  if (!box) return;
  updateFavCounts();
  if (!state.mealHistory.length) {
    box.innerHTML = `<div class="fav-empty">Noch kein Verlauf.<br>Wird automatisch gespeichert, wenn du eine Mahlzeit leerst.</div>`;
    return;
  }
  box.innerHTML = state.mealHistory.map(h => {
    const preview = h.items.slice(0, 3).map(it => `${esc(it.name)} (${it.amount} ${it.unit || 'g'})`).join(', ')
      + (h.items.length > 3 ? ` +${h.items.length - 3} weitere` : '');
    return `
    <div class="fav-food-row">
      <div class="fav-food-info">
        <div class="fav-food-name">${fmtDate(h.ts)}</div>
        <div class="fav-food-sub">${fmt1(h.kh)} g KH · ${preview}</div>
      </div>
      <button class="btn btn-primary" style="padding:9px 13px;flex-shrink:0"
              onclick="loadHistory('${h.id}')" aria-label="In KH-Rechner laden">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
      </button>
    </div>`;
  }).join('');
}

function loadHistory(id) {
  const h = state.mealHistory.find(x => x.id === id);
  if (!h) return;
  if (state.meal.length && !confirm('Aktuelle Mahlzeit wird ersetzt. Fortfahren?')) return;
  addToHistory(state.meal);
  state.meal = h.items.map(it => ({ ...it, id: uid() }));
  persist(); refreshFooter();
  showTab('meal');
}

function deleteMeal(id) {
  state.myMeals = state.myMeals.filter(m => m.id !== id);
  persist(); renderMeals();
}

// ══════════════════════════════════════════════════════
// NAME MODAL
// ══════════════════════════════════════════════════════
function openNameModal(title, def, cb) {
  document.getElementById('name-modal-title').textContent = title;
  document.getElementById('name-modal-input').value = def || '';
  nameModalCb = cb;
  document.getElementById('name-modal').classList.add('open');
  setTimeout(() => document.getElementById('name-modal-input').focus(), 80);
}

document.getElementById('name-modal-cancel').addEventListener('click', () => {
  document.getElementById('name-modal').classList.remove('open');
  nameModalCb = null;
});

document.getElementById('name-modal-ok').addEventListener('click', () => {
  const v = document.getElementById('name-modal-input').value.trim();
  document.getElementById('name-modal').classList.remove('open');
  if (nameModalCb) { nameModalCb(v); nameModalCb = null; }
});

document.getElementById('name-modal-input').addEventListener('keydown', e => {
  if (e.key === 'Enter') document.getElementById('name-modal-ok').click();
});

document.querySelectorAll('.modal-bg').forEach(bg => {
  bg.addEventListener('click', e => {
    if (e.target === bg) bg.classList.remove('open');
  });
});

// ══════════════════════════════════════════════════════
// BARCODE SCANNER
// ══════════════════════════════════════════════════════
function isSecure() {
  return location.protocol === 'https:' ||
         location.hostname === 'localhost' ||
         location.hostname === '127.0.0.1';
}

document.getElementById('scan-btn').addEventListener('click', () => {
  if (!isSecure()) {
    document.getElementById('search-https-warn').style.display = 'block';
    return;
  }
  startScanner();
});

document.getElementById('scanner-close').addEventListener('click', stopScanner);

document.getElementById('torch-btn').addEventListener('click', async () => {
  const track = document.getElementById('scanner-video')?.srcObject?.getVideoTracks()[0];
  if (!track) return;
  torchOn = !torchOn;
  try { await track.applyConstraints({ advanced: [{ torch: torchOn }] }); } catch(_) {}
  document.getElementById('torch-btn').classList.toggle('active', torchOn);
});

async function loadZXing() {
  if (zxingLoaded) return;
  return new Promise((res, rej) => {
    const s = document.createElement('script');
    s.src = 'https://cdn.jsdelivr.net/npm/@zxing/library@0.21.3/umd/index.min.js';
    s.onload  = () => { zxingLoaded = true; res(); };
    s.onerror = () => rej(new Error('ZXing konnte nicht geladen werden.'));
    document.head.appendChild(s);
  });
}

async function startScanner() {
  const overlay = document.getElementById('scanner-overlay');
  const status  = document.getElementById('scan-status');
  overlay.classList.add('open');
  status.textContent = 'ZXing wird geladen…';
  scannerActive = true;

  try {
    await loadZXing();

    if (!navigator.mediaDevices?.getUserMedia) {
      status.textContent = 'Kamera-API nicht verfügbar. Bitte modernen Browser verwenden.';
      return;
    }

    status.textContent = 'Kamera wird gestartet…';

    const hints = new Map();
    hints.set(ZXing.DecodeHintType.POSSIBLE_FORMATS, [
      ZXing.BarcodeFormat.EAN_13,
      ZXing.BarcodeFormat.EAN_8,
      ZXing.BarcodeFormat.UPC_A,
      ZXing.BarcodeFormat.UPC_E,
      ZXing.BarcodeFormat.CODE_128,
    ]);
    hints.set(ZXing.DecodeHintType.TRY_HARDER, true);
    const reader = new ZXing.BrowserMultiFormatReader(hints);
    activeCReader = reader;

    const constraints = {
      video: {
        facingMode: { ideal: 'environment' },
        width:  { ideal: 1920 },
        height: { ideal: 1080 },
        advanced: [{ focusMode: 'continuous' }],
      }
    };

    status.textContent = 'Barcode in den Rahmen halten…';

    reader.decodeFromConstraints(constraints, 'scanner-video', async (result, err) => {
      if (!scannerActive) return;
      if (result) {
        if (navigator.vibrate) navigator.vibrate(50);
        stopScanner();
        await handleBarcode(result.getText());
      }
    });

    setTimeout(() => {
      const track = document.getElementById('scanner-video')?.srcObject?.getVideoTracks()[0];
      if (track?.getCapabilities?.()?.torch) {
        document.getElementById('torch-btn').classList.remove('hidden');
      }
    }, 1200);

  } catch(err) {
    console.warn('[Scanner]', err);
    if (err.name === 'NotAllowedError') {
      status.textContent =
        'Kamerazugriff verweigert. Bitte in den Browser-Einstellungen die Kamera-Berechtigung für diese Seite aktivieren.';
    } else {
      status.textContent = 'Fehler: ' + (err.message || err);
    }
  }
}

function stopScanner() {
  scannerActive = false;
  torchOn = false;
  const torchBtn = document.getElementById('torch-btn');
  if (torchBtn) { torchBtn.classList.add('hidden'); torchBtn.classList.remove('active'); }
  if (activeCReader) {
    try { activeCReader.reset(); } catch(_) {}
    activeCReader = null;
  }
  const v = document.getElementById('scanner-video');
  if (v.srcObject) {
    v.srcObject.getTracks().forEach(t => t.stop());
    v.srcObject = null;
  }
  document.getElementById('scanner-overlay').classList.remove('open');
  document.getElementById('scan-status').textContent = '';
}

async function handleBarcode(barcode) {
  showTab('search');
  document.getElementById('search-input').value = barcode;
  document.getElementById('search-home-body').style.display = 'none';
  const box = document.getElementById('search-results');
  box.innerHTML = '<div class="spinner"></div>';

  try {
    const product = await apiOFFBarcode(barcode);

    if (!product) {
      box.innerHTML = `<div class="alert alert-warning">Produkt nicht gefunden. Suche läuft…</div>`;
      document.getElementById('search-input').value = barcode;
      await runSearch(barcode);
      return;
    }

    if (!product.hasCarbs || product.carbs100g === null) {
      toast('Produkt gefunden, aber kein KH-Wert. Öffne Textsuche.', 'warning');
      document.getElementById('search-input').value = product.name;
      await runSearch(product.name);
      return;
    }

    searchCache = [product];
    box.innerHTML =
      `<div class="alert alert-info">Barcode: ${esc(barcode)}</div>` +
      searchCard(product, 0);
    bindSearchCards();

  } catch(err) {
    toast('Barcode-Fehler: ' + err.message + '. Starte Textsuche.', 'warning');
    await runSearch(barcode);
  }
}

// ══════════════════════════════════════════════════════
// FAVORITES PICKER
// ══════════════════════════════════════════════════════
function openFavPicker() {
  const list = document.getElementById('fav-picker-list');
  const hasFoods = state.myFoods.length > 0;
  const hasMeals = state.myMeals.length > 0;

  if (!hasFoods && !hasMeals) {
    list.innerHTML = `<div class="fav-empty">Noch keine Favoriten gespeichert.<br>Suche ein Lebensmittel und speichere es.</div>`;
    document.getElementById('fav-picker-modal').classList.add('open');
    return;
  }

  let html = '';

  if (hasFoods) {
    html += `<div class="search-quick-label" style="padding:4px 0 6px">Lebensmittel</div>`;
    html += state.myFoods.map(f => `
      <div class="fav-food-row">
        <div class="fav-food-info">
          <div class="fav-food-name">${esc(f.name)}</div>
          <div class="fav-food-sub">${fmt1(calcKH(f.carbs100g, f.portionG || 100))} g KH · ${f.portionG || 100} ${f.unit || 'g'} Portion</div>
        </div>
        <button class="btn btn-primary" style="padding:9px 13px;flex-shrink:0"
                onclick="pickFav('${f.id}')" aria-label="Hinzufügen">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
        </button>
      </div>`).join('');
  }

  if (hasMeals) {
    html += `<div class="search-quick-label" style="padding:${hasFoods ? '14px' : '4px'} 0 6px">Mahlzeiten</div>`;
    html += state.myMeals.map(m => {
      const kh = m.items.reduce((s, it) => s + calcKH(it.carbs100g, it.amount), 0);
      const preview = m.items.slice(0, 2).map(it => esc(it.name)).join(', ')
        + (m.items.length > 2 ? ` +${m.items.length - 2}` : '');
      return `
      <div class="fav-food-row">
        <div class="fav-food-info">
          <div class="fav-food-name">${esc(m.name)}</div>
          <div class="fav-food-sub">${fmt1(kh)} g KH · ${preview}</div>
        </div>
        <button class="btn btn-primary" style="padding:9px 13px;flex-shrink:0"
                onclick="pickMeal('${m.id}')" aria-label="Laden">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
        </button>
      </div>`;
    }).join('');
  }

  list.innerHTML = html;
  document.getElementById('fav-picker-modal').classList.add('open');
}

function pickMeal(id) {
  document.getElementById('fav-picker-modal').classList.remove('open');
  loadMeal(id);
}

function pickFav(id) {
  document.getElementById('fav-picker-modal').classList.remove('open');
  openFoodModal(id);
}

document.getElementById('add-from-fav-btn').addEventListener('click', openFavPicker);
document.getElementById('fav-picker-cancel').addEventListener('click', () =>
  document.getElementById('fav-picker-modal').classList.remove('open')
);

document.getElementById('go-search-btn').addEventListener('click', () => {
  showTab('search');
  setTimeout(() => document.getElementById('search-input').focus(), 80);
});

// ══════════════════════════════════════════════════════
// ONBOARDING
// ══════════════════════════════════════════════════════
let obStep = 0;
const OB_STEPS = 3;

function obShow(step) {
  obStep = step;
  document.querySelectorAll('.ob-step').forEach((el, i) => el.classList.toggle('active', i === step));
  document.querySelectorAll('.ob-dot').forEach((el, i) => el.classList.toggle('active', i === step));
  const nextBtn = document.getElementById('ob-next');
  nextBtn.textContent = step === OB_STEPS - 1 ? 'Los geht\'s!' : 'Weiter';
}

document.getElementById('ob-next').addEventListener('click', () => {
  if (obStep < OB_STEPS - 1) {
    obShow(obStep + 1);
  } else {
    closeOnboarding();
  }
});

document.getElementById('ob-skip').addEventListener('click', closeOnboarding);

function closeOnboarding() {
  document.getElementById('onboarding-overlay').classList.add('hidden');
  localStorage.setItem('kh_onboarded', '1');
}

function startOnboarding() {
  obShow(0);
  document.getElementById('onboarding-overlay').classList.remove('hidden');
}

// ══════════════════════════════════════════════════════
// BOOT
// ══════════════════════════════════════════════════════
loadState();
updateFavCounts();
renderSearchQuick();

if (!localStorage.getItem('kh_onboarded')) {
  startOnboarding();
}

if (!isSecure()) {
  document.getElementById('search-https-warn').style.display = 'block';
}

refreshFooter();
renderTip();
_tipTimer = setInterval(advanceTip, 8000);

if (document.getElementById('page-meal').classList.contains('active')) renderMeal();
