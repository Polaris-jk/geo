// Stations — the notebook index for the current project, plus export to QGIS.

import * as store from '../store.js';
import * as exporter from '../export.js';
import { icon, strikeDipSymbol } from '../icons.js';
import { mainHeader, toast, openOverlay } from '../ui.js';
import { esc, fmtClock, fmtDay, fmtSize } from '../util.js';
import { fmtPlane, hasMeasurement } from '../geomath.js';
import { lithInfo, lithName } from '../vocab.js';

const plural = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`;

function row(st) {
  const m = (st.measurements || []).find((x) => hasMeasurement(x) && x.strike != null);
  const lith = lithName(st);
  const th = lithInfo(st.lithology)?.th;
  const t = st.location?.time || st.createdAt;
  const nS = (st.samples || []).length;
  const nP = (st.photoIds || []).length;
  return `<li><a class="st-row" href="#/station/${st.id}">
    <span class="st-num">${String(st.number).padStart(3, '0')}</span>
    <span class="st-body">
      <span class="st-lith">${lith ? esc(lith) : '<span class="muted">ยังไม่ระบุชนิดหิน</span>'}${th ? `<i>${esc(th)}</i>` : ''}</span>
      <span class="st-meta">
        ${m ? `<span class="st-plane">${strikeDipSymbol(m.strike)}${fmtPlane(m) || ''}</span>` : ''}
        ${nS ? `<span title="${plural(nS, 'sample')}">${icon('sample')}${nS}</span>` : ''}
        ${nP ? `<span title="${plural(nP, 'photo')}">${icon('photo')}${nP}</span>` : ''}
        ${!st.location ? '<span class="warn">ไม่มีพิกัด</span>' : ''}
      </span>
    </span>
    <span class="st-side">
      <span>${fmtClock(t)}</span>
      <small>${fmtDay(t, false)}</small>
      ${st.status === 'draft' ? '<em class="draft">Draft</em>' : ''}
    </span>
  </a></li>`;
}

function exportSheet(list) {
  const project = store.getProject();
  const { el, close } = openOverlay(`<div class="sheet" role="dialog" aria-label="Export">
      <div class="sheet-grip"></div>
      <h3>Export</h3>
      <p class="sheet-sub">${esc(project.name)}, ${plural(list.length, 'station')}</p>
      <div class="x-list">
        <button type="button" class="x-item main" data-x="zip"><b>Project ZIP</b><span>ทุกอย่างในไฟล์เดียว: GeoJSON, CSV, ตัวอย่างหิน, รูปภาพ และไฟล์สำรองทั้งโปรเจกต์</span></button>
        <button type="button" class="x-item" data-x="geojson"><b>Stations GeoJSON</b><span>ลากไฟล์เข้า QGIS หรือ ArcGIS ได้ทันที</span></button>
        <button type="button" class="x-item" data-x="csv"><b>Stations CSV</b><span>เปิดใน Excel หรือ Google Sheets ภาษาไทยแสดงถูกต้อง</span></button>
        <button type="button" class="x-item" data-x="struct"><b>Structures GeoJSON</b><span>หนึ่งจุดต่อหนึ่งการวัด สำหรับทำสัญลักษณ์ strike/dip ใน QGIS</span></button>
      </div>
      <div class="x-ready hidden" id="xReady"></div>
      <button type="button" class="btn block" data-close>ปิด</button>
    </div>`, {
    onClick: async (e) => {
      const item = e.target.closest('[data-x]');
      if (!item) return;
      const ready = el.querySelector('#xReady');
      el.querySelectorAll('[data-x]').forEach((b) => { b.disabled = true; });
      ready.classList.remove('hidden');
      ready.innerHTML = '<p class="x-busy"><i class="spinner"></i><span>กำลังเตรียมไฟล์</span></p>';
      try {
        const file = await exporter.build(item.dataset.x, (done, total) => {
          const s = ready.querySelector('.x-busy span');
          if (s) s.textContent = `กำลังรวมรูป ${done}/${total}`;
        });
        // A fresh tap is needed to open the share sheet, so offer a button once the file is ready.
        ready.innerHTML = `<div class="x-file">
            ${icon('file')}
            <div><b>${esc(file.name)}</b><span>${fmtSize(file.size)}</span></div>
          </div>
          <button type="button" class="btn-primary block" id="xGo">${icon('share')}<span>บันทึกหรือแชร์ไฟล์</span></button>`;
        ready.querySelector('#xGo').onclick = async () => {
          const res = await exporter.deliver(file);
          if (res === 'downloaded') toast('ดาวน์โหลดไฟล์แล้ว');
          else if (res === 'shared') toast('ส่งไฟล์แล้ว');
          if (res !== 'cancelled') close();
        };
      } catch (err) {
        ready.innerHTML = `<p class="x-error">สร้างไฟล์ไม่สำเร็จ: ${esc(err.message)}</p>`;
      } finally {
        el.querySelectorAll('[data-x]').forEach((b) => { b.disabled = false; });
      }
    },
  });
}

export async function render(root, ctx) {
  mainHeader();
  root.innerHTML = '<div class="screen"><p class="loading"><i class="spinner"></i></p></div>';
  const list = await store.listStations();
  if (!ctx.alive()) return;
  const project = store.getProject();
  const samples = list.reduce((n, s) => n + (s.samples || []).length, 0);
  const photos = list.reduce((n, s) => n + (s.photoIds || []).length, 0);

  root.innerHTML = `<div class="screen list-screen">
    <header class="proj">
      <h1>${esc(project.name)}</h1>
      <p class="proj-stats">
        <span><b>${list.length}</b> Stations</span>
        <span><b>${samples}</b> Samples</span>
        <span><b>${photos}</b> Photos</span>
      </p>
    </header>
    ${list.length
      ? `<ul class="st-list">${list.map(row).join('')}</ul>`
      : `<div class="empty">
          <p>ยังไม่มี Station ในโปรเจกต์นี้<br>ไปที่หน้า GPS แล้วกด NEW STATION เมื่อเจอ outcrop แรก</p>
          <a class="btn" href="#/gps">${icon('gps')}ไปหน้า GPS</a>
        </div>`}
  </div>
  ${list.length ? `<div class="cta"><button type="button" class="btn-primary xl" id="btnExport">${icon('share')}<span>EXPORT TO QGIS</span></button></div>` : ''}`;

  root.querySelector('#btnExport')?.addEventListener('click', () => exportSheet(list));
}
