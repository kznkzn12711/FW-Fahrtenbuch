'use strict';
const $ = id => document.getElementById(id);
const KEY = 'fahrtenbuch.db', CFG = 'fahrtenbuch.nc';

// ---- Daten ----
// db = { vehicles:[{id,name,updated}], entries:[{id,vehicle,date,km,purpose,updated,deleted}] }
const DEFAULT_PURPOSES = ['Ausbildung', 'Bewegung', 'Einsatz', 'Einsatz (ohne Sondersignal)', 'Übung', 'Jugend', 'Transport /Transit', 'Lehrgang']
  .map((name, i) => ({ id: 'p' + (i + 1), name, updated: 0 }));
function load() {
  try {
    const d = JSON.parse(localStorage.getItem(KEY));
    if (d && d.vehicles && d.entries) { if (!d.purposes) d.purposes = DEFAULT_PURPOSES.map(p => ({ ...p })); return d; }
  } catch (e) {}
  return { vehicles: [1, 2, 3, 4, 5].map(i => ({ id: 'v' + i, name: 'Fahrzeug ' + i, updated: 0 })), purposes: DEFAULT_PURPOSES.map(p => ({ ...p })), entries: [] };
}
let db = load();
let editId = null;
const save = () => localStorage.setItem(KEY, JSON.stringify(db));
const live = () => db.entries.filter(e => !e.deleted);
const vName = id => (db.vehicles.find(v => v.id === id) || { name: '?' }).name;
// Fahrzeugtyp: 'pkw' (<= 3,5 t) oder 'lkw' (> 3,5 t); ältere Daten ohne Typ: erstes Fahrzeug PKW, übrige LKW
const vType = v => v.type || (v.id === 'v1' ? 'pkw' : 'lkw');
const vById = id => db.vehicles.find(v => v.id === id) || {};
const liveVehicles = () => db.vehicles.filter(v => !v.deleted);
const byOrder = (a, b) => a.id.length - b.id.length || a.id.localeCompare(b.id);
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
const fmtKm = n => n.toLocaleString('de-DE', { maximumFractionDigits: 1 });
const fmtDate = s => s.split('-').reverse().join('.');
const today = () => { const d = new Date(); return new Date(d - d.getTimezoneOffset() * 6e4).toISOString().slice(0, 10); };

function merge(remote) {
  const mergeList = (a, b) => {
    const m = new Map(a.map(x => [x.id, x]));
    for (const r of b || []) { const l = m.get(r.id); if (!l || (r.updated || 0) > (l.updated || 0)) m.set(r.id, r); }
    return [...m.values()];
  };
  db.vehicles = mergeList(db.vehicles, remote.vehicles).sort(byOrder);
  db.purposes = mergeList(db.purposes, remote.purposes);
  db.entries = mergeList(db.entries, remote.entries);
  save();
}

// ---- UI: Erfassen ----
function fillVehicleSelects(extra) {
  const opt = v => `<option value="${v.id}">${esc(v.name)}</option>`;
  const used = new Set(live().map(e => e.vehicle));
  const formOpts = db.vehicles.filter(v => !v.deleted || v.id === extra).map(opt).join('');
  const allOpts = db.vehicles.filter(v => !v.deleted || used.has(v.id)).map(opt).join('');
  const keep = [$('vehicle').value, $('filterVehicle').value, $('statVehicle').value];
  $('vehicle').innerHTML = formOpts;
  $('filterVehicle').innerHTML = '<option value="">Alle</option>' + allOpts;
  $('statVehicle').innerHTML = '<option value="">Alle</option>' + allOpts;
  [$('vehicle'), $('filterVehicle'), $('statVehicle')].forEach((s, i) => { if (keep[i]) s.value = keep[i]; });
  if (!$('vehicle').value) { const first = liveVehicles()[0]; $('vehicle').value = localStorage.getItem('fahrtenbuch.lastVehicle') || (first && first.id) || ''; }
}
function esc(s) { return String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])); }

function renderList() {
  const f = $('filterVehicle').value;
  const rows = live().filter(e => !f || e.vehicle === f).sort((a, b) => b.date.localeCompare(a.date) || b.updated - a.updated).slice(0, 100);
  $('list').innerHTML = rows.map(e => `<li>
    <div class="main"><div>${esc(e.purpose)}</div><div class="sub">${fmtDate(e.date)} · ${esc(vName(e.vehicle))}</div></div>
    <div class="km">${fmtKm(e.km)} km</div>
    <button data-edit="${e.id}">✎</button><button class="del" data-del="${e.id}">✕</button></li>`).join('') || '<p class="hint">Noch keine Fahrten.</p>';
}
const livePurposes = () => db.purposes.filter(p => !p.deleted);
function fillPurposeSelect(extra) {
  const keep = $('purpose').value;
  const names = livePurposes().map(p => p.name);
  if (extra && !names.includes(extra)) names.push(extra);
  $('purpose').innerHTML = '<option value="" disabled>– wählen –</option>' + names.map(n => `<option>${esc(n)}</option>`).join('');
  $('purpose').value = extra || (names.includes(keep) ? keep : '');
}

$('form').addEventListener('submit', ev => {
  ev.preventDefault();
  const rec = { id: editId || uid(), vehicle: $('vehicle').value, date: $('date').value, km: parseFloat($('km').value), purpose: $('purpose').value, updated: Date.now() };
  const i = db.entries.findIndex(e => e.id === rec.id);
  if (i >= 0) db.entries[i] = rec; else db.entries.push(rec);
  localStorage.setItem('fahrtenbuch.lastVehicle', rec.vehicle);
  save(); resetForm(); renderAll(); autoSync();
});
function resetForm() {
  editId = null; $('km').value = ''; fillPurposeSelect(); $('purpose').value = ''; $('date').value = today();
  $('save').textContent = 'Speichern'; $('cancelEdit').hidden = true;
}
$('cancelEdit').onclick = resetForm;
$('list').addEventListener('click', ev => {
  const t = ev.target;
  if (t.dataset.edit) {
    const e = db.entries.find(x => x.id === t.dataset.edit);
    editId = e.id; fillVehicleSelects(e.vehicle); $('vehicle').value = e.vehicle; $('date').value = e.date; $('km').value = e.km; fillPurposeSelect(e.purpose);
    $('save').textContent = 'Änderung speichern'; $('cancelEdit').hidden = false; scrollTo(0, 0);
  } else if (t.dataset.del && confirm('Fahrt löschen?')) {
    const e = db.entries.find(x => x.id === t.dataset.del);
    e.deleted = true; e.updated = Date.now(); save(); renderAll(); autoSync();
  }
});
$('filterVehicle').onchange = renderList;

// ---- Statistik ----
function bars(map, el, sortKeys) {
  const keys = sortKeys ? [...map.keys()].sort() : [...map.keys()].sort((a, b) => map.get(b) - map.get(a));
  const max = Math.max(1, ...map.values());
  el.innerHTML = keys.map(k => `<div class="bar"><span class="lbl">${esc(k)}</span><span class="fill" style="width:${map.get(k) / max * 55}%"></span><span class="val">${fmtKm(map.get(k))}</span></div>`).join('') || '<p class="hint">Keine Daten.</p>';
}
// Umschalter Balken/Kreis je Diagramm, die Wahl wird pro Gerät gemerkt
const chartKey = id => 'fahrtenbuch.chart.' + id;
const chartMode = id => { try { return localStorage.getItem(chartKey(id)) === 'pie' ? 'pie' : 'bars'; } catch (e) { return 'bars'; } };
document.querySelectorAll('.seg').forEach(seg => seg.addEventListener('click', ev => {
  if (!ev.target.dataset.mode) return;
  try { localStorage.setItem(chartKey(seg.dataset.for), ev.target.dataset.mode); } catch (e) {}
  renderStats();
}));
function chart(map, el) {
  document.querySelectorAll(`.seg[data-for="${el.id}"] button`).forEach(b => b.classList.toggle('active', b.dataset.mode === chartMode(el.id)));
  if (chartMode(el.id) !== 'pie') return bars(map, el);
  const keys = [...map.keys()].filter(k => map.get(k) > 0).sort((a, b) => map.get(b) - map.get(a));
  const total = keys.reduce((s, k) => s + map.get(k), 0);
  if (!total) { el.innerHTML = '<p class="hint">Keine Daten.</p>'; return; }
  const color = i => `hsl(${Math.round(i * 137.5) % 360}, 55%, 50%)`;
  const pt = a => [100 + 90 * Math.cos(a), 100 + 90 * Math.sin(a)];
  let a0 = -Math.PI / 2, slices = '', legend = '';
  keys.forEach((k, i) => {
    const km = map.get(k), frac = km / total, a1 = a0 + frac * 2 * Math.PI;
    const pct = (frac * 100).toLocaleString('de-DE', { maximumFractionDigits: 1 });
    const tip = `<title>${esc(k)}: ${fmtKm(km)} km (${pct} %)</title>`;
    if (frac > 0.9999) slices += `<circle cx="100" cy="100" r="90" fill="${color(i)}">${tip}</circle>`;
    else { const [x0, y0] = pt(a0), [x1, y1] = pt(a1); slices += `<path d="M100 100 L${x0} ${y0} A90 90 0 ${frac > 0.5 ? 1 : 0} 1 ${x1} ${y1} Z" fill="${color(i)}" stroke="var(--bg)" stroke-width="1.5">${tip}</path>`; }
    legend += `<div class="leg"><span class="sw" style="background:${color(i)}"></span><span class="lbl">${esc(k)}</span><span class="val">${fmtKm(km)} km · ${pct} %</span></div>`;
    a0 = a1;
  });
  el.innerHTML = `<svg class="pie" viewBox="0 0 200 200" role="img" aria-label="Kreisdiagramm">${slices}</svg>${legend}`;
}
function renderStats() {
  const years = [...new Set(live().map(e => e.date.slice(0, 4)))].sort().reverse();
  const cur = $('statYear').value;
  $('statYear').innerHTML = '<option value="">Gesamt</option>' + years.map(y => `<option>${y}</option>`).join('');
  $('statYear').value = years.includes(cur) ? cur : '';
  const v = $('statVehicle').value, y = $('statYear').value;
  const inYear = live().filter(e => !y || e.date.startsWith(y));
  const rows = inYear.filter(e => !v || e.vehicle === v);
  const sum = (list, keyFn) => { const m = new Map(); list.forEach(e => m.set(keyFn(e), (m.get(keyFn(e)) || 0) + e.km)); return m; };
  $('statTotal').textContent = fmtKm(rows.reduce((s, e) => s + e.km, 0)) + ' km';
  bars(sum(rows, e => e.date.slice(0, 7)), $('statMonth'), true);
  chart(sum(rows, e => e.purpose), $('statPurpose'));
  chart(sum(inYear, e => vName(e.vehicle)), $('statVeh'));
  renderCompare(y || years[0] || '');
}
$('statVehicle').onchange = $('statYear').onchange = $('cmpToDate').onchange = renderStats;

// Vorjahresvergleich: unabhängig vom Fahrzeugfilter; optional nur bis zum gleichen Kalendertag
function renderCompare(year) {
  if (!year) { $('statCmp').innerHTML = '<p class="hint">Keine Daten.</p>'; return; }
  const prev = String(+year - 1), now = today();
  const cut = $('cmpToDate').checked && year === now.slice(0, 4) ? now.slice(5) : '99-99';
  const sumFor = (yr, pred) => live().filter(e => e.date.startsWith(yr) && e.date.slice(5) <= cut && pred(e)).reduce((s, e) => s + e.km, 0);
  const rows = [['Gesamt', () => true], ['Summe LKW', e => vType(vById(e.vehicle)) === 'lkw'], ['Summe PKW', e => vType(vById(e.vehicle)) === 'pkw']];
  const used = new Set(live().filter(e => e.date.startsWith(year) || e.date.startsWith(prev)).map(e => e.vehicle));
  db.vehicles.filter(v => !v.deleted || used.has(v.id)).forEach(v => rows.push([v.name, e => e.vehicle === v.id, true]));
  const sign = n => (n > 0 ? '+' : n < 0 ? '−' : '') + fmtKm(Math.abs(n));
  const body = rows.map(([label, pred, sub]) => {
    const cur = sumFor(year, pred), old = sumFor(prev, pred), d = cur - old;
    if (sub && !cur && !old) return '';
    return `<tr class="${sub ? '' : 'sum'}"><td>${esc(label)}</td><td>${fmtKm(cur)}</td><td>${fmtKm(old)}</td><td>${sign(d)}</td><td>${old ? sign(Math.round(d / old * 1000) / 10) + ' %' : '–'}</td></tr>`;
  }).join('');
  $('statCmp').innerHTML = `<table class="cmp"><thead><tr><th></th><th>${year}</th><th>${prev}</th><th>Diff. km</th><th>Diff.</th></tr></thead><tbody>${body}</tbody></table>`
    + (cut !== '99-99' ? `<p class="hint">Beide Jahre bis ${cut.split('-').reverse().join('.')}.</p>` : '');
}

// ---- Einstellungen ----
const typeOpts = sel => ['pkw', 'lkw'].map(t => `<option value="${t}"${t === sel ? ' selected' : ''}>${t.toUpperCase()}</option>`).join('');
function renderVehicleNames() {
  $('vehicleNames').innerHTML = liveVehicles().map(v => `<div class="row"><input data-vid="${v.id}" value="${esc(v.name)}"><select data-vtype="${v.id}">${typeOpts(vType(v))}</select><button class="del" data-vdel="${v.id}">✕</button></div>`).join('');
}
$('vehicleNames').addEventListener('change', ev => {
  const t = ev.target, v = db.vehicles.find(x => x.id === (t.dataset.vid || t.dataset.vtype));
  if (!v) return;
  if (t.dataset.vid) v.name = t.value.trim() || v.name; else v.type = t.value;
  v.updated = Date.now(); save(); renderAll(); autoSync();
});
$('vehicleNames').addEventListener('click', ev => {
  const v = db.vehicles.find(x => x.id === ev.target.dataset.vdel);
  if (!v) return;
  if (liveVehicles().length < 2) return alert('Mindestens ein Fahrzeug muss bleiben.');
  if (!confirm('„' + v.name + '“ entfernen? Bestehende Fahrten bleiben in der Statistik erhalten.')) return;
  v.deleted = true; v.updated = Date.now(); save(); renderAll(); autoSync();
});
$('addVehicleForm').addEventListener('submit', ev => {
  ev.preventDefault();
  const name = $('newVehicle').value.trim(); if (!name) return;
  db.vehicles.push({ id: 'v' + uid(), name, type: $('newVehicleType').value, updated: Date.now() });
  db.vehicles.sort(byOrder); $('newVehicle').value = ''; save(); renderAll(); autoSync();
});

function renderPurposeNames() {
  $('purposeNames').innerHTML = livePurposes().map(p => `<div class="row"><input data-pid="${p.id}" value="${esc(p.name)}"><button class="del" data-pdel="${p.id}">✕</button></div>`).join('');
}
$('purposeNames').addEventListener('change', ev => {
  const p = db.purposes.find(x => x.id === ev.target.dataset.pid), name = ev.target.value.trim();
  if (!p || !name || name === p.name) return renderPurposeNames();
  const t = Date.now();
  db.entries.forEach(e => { if (e.purpose === p.name) { e.purpose = name; e.updated = t; } });
  p.name = name; p.updated = t; save(); renderAll(); autoSync();
});
$('purposeNames').addEventListener('click', ev => {
  const p = db.purposes.find(x => x.id === ev.target.dataset.pdel);
  if (!p || !confirm('„' + p.name + '“ aus der Auswahl entfernen? Bestehende Fahrten behalten ihren Zweck.')) return;
  p.deleted = true; p.updated = Date.now(); save(); renderAll(); autoSync();
});
$('addPurposeForm').addEventListener('submit', ev => {
  ev.preventDefault();
  const name = $('newPurpose').value.trim(); if (!name) return;
  if (!livePurposes().some(p => p.name === name)) db.purposes.push({ id: 'p' + uid(), name, updated: Date.now() });
  $('newPurpose').value = ''; save(); renderAll(); autoSync();
});

// ---- Cloud-Sync (Dropbox, Nextcloud/WebDAV) ----
const cfg = () => { try { return JSON.parse(localStorage.getItem(CFG)) || {}; } catch (e) { return {}; } };
function loadCfg() { const c = cfg(); $('ncUrl').value = c.url || ''; $('ncUser').value = c.user || ''; $('ncPass').value = c.pass || ''; }
$('ncSave').onclick = () => { localStorage.setItem(CFG, JSON.stringify({ url: $('ncUrl').value.trim(), user: $('ncUser').value.trim(), pass: $('ncPass').value })); setState('Gespeichert'); };
$('ncSync').onclick = () => { $('ncSave').click(); sync(true); };
const setState = t => { $('syncState').textContent = t; };

const DBX = 'fahrtenbuch.dbx', DBX_FILE = '/Fahrtenbuch.json';
const dbx = () => { try { return JSON.parse(localStorage.getItem(DBX)) || {}; } catch (e) { return {}; } };
const dbxSet = o => localStorage.setItem(DBX, JSON.stringify({ ...dbx(), ...o }));
const redirectUri = () => location.origin + location.pathname.replace(/index\.html$/, '');
const b64url = buf => btoa(String.fromCharCode(...new Uint8Array(buf))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
async function dbxToken(params) {
  const r = await fetch('https://api.dropboxapi.com/oauth2/token', { method: 'POST', body: new URLSearchParams({ client_id: dbx().key, ...params }) });
  if (!r.ok) throw new Error('Dropbox-Anmeldung: HTTP ' + r.status + ' ' + (await r.text()).slice(0, 300));
  return r.json();
}
async function dbxConnect() {
  const key = $('dbxKey').value.trim(); if (!key) return alert('Bitte zuerst den Dropbox App-Key eintragen.');
  const verifier = b64url(crypto.getRandomValues(new Uint8Array(48)));
  const challenge = b64url(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier)));
  dbxSet({ key, verifier });
  location.href = 'https://www.dropbox.com/oauth2/authorize?' + new URLSearchParams({ client_id: key, response_type: 'code', code_challenge: challenge, code_challenge_method: 'S256', token_access_type: 'offline', redirect_uri: redirectUri() });
}
async function dbxFinishLogin() {
  const code = new URLSearchParams(location.search).get('code'); if (!code || !dbx().verifier) return;
  history.replaceState(null, '', redirectUri());
  try {
    const t = await dbxToken({ grant_type: 'authorization_code', code, code_verifier: dbx().verifier, redirect_uri: redirectUri() });
    dbxSet({ refresh: t.refresh_token, access: t.access_token, expires: Date.now() + t.expires_in * 1000 - 60000, verifier: null });
    renderDbx(); await sync(true);
  } catch (e) { alert(e.message); }
}
async function dbxAccess() {
  const d = dbx(); if (d.access && d.expires > Date.now()) return d.access;
  const t = await dbxToken({ grant_type: 'refresh_token', refresh_token: d.refresh });
  dbxSet({ access: t.access_token, expires: Date.now() + t.expires_in * 1000 - 60000 }); return t.access_token;
}
const dbxRemote = {
  active: () => !!dbx().refresh,
  async get() {
    const r = await fetch('https://content.dropboxapi.com/2/files/download', { method: 'POST', headers: { Authorization: 'Bearer ' + await dbxAccess(), 'Dropbox-API-Arg': JSON.stringify({ path: DBX_FILE }) } });
    if (r.status === 409 && /not_found/.test(await r.clone().text())) return null;
    if (!r.ok) throw new Error('Dropbox (Lesen): HTTP ' + r.status + ' ' + (await r.text()).slice(0, 300));
    return r.json();
  },
  async put(text) {
    const r = await fetch('https://content.dropboxapi.com/2/files/upload', { method: 'POST', headers: { Authorization: 'Bearer ' + await dbxAccess(), 'Content-Type': 'application/octet-stream', 'Dropbox-API-Arg': JSON.stringify({ path: DBX_FILE, mode: 'overwrite', mute: true }) }, body: text });
    if (!r.ok) throw new Error('Dropbox (Schreiben): HTTP ' + r.status + ' ' + (await r.text()).slice(0, 300));
  }
};
const ncRemote = {
  active: () => !!cfg().url,
  headers() { const c = cfg(); return { Authorization: 'Basic ' + btoa(unescape(encodeURIComponent(c.user + ':' + c.pass))) }; },
  async get() {
    const r = await fetch(cfg().url, { headers: this.headers(), cache: 'no-store' });
    if (r.status === 404) return null;
    if (!r.ok) throw new Error('Nextcloud: HTTP ' + r.status);
    return r.json();
  },
  async put(text) {
    const r = await fetch(cfg().url, { method: 'PUT', headers: { ...this.headers(), 'Content-Type': 'application/json' }, body: text });
    if (!r.ok) throw new Error('Nextcloud: HTTP ' + r.status);
  }
};
function renderDbx() {
  const d = dbx(); $('dbxKey').value = d.key || '';
  $('dbxStatus').textContent = d.refresh ? 'Verbunden ✓' : 'Nicht verbunden';
  $('dbxRedirect').textContent = redirectUri();
  $('dbxConnect').hidden = !!d.refresh; $('dbxSync').hidden = $('dbxDisconnect').hidden = !d.refresh;
}
$('dbxConnect').onclick = dbxConnect;
$('dbxSync').onclick = () => sync(true);
$('dbxDisconnect').onclick = () => { if (confirm('Dropbox-Verbindung trennen? Lokale Daten bleiben erhalten.')) { localStorage.removeItem(DBX); renderDbx(); setState(''); } };

// Reihenfolge-unabhängiger Schnappschuss: nur schreiben/neu zeichnen, wenn sich der Inhalt wirklich unterscheidet
const idSort = l => [...(l || [])].sort((a, b) => (a.id < b.id ? -1 : 1));
const canon = o => JSON.stringify(o, (k, v) => (v && typeof v === 'object' && !Array.isArray(v) ? Object.fromEntries(Object.entries(v).sort(([a], [b]) => (a < b ? -1 : 1))) : v));
const snap = d => canon({ v: idSort(d.vehicles), p: idSort(d.purposes), e: idSort(d.entries) });

let syncing = false, again = false;
async function sync(manual) {
  const remotes = [dbxRemote, ncRemote].filter(r => r.active());
  if (!remotes.length) { if (manual) alert('Bitte zuerst Dropbox verbinden.'); return; }
  if (syncing) { again = true; return; }
  syncing = true; setState('Sync …');
  try {
    let changed = false;
    for (const r of remotes) {
      const data = await r.get(), before = snap(db);
      if (data) merge(data);
      if (snap(db) !== before) changed = true;
      if (!data || snap(db) !== snap(data)) await r.put(JSON.stringify(db));
    }
    if (changed) renderAll();
    setState('Sync ✓ ' + new Date().toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' }));
  } catch (e) {
    setState('Sync fehlgeschlagen');
    if (manual) alert('Sync fehlgeschlagen: ' + e.message);
  } finally { syncing = false; if (again) { again = false; sync(false); } }
}
const autoSync = () => { if (navigator.onLine && [dbxRemote, ncRemote].some(r => r.active())) sync(false); };

// ---- Export / Import ----
function download(name, text, type) {
  const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([text], { type })); a.download = name; a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}
$('expJson').onclick = () => download('Fahrtenbuch.json', JSON.stringify(db, null, 1), 'application/json');
$('expCsv').onclick = () => {
  const q = s => '"' + String(s).replace(/"/g, '""') + '"';
  const lines = ['Datum;Fahrzeug;Kilometer;Zweck', ...live().sort((a, b) => a.date.localeCompare(b.date)).map(e => [e.date, q(vName(e.vehicle)), String(e.km).replace('.', ','), q(e.purpose)].join(';'))];
  download('Fahrtenbuch.csv', '﻿' + lines.join('\r\n'), 'text/csv');
};
$('impJson').onchange = async ev => {
  try { merge(JSON.parse(await ev.target.files[0].text())); renderAll(); alert('Import abgeschlossen.'); }
  catch (e) { alert('Import fehlgeschlagen: ' + e.message); }
  ev.target.value = '';
};

// ---- Start ----
document.querySelectorAll('nav button').forEach(b => b.onclick = () => {
  document.querySelectorAll('nav button, .tab').forEach(x => x.classList.remove('active'));
  b.classList.add('active'); $(b.dataset.tab).classList.add('active');
  if (b.dataset.tab === 'tab-stats') renderStats();
});
function renderAll() { fillVehicleSelects(editId ? $('vehicle').value : '');fillPurposeSelect(editId ? $('purpose').value : ''); renderList(); renderStats(); renderVehicleNames(); renderPurposeNames(); }
renderAll(); loadCfg(); renderDbx(); resetForm();
dbxFinishLogin().then(autoSync);
if (navigator.storage && navigator.storage.persist) navigator.storage.persist();
if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js');
document.addEventListener('visibilitychange', () => { if (!document.hidden) autoSync(); });
window.addEventListener('online', autoSync);
setInterval(() => { if (!document.hidden) autoSync(); }, 60000);   // Änderungen anderer Geräte übernehmen, solange die App offen ist


