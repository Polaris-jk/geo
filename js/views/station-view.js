// Geological station — one page of the field notebook, tied to one coordinate.
// Every change is saved to the phone straight away; SAVE STATION marks the page complete.

import * as store from '../store.js';
import * as gps from '../gps.js';
import { toUTM } from '../utm.js';
import { LITHOLOGY, WEATHERING, STRUCTURE_TYPES, COLORS } from '../vocab.js';
import { icon, strikeDipSymbol } from '../icons.js';
import { setHeader, toast, openOverlay } from '../ui.js';
import { esc, pad, debounce, parseNum, trim1, fmtClock, fmtDay, uuid } from '../util.js';
import { strikeToDipDir, dipDirToStrike, fmtLat, fmtLon, accClass, fmtAcc } from '../geomath.js';

const opt = (value, label, selected) => `<option value="${esc(value)}"${value === selected ? ' selected' : ''}>${esc(label)}</option>`;

function lithOptions(sel) {
  return opt('', 'เลือกชนิดหิน', sel) +
    LITHOLOGY.map((g) => `<optgroup label="${esc(g.group)}">${g.items.map(([en, th]) => opt(en, `${en} (${th})`, sel)).join('')}</optgroup>`).join('') +
    opt('Other', 'Other (ระบุเอง)', sel);
}
const weatheringOptions = (sel) => opt('', 'เลือกระดับการผุ', sel) + WEATHERING.map(([c, en, th]) => opt(c, `${c} ${en} (${th})`, sel)).join('');
const structOptions = (sel) => STRUCTURE_TYPES.map(([en, th]) => opt(en, `${en} (${th})`, sel)).join('');

const GPS_ERR = {
  denied: 'ไม่ได้รับสิทธิ์ใช้ตำแหน่ง เปิดสิทธิ์ใน Settings ของเครื่องแล้วลองใหม่',
  timeout: 'ยังไม่ได้สัญญาณ GPS ลองออกไปที่โล่งแล้วกดอีกครั้ง',
  insecure: 'ต้องเปิด GEO ผ่าน https จึงจะใช้ GPS ได้',
  unsupported: 'เครื่องนี้ไม่มี GPS',
};

export async function render(root, ctx, id) {
  const backHTML = `<button type="button" class="icon-btn" id="hdrBack" aria-label="กลับ">${icon('back')}</button>`;
  setHeader({ left: backHTML });
  const st = await store.getStation(id);
  if (!ctx.alive()) return;
  const fallback = ctx.prev && !ctx.prev.startsWith('#/station') ? ctx.prev : '#/gps';

  if (!st) {
    root.innerHTML = `<div class="empty"><p>ไม่พบ Station นี้ อาจถูกลบไปแล้ว</p><a class="btn" href="#/stations">ดูรายการ Station</a></div>`;
    document.getElementById('hdrBack').onclick = () => { location.hash = fallback; };
    return;
  }

  st.measurements ||= [];
  st.samples ||= [];
  st.photoIds ||= [];
  let discarded = false;
  let closed = false;
  const abort = new AbortController();
  let thumbUrls = [];

  setHeader({
    left: backHTML,
    title: `<div class="hdr-st"><span>Station</span><b>${String(st.number).padStart(3, '0')}</b></div>`,
    right: '<span class="save-state" id="saveState" aria-live="polite"></span>',
  });

  const saveState = document.getElementById('saveState');
  function setSaveState(s) {
    saveState.className = `save-state ${s}`;
    saveState.innerHTML = s === 'saving' ? 'กำลังบันทึก' : s === 'error' ? 'บันทึกไม่ได้' : `${icon('check')}บันทึกแล้ว`;
  }
  setSaveState('saved');

  async function saveNow() {
    if (discarded) return;
    try {
      await store.saveStation(st);
      if (!closed) setSaveState('saved');
    } catch (err) {
      setSaveState('error');
      toast(`บันทึกไม่สำเร็จ: ${err.message}`, 4000);
    }
  }
  const autosave = debounce(saveNow, 350);
  const touch = () => {
    store.freshIds.delete(st.id);
    setSaveState('saving');
    autosave();
  };

  root.innerHTML = `
  <div class="screen page station-screen">
    <section class="loc-panel" id="locPanel"></section>

    <section class="sec">
      <h2 class="sec-h">Rock / outcrop</h2>
      <label class="field"><span class="lbl">Lithology</span>
        <span class="select"><select data-f="lithology">${lithOptions(st.lithology)}</select></span></label>
      <label class="field${st.lithology === 'Other' ? '' : ' hidden'}" id="lithOther"><span class="lbl">ชนิดหินที่พบ</span>
        <input type="text" data-f="lithologyOther" value="${esc(st.lithologyOther)}" autocomplete="off"></label>
      <label class="field"><span class="lbl">Weathering</span>
        <span class="select"><select data-f="weathering">${weatheringOptions(st.weathering)}</select></span></label>
      <label class="field"><span class="lbl">Color</span>
        <input type="text" data-f="color" list="colorList" value="${esc(st.color)}" autocomplete="off" placeholder="เช่น Reddish brown"></label>
      <datalist id="colorList">${COLORS.map((c) => `<option value="${esc(c)}">`).join('')}</datalist>
    </section>

    <section class="sec">
      <h2 class="sec-h">Structure <span class="sec-note">right-hand rule</span></h2>
      <div id="measList"></div>
      <button type="button" class="btn add" data-act="add-meas">${icon('plus')}Add measurement</button>
    </section>

    <section class="sec">
      <h2 class="sec-h">Samples</h2>
      <div id="sampleList"></div>
      <button type="button" class="btn add" data-act="add-sample">${icon('plus')}Add sample</button>
    </section>

    <section class="sec">
      <h2 class="sec-h">Photos <span class="sec-note" id="photoCount"></span></h2>
      <div class="photo-grid" id="photoGrid"></div>
      <div class="btn-row">
        <label class="btn">${icon('camera')}ถ่ายรูป<input class="vh" type="file" accept="image/*" capture="environment" data-photo></label>
        <label class="btn">${icon('image')}เลือกจากคลัง<input class="vh" type="file" accept="image/*" multiple data-photo></label>
      </div>
    </section>

    <section class="sec">
      <h2 class="sec-h">Notes</h2>
      <textarea data-f="notes" rows="4" placeholder="สิ่งที่สังเกตเห็น เช่น ความหนาชั้น ขนาดเม็ดตะกอน ซากดึกดำบรรพ์">${esc(st.notes)}</textarea>
    </section>

    <button type="button" class="btn-text danger" data-act="delete">${icon('trash')}ลบ Station นี้</button>
  </div>
  <div class="cta"><button type="button" class="btn-primary xl" data-act="save">${icon('check')}<span>SAVE STATION</span></button></div>`;

  const q = (sel) => root.querySelector(sel);

  // ---------- location ----------
  let locBusy = null; // null | { label, pct }
  function renderLocation() {
    const panel = q('#locPanel');
    const L = st.location;
    const busy = !!locBusy;
    const buttons = `<div class="btn-row">
        <button type="button" class="btn" data-act="recap"${busy ? ' disabled' : ''}>${icon('refresh')}จับพิกัดใหม่</button>
        <button type="button" class="btn" data-act="avg"${busy ? ' disabled' : ''}>${icon('target')}เฉลี่ย 10 วินาที</button>
      </div>
      ${busy ? `<div class="progress" aria-label="${esc(locBusy.label)}"><i style="width:${locBusy.pct || 0}%"></i></div><p class="loc-note">${esc(locBusy.label)}</p>` : ''}`;
    if (!L) {
      panel.innerHTML = `<h2 class="sec-h">Location</h2>
        <p class="loc-wait"><i class="dot pulse q-fair"></i>กำลังรอสัญญาณ GPS เพื่อปักพิกัด Station นี้</p>${buttons}`;
      return;
    }
    const fmt = store.getSettings().coordFormat;
    const u = toUTM(L.lat, L.lon, store.zoneLock());
    const qc = accClass(L.acc);
    panel.innerHTML = `
      <h2 class="sec-h">Location <span class="fix-tag q-${qc}">${L.method === 'average' ? `เฉลี่ย ${L.n} ค่า` : 'ค่าเดียว'}</span></h2>
      <dl class="loc-grid">
        <div><dt>LAT</dt><dd>${fmtLat(L.lat, fmt)}</dd></div>
        <div><dt>LONG</dt><dd>${fmtLon(L.lon, fmt)}</dd></div>
        <div class="wide"><dt>UTM ${u ? `${u.zone}${u.band}` : ''}</dt><dd>${u ? `${Math.round(u.easting)} E&ensp;${Math.round(u.northing)} N` : '—'}</dd></div>
        <div><dt>ELEV</dt><dd>${L.alt != null ? `${Math.round(L.alt)}<span class="u">m</span>` : '—'}</dd></div>
        <div><dt>ACC</dt><dd class="q-${qc}">±${fmtAcc(L.acc)}<span class="u">m</span></dd></div>
      </dl>
      <p class="loc-note">ปักพิกัดเมื่อ ${fmtClock(L.time, true)}, ${fmtDay(L.time)}${L.method === 'average' && L.spread != null ? `, กระจาย ${L.spread.toFixed(1)} m` : ''}</p>
      ${buttons}`;
  }

  async function applyFix(fix, message) {
    if (discarded || closed) return;
    st.location = store.makeLocation(fix);
    store.freshIds.delete(st.id);
    autosave.cancel();
    await saveNow();
    if (message) toast(message);
  }

  async function recapture(silent = false) {
    locBusy = { label: 'กำลังรับพิกัดจาก GPS', pct: 0 };
    renderLocation();
    try {
      const fix = await gps.fresh(silent ? 60000 : 20000, abort.signal);
      locBusy = null;
      await applyFix(fix, silent ? null : `อัปเดตพิกัดแล้ว ±${fmtAcc(fix.acc)} m`);
    } catch (err) {
      locBusy = null;
      if (err.name !== 'AbortError' && !silent) toast(GPS_ERR[err.message] || `GPS ผิดพลาด: ${err.message}`, 4000);
    }
    if (!closed) renderLocation();
  }

  async function averageFix() {
    locBusy = { label: 'ยืนนิ่ง ๆ กำลังเฉลี่ยพิกัด', pct: 0 };
    renderLocation();
    try {
      const fix = await gps.average(10000, (p) => {
        if (closed) return;
        locBusy = { label: `ยืนนิ่ง ๆ กำลังเฉลี่ยพิกัด (${p.n} ค่า)`, pct: Math.min(100, (p.elapsed / p.total) * 100) };
        const bar = q('.progress i');
        const note = q('#locPanel .loc-note:last-child');
        if (bar) bar.style.width = `${locBusy.pct}%`;
        if (note) note.textContent = locBusy.label;
      }, abort.signal);
      locBusy = null;
      await applyFix(fix, `เฉลี่ยจาก ${fix.n} ค่า ±${fmtAcc(fix.acc)} m`);
    } catch (err) {
      locBusy = null;
      if (err.name !== 'AbortError') toast(GPS_ERR[err.message] || `GPS ผิดพลาด: ${err.message}`, 4000);
    }
    if (!closed) renderLocation();
  }

  // ---------- structure ----------
  function measHTML(m, i) {
    const sym = m.strike != null ? strikeDipSymbol(m.strike, 'sdsym live') : strikeDipSymbol(0, 'sdsym live idle');
    return `<div class="meas" data-i="${i}">
      <div class="meas-top">
        ${sym}
        <span class="select"><select data-m="type" aria-label="ชนิดโครงสร้าง">${structOptions(m.type)}</select></span>
        <button type="button" class="icon-btn" data-act="rm-meas" aria-label="ลบการวัดนี้">${icon('close')}</button>
      </div>
      <div class="meas-grid">
        <label><span>Strike</span><input type="text" inputmode="numeric" data-m="strike" value="${trim1(m.strike)}" placeholder="000" autocomplete="off"></label>
        <label><span>Dip</span><input type="text" inputmode="numeric" data-m="dip" value="${trim1(m.dip)}" placeholder="00" autocomplete="off"></label>
        <label><span>Dip dir</span><input type="text" inputmode="numeric" data-m="dipdir" value="${trim1(m.dipdir)}" placeholder="000" autocomplete="off"></label>
      </div>
    </div>`;
  }
  function renderMeasurements() {
    q('#measList').innerHTML = st.measurements.length
      ? st.measurements.map(measHTML).join('')
      : '<p class="sec-empty">ยังไม่มีการวัด</p>';
  }
  function updateSymbol(box, m) {
    const svg = box.querySelector('.sdsym');
    svg.classList.toggle('idle', m.strike == null);
    svg.style.transform = `rotate(${m.strike ?? 0}deg)`;
  }

  // ---------- samples ----------
  function renderSamples() {
    q('#sampleList').innerHTML = st.samples.length
      ? st.samples.map((s, i) => `<div class="sample" data-i="${i}">
          <input type="text" class="mono" data-s="id" value="${esc(s.id)}" aria-label="รหัสตัวอย่าง" autocomplete="off">
          <input type="text" data-s="note" value="${esc(s.note)}" placeholder="หมายเหตุ" autocomplete="off">
          <button type="button" class="icon-btn" data-act="rm-sample" aria-label="ลบตัวอย่างนี้">${icon('close')}</button>
        </div>`).join('')
      : '<p class="sec-empty">ยังไม่มีตัวอย่าง</p>';
  }
  function nextSampleId() {
    st.sampleSeq = Math.max(st.sampleSeq || 0, st.samples.length) + 1;
    const prefix = store.getSettings().samplePrefix || 'GEO';
    return `${prefix}-${String(st.number).padStart(3, '0')}-${pad(st.sampleSeq)}`;
  }

  // ---------- photos ----------
  let photoBusy = 0;
  async function renderPhotos() {
    const metas = await store.listPhotos(st);
    if (closed) return;
    thumbUrls.forEach((u) => URL.revokeObjectURL(u));
    thumbUrls = [];
    const tiles = metas.map((p, i) => {
      const url = URL.createObjectURL(new Blob([p.thumb], { type: 'image/jpeg' }));
      thumbUrls.push(url);
      return `<button type="button" class="ph" data-photo-id="${p.id}" aria-label="ดูรูปที่ ${i + 1}"><img src="${url}" alt=""><span>${pad(i + 1)}</span></button>`;
    });
    for (let k = 0; k < photoBusy; k++) tiles.push('<div class="ph busy"><i class="spinner"></i></div>');
    q('#photoGrid').innerHTML = tiles.join('');
    q('#photoCount').textContent = metas.length ? `${metas.length} รูป` : '';
  }

  async function addPhotos(input) {
    const files = [...(input.files || [])];
    input.value = '';
    if (!files.length) return;
    photoBusy = files.length;
    await renderPhotos();
    for (const f of files) {
      try {
        await store.addPhoto(st, f);
        store.freshIds.delete(st.id);
      } catch (err) {
        toast(`เพิ่มรูปไม่สำเร็จ: ${err.message}`, 4000);
      }
      photoBusy -= 1;
      await renderPhotos();
    }
    setSaveState('saved');
  }

  async function openPhoto(photoId) {
    const metas = await store.listPhotos(st);
    const meta = metas.find((p) => p.id === photoId);
    const data = await store.getPhotoData(photoId);
    if (!meta || !data) return toast('ไม่พบไฟล์รูปนี้');
    const url = URL.createObjectURL(new Blob([data], { type: meta.type }));
    const n = metas.indexOf(meta) + 1;
    openOverlay(`<div class="lightbox" role="dialog" aria-label="รูปที่ ${n}">
        <img src="${url}" alt="รูปที่ ${n} ของ ${esc(st.code)}">
        <div class="lb-bar">
          <span class="lb-title">${esc(st.code)} รูปที่ ${n}</span>
          <button type="button" class="btn sm danger" data-del>${icon('trash')}ลบรูป</button>
          <button type="button" class="btn sm" data-close>ปิด</button>
        </div>
      </div>`, {
      cls: 'full',
      onClose: () => URL.revokeObjectURL(url),
      onClick: async (e, close) => {
        if (!e.target.closest('[data-del]')) return;
        if (!confirm('ลบรูปนี้? ย้อนกลับไม่ได้')) return;
        await store.deletePhoto(st, photoId);
        close();
        toast('ลบรูปแล้ว');
        renderPhotos();
      },
    });
  }

  // ---------- events ----------
  function onEdit(e) {
    const t = e.target;
    const isSelect = t.tagName === 'SELECT';
    if ((e.type === 'change') !== isSelect) return; // text → input events, selects → change events

    if (t.dataset.f) {
      st[t.dataset.f] = t.value;
      if (t.dataset.f === 'lithology') q('#lithOther').classList.toggle('hidden', t.value !== 'Other');
      touch();
      return;
    }
    if (t.dataset.m) {
      const box = t.closest('.meas');
      const m = st.measurements[Number(box.dataset.i)];
      const key = t.dataset.m;
      if (key === 'type') { m.type = t.value; touch(); return; }
      const v = parseNum(t.value);
      const ok = v === null || (!Number.isNaN(v) && v >= 0 && v <= (key === 'dip' ? 90 : 360));
      t.classList.toggle('invalid', !ok);
      t.setAttribute('aria-invalid', ok ? 'false' : 'true');
      if (!ok) return;
      if (key === 'dip') {
        m.dip = v;
      } else if (key === 'strike') {
        m.strike = v === null ? null : v % 360;
        if (v !== null) {
          m.dipdir = strikeToDipDir(m.strike);
          const dd = box.querySelector('[data-m=dipdir]');
          dd.value = trim1(m.dipdir);
          dd.classList.remove('invalid');
        }
        updateSymbol(box, m);
      } else if (key === 'dipdir') {
        m.dipdir = v === null ? null : v % 360;
        if (v !== null) {
          m.strike = dipDirToStrike(m.dipdir);
          const sk = box.querySelector('[data-m=strike]');
          sk.value = trim1(m.strike);
          sk.classList.remove('invalid');
        }
        updateSymbol(box, m);
      }
      touch();
      return;
    }
    if (t.dataset.s) {
      const row = t.closest('.sample');
      st.samples[Number(row.dataset.i)][t.dataset.s] = t.value;
      touch();
    }
  }
  root.addEventListener('input', onEdit);
  root.addEventListener('change', (e) => {
    if (e.target.matches('[data-photo]')) return addPhotos(e.target);
    onEdit(e);
  });

  root.addEventListener('click', async (e) => {
    const ph = e.target.closest('[data-photo-id]');
    if (ph) return openPhoto(ph.dataset.photoId);
    const btn = e.target.closest('[data-act]');
    if (!btn || btn.disabled) return;
    const act = btn.dataset.act;

    if (act === 'add-meas') {
      const prev = st.measurements[st.measurements.length - 1];
      st.measurements.push({ id: uuid(), type: prev?.type || 'Bedding', strike: null, dip: null, dipdir: null });
      renderMeasurements();
      root.querySelector(`.meas[data-i="${st.measurements.length - 1}"] [data-m=strike]`)?.focus();
      touch();
    } else if (act === 'rm-meas') {
      const i = Number(btn.closest('.meas').dataset.i);
      const m = st.measurements[i];
      if ((m.strike != null || m.dip != null) && !confirm('ลบการวัดนี้?')) return;
      st.measurements.splice(i, 1);
      renderMeasurements();
      touch();
    } else if (act === 'add-sample') {
      st.samples.push({ id: nextSampleId(), note: '' });
      renderSamples();
      root.querySelector(`.sample[data-i="${st.samples.length - 1}"] [data-s=note]`)?.focus();
      touch();
    } else if (act === 'rm-sample') {
      const i = Number(btn.closest('.sample').dataset.i);
      if (!confirm(`ลบตัวอย่าง ${st.samples[i].id}?`)) return;
      st.samples.splice(i, 1);
      renderSamples();
      touch();
    } else if (act === 'recap') {
      recapture(false);
    } else if (act === 'avg') {
      averageFix();
    } else if (act === 'save') {
      btn.disabled = true;
      st.status = 'saved';
      store.freshIds.delete(st.id);
      autosave.cancel();
      await saveNow();
      store.ensurePersistence();
      toast(`บันทึก ${st.code} แล้ว`);
      location.hash = '#/gps';
    } else if (act === 'delete') {
      const n = st.photoIds.length;
      if (!confirm(`ลบ ${st.code}${n ? ` และรูป ${n} รูป` : ''}? ย้อนกลับไม่ได้`)) return;
      discarded = true;
      autosave.cancel();
      abort.abort();
      await store.deleteStation(st);
      toast(`ลบ ${st.code} แล้ว`);
      location.hash = '#/stations';
    }
  });

  document.getElementById('hdrBack').onclick = async () => {
    autosave.flush();
    if (st.status === 'draft' && store.freshIds.has(st.id) && store.isEmptyStation(st)) {
      discarded = true;
      abort.abort();
      await store.deleteStation(st);
      store.freshIds.delete(st.id);
      toast('ยกเลิก Station ที่ยังไม่ได้กรอกข้อมูล');
    }
    location.hash = fallback;
  };

  const onHide = () => autosave.flush();
  document.addEventListener('visibilitychange', onHide);
  window.addEventListener('pagehide', onHide);

  renderLocation();
  renderMeasurements();
  renderSamples();
  renderPhotos();
  if (!st.location) recapture(true);

  return () => {
    closed = true;
    abort.abort();
    autosave.flush();
    document.removeEventListener('visibilitychange', onHide);
    window.removeEventListener('pagehide', onHide);
    thumbUrls.forEach((u) => URL.revokeObjectURL(u));
  };
}
