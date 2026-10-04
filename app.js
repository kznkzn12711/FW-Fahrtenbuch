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
  db.vehicles = mergeList(db.vehicles, remote.vehicles).sort((a, b) => a.id.localeCompare(b.id));
  db.purposes = mergeList(db.purposes, remote.purposes);
  db.entries = mergeList(db.entries, remote.entries);
  save();
}

// ---- UI: Erfassen ----
function fillVehicleSelects() {
  const opts = db.vehicles.map(v => `<option value="${v.id}">${esc(v.name)}</option>`).join('');
  const keep = [$('vehicle').value, $('filterVehicle').value, $('statVehicle').value];
  $('vehicle').innerHTML = opts;
  $('filterVehicle').innerHTML = '<option value="">Alle</option>' + opts;
  $('statVehicle').innerHTML = '<option value="">Alle</option>' + opts;
  [$('vehicle'), $('filterVehicle'), $('statVehicle')].forEach((s, i) => { if (keep[i]) s.value = keep[i]; });
  if (!$('vehicle').value) $('vehicle').value = localStorage.getItem('fahrtenbuch.lastVehicle') || db.vehicles[0].id;
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
    editId = e.id; $('vehicle').value = e.vehicle; $('date').value = e.date; $('km').value = e.km; fillPurposeSelect(e.purpose);
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
  bars(sum(rows, e => e.purpose), $('statPurpose'));
  bars(sum(inYear, e => vName(e.vehicle)), $('statVeh'));
}
$('statVehicle').onchange = $('statYear').onchange = renderStats;

// ---- Einstellungen ----
function renderVehicleNames() {
  $('vehicleNames').innerHTML = db.vehicles.map(v => `<label>${v.id.slice(1)}. Fahrzeug<input data-vid="${v.id}" value="${esc(v.name)}"></label>`).join('');
}
$('vehicleNames').addEventListener('change', ev => {
  const v = db.vehicles.find(x => x.id === ev.target.dataset.vid);
  v.name = ev.target.value.trim() || v.name; v.updated = Date.now(); save(); renderAll(); autoSync();
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

// ---- Nextcloud-Sync (WebDAV) ----
const cfg = () => { try { return JSON.parse(localStorage.getItem(CFG)) || {}; } catch (e) { return {}; } };
function loadCfg() { const c = cfg(); $('ncUrl').value = c.url || ''; $('ncUser').value = c.user || ''; $('ncPass').value = c.pass || ''; }
$('ncSave').onclick = () => { localStorage.setItem(CFG, JSON.stringify({ url: $('ncUrl').value.trim(), user: $('ncUser').value.trim(), pass: $('ncPass').value })); setState('Gespeichert'); };
$('ncSync').onclick = () => { $('ncSave').click(); sync(true); };
const setState = t => { $('syncState').textContent = t; };
let syncing = false;
async function sync(manual) {
  const c = cfg(); if (!c.url) { if (manual) alert('Bitte zuerst die Nextcloud-URL eintragen.'); return; }
  if (syncing) return; syncing = true; setState('Sync …');
  const headers = { Authorization: 'Basic ' + btoa(unescape(encodeURIComponent(c.user + ':' + c.pass))) };
  try {
    const r = await fetch(c.url, { headers, cache: 'no-store' });
    if (r.ok) merge(await r.json()); else if (r.status !== 404) throw new Error('HTTP ' + r.status);
    const p = await fetch(c.url, { method: 'PUT', headers: { ...headers, 'Content-Type': 'application/json' }, body: JSON.stringify(db) });
    if (!p.ok) throw new Error('HTTP ' + p.status);
    renderAll(); setState('Sync ✓ ' + new Date().toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' }));
  } catch (e) {
    setState('Sync fehlgeschlagen');
    if (manual) alert('Sync fehlgeschlagen: ' + e.message + '\n\nBei „Failed to fetch“ blockiert meist CORS: die App muss von derselben Domain wie die Nextcloud ausgeliefert werden oder die Nextcloud-Domain muss die App-Herkunft per CORS erlauben.');
  } finally { syncing = false; }
}
const autoSync = () => { if (cfg().url && navigator.onLine) sync(false); };

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
function renderAll() { fillVehicleSelects(); fillPurposeSelect(editId ? $('purpose').value : ''); renderList(); renderStats(); renderVehicleNames(); renderPurposeNames(); }
renderAll(); loadCfg(); resetForm(); autoSync();
if (navigator.storage && navigator.storage.persist) navigator.storage.persist();
if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js');
document.addEventListener('visibilitychange', () => { if (!document.hidden) autoSync(); });
