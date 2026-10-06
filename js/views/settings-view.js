// Settings — project details, coordinate options, display mode, storage health.

import * as store from '../store.js';
import { mainHeader, toast, applyTheme } from '../ui.js';
import { esc, debounce, fmtSize, parseNum, isStandalone, isIOS } from '../util.js';

const seg = (key, value, options) =>
  `<div class="seg" role="radiogroup" data-k="${key}">${options
    .map(([v, label]) => `<button type="button" role="radio" aria-checked="${String(v) === String(value)}" data-v="${v}" class="${String(v) === String(value) ? 'on' : ''}">${label}</button>`)
    .join('')}</div>`;

export async function render(root) {
  mainHeader();
  const s = store.getSettings();
  const p = store.getProject();
  const example = () => {
    const cur = store.getSettings();
    return `ตัวอย่าง: Station ${esc(cur.stationPrefix || 'ST')}-024, ตัวอย่างหิน ${esc(cur.samplePrefix || 'GEO')}-024-01`;
  };

  root.innerHTML = `<div class="screen page settings-screen">
    <section class="sec">
      <h2 class="sec-h">Project</h2>
      <label class="field"><span class="lbl">ชื่อโปรเจกต์</span><input type="text" data-k="projectName" value="${esc(p.name)}" autocomplete="off"></label>
      <label class="field"><span class="lbl">ผู้เก็บข้อมูล (Collector)</span><input type="text" data-k="collector" value="${esc(s.collector)}" placeholder="ชื่อ นามสกุล" autocomplete="name"></label>
      <div class="field-2">
        <label class="field"><span class="lbl">Station prefix</span><input type="text" class="mono" data-k="stationPrefix" value="${esc(s.stationPrefix)}" maxlength="6" autocomplete="off"></label>
        <label class="field"><span class="lbl">Sample prefix</span><input type="text" class="mono" data-k="samplePrefix" value="${esc(s.samplePrefix)}" maxlength="10" autocomplete="off"></label>
      </div>
      <p class="hint" id="idExample">${example()}</p>
      <p class="hint">prefix ใหม่ใช้กับ Station ที่สร้างหลังจากนี้</p>
    </section>

    <section class="sec">
      <h2 class="sec-h">Coordinates</h2>
      <div class="field"><span class="lbl">รูปแบบ Lat/Long</span>${seg('coordFormat', s.coordFormat, [['dd', 'Decimal'], ['dms', 'DMS']])}</div>
      <div class="field"><span class="lbl">UTM zone</span>${seg('utmZone', s.utmZone, [['auto', 'Auto'], ['47', '47'], ['48', '48']])}</div>
      <p class="hint">ประเทศไทยคร่อม UTM สองโซน: 47 อยู่ทางตะวันตกของลองจิจูด 102° และ 48 อยู่ทางตะวันออก ถ้าพื้นที่สำรวจคร่อมเส้นแบ่ง ให้ล็อกโซนเดียวทั้งโปรเจกต์</p>
      <label class="field"><span class="lbl">Magnetic declination (องศา, ตะวันออกเป็นบวก)</span><input type="text" inputmode="decimal" class="mono" data-k="declination" value="${esc(s.declination)}" autocomplete="off"></label>
      <p class="hint">ใส่ 0 เพื่อแสดงทิศเหนือแม่เหล็กเหมือนเข็มทิศ Brunton ที่ไม่ได้ตั้งค่า</p>
    </section>

    <section class="sec">
      <h2 class="sec-h">Display</h2>
      ${seg('theme', s.theme, [['dark', 'Dark ประหยัดแบต'], ['sun', 'Sun อ่านกลางแดด']])}
    </section>

    <section class="sec">
      <h2 class="sec-h">Storage</h2>
      <div id="storage"><p class="hint">กำลังตรวจสอบ</p></div>
    </section>

    <section class="sec about">
      <h2 class="sec-h">About</h2>
      <p>GEO ${store.APP_VERSION}, ต้นแบบเฟสแรก</p>
      <p class="hint">ข้อมูลทั้งหมดอยู่ในเครื่องนี้เท่านั้น ไม่มีการส่งขึ้น server ให้ Export เป็น Project ZIP เก็บไว้หลังออกภาคสนามทุกครั้ง</p>
    </section>
  </div>`;

  async function renderStorage() {
    const info = await store.storageInfo();
    const box = root.querySelector('#storage');
    if (!box) return;
    const used = info.usage != null ? fmtSize(info.usage) : '—';
    const installed = isStandalone();
    box.innerHTML = `
      <p class="kv"><span>พื้นที่ที่ GEO ใช้</span><b class="mono">${used}</b></p>
      <p class="kv"><span>ป้องกันการลบอัตโนมัติ</span><b>${info.persisted ? 'เปิดแล้ว' : 'ยังไม่เปิด'}</b></p>
      <p class="kv"><span>ติดตั้งเป็นแอป</span><b>${installed ? 'ใช่' : 'ยังไม่ได้ติดตั้ง'}</b></p>
      ${!info.persisted ? '<button type="button" class="btn sm" id="btnPersist">ขอให้เครื่องเก็บข้อมูลถาวร</button>' : ''}
      ${!installed && isIOS() ? '<p class="hint">บน iPhone ให้ติดตั้งผ่าน Share แล้วเลือก Add to Home Screen ข้อมูลจะปลอดภัยกว่าใช้ผ่าน Safari</p>' : ''}
      <p class="hint">ถ้าลบไอคอน GEO ออกจากหน้าจอโฮม ข้อมูลในแอปจะถูกลบด้วย ให้ Export ก่อนทุกครั้ง</p>`;
    box.querySelector('#btnPersist')?.addEventListener('click', async () => {
      const ok = await store.ensurePersistence();
      toast(ok ? 'เปิดการเก็บข้อมูลถาวรแล้ว' : 'เบราว์เซอร์ยังไม่อนุญาต ลองติดตั้งเป็นแอปก่อน', 3500);
      renderStorage();
    });
  }
  renderStorage();

  async function saveField(key, value) {
    if (key === 'projectName') {
      await store.renameProject(value);
      mainHeader();
    } else if (key === 'declination') {
      const v = parseNum(value);
      if (v === null || Number.isNaN(v) || v < -30 || v > 30) return;
      await store.updateSettings({ declination: v });
    } else if (key === 'stationPrefix' || key === 'samplePrefix') {
      const clean = value.trim().replace(/\s+/g, '');
      if (!clean) return;
      await store.updateSettings({ [key]: clean });
      const ex = root.querySelector('#idExample');
      if (ex) ex.innerHTML = example();
    } else {
      await store.updateSettings({ [key]: value });
    }
  }
  // One debounced saver per field, so typing in one field never drops a pending edit in another.
  const savers = new Map();
  const saveText = (key, value) => {
    if (!savers.has(key)) savers.set(key, debounce((v) => saveField(key, v), 400));
    savers.get(key)(value);
  };

  root.addEventListener('input', (e) => {
    const t = e.target;
    if (!t.dataset.k) return;
    if (t.dataset.k === 'declination') {
      const v = parseNum(t.value);
      t.classList.toggle('invalid', v !== null && (Number.isNaN(v) || v < -30 || v > 30));
    }
    saveText(t.dataset.k, t.value);
  });

  root.addEventListener('click', async (e) => {
    const b = e.target.closest('.seg button');
    if (!b) return;
    const group = b.closest('.seg');
    const key = group.dataset.k;
    group.querySelectorAll('button').forEach((x) => {
      const on = x === b;
      x.classList.toggle('on', on);
      x.setAttribute('aria-checked', String(on));
    });
    await store.updateSettings({ [key]: b.dataset.v });
    if (key === 'theme') { applyTheme(b.dataset.v); mainHeader(); }
  });

  return () => savers.forEach((d) => d.flush());
}
