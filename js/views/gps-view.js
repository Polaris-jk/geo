// FIELD GPS — the first screen: where am I, how good is the fix, which way am I facing.

import * as gps from '../gps.js';
import * as compass from '../compass.js';
import * as store from '../store.js';
import { toUTM } from '../utm.js';
import { cardinal, fmtLat, fmtLon, accClass, accBars, fmtAcc, norm360 } from '../geomath.js';
import { createMap } from '../map.js';
import { icon } from '../icons.js';
import { mainHeader, toast, canPromptInstall, promptInstall } from '../ui.js';
import { isIOS, isStandalone } from '../util.js';

function dialSVG() {
  let ticks = '';
  for (let d = 0; d < 360; d += 10) {
    const major = d % 30 === 0;
    const a = (d * Math.PI) / 180;
    const r1 = 46, r2 = major ? 37.5 : 41.5;
    ticks += `<line class="tick${major ? ' major' : ''}" x1="${(50 + r1 * Math.sin(a)).toFixed(2)}" y1="${(50 - r1 * Math.cos(a)).toFixed(2)}" x2="${(50 + r2 * Math.sin(a)).toFixed(2)}" y2="${(50 - r2 * Math.cos(a)).toFixed(2)}"/>`;
  }
  const letters = [['N', 0], ['E', 90], ['S', 180], ['W', 270]]
    .map(([t, d]) => {
      const a = (d * Math.PI) / 180;
      return `<text x="${(50 + 28 * Math.sin(a)).toFixed(1)}" y="${(50 - 28 * Math.cos(a)).toFixed(1)}" transform="rotate(${d} ${(50 + 28 * Math.sin(a)).toFixed(1)} ${(50 - 28 * Math.cos(a)).toFixed(1)})"${t === 'N' ? ' class="n"' : ''}>${t}</text>`;
    })
    .join('');
  return `<svg class="dial" viewBox="0 0 100 100" aria-hidden="true">
    <circle class="ring" cx="50" cy="50" r="48.5"/>
    <g id="dialCard">${ticks}${letters}</g>
    <path class="lubber" d="M50 0.5 55.5 11h-11z"/>
    <circle class="hub" cx="50" cy="50" r="2.6"/>
  </svg>`;
}

function bannerHTML() {
  const s = store.getSettings();
  if (s.bannerDismissed || isStandalone()) return '';
  const body = isIOS()
    ? `<p><b>ติดตั้ง GEO ลงหน้าจอโฮมก่อนออกภาคสนาม</b><br>แตะ ${icon('share', 'inline')} Share แล้วเลือก Add to Home Screen ถ้าใช้ผ่าน Safari ข้อมูลอาจถูกล้างเมื่อไม่ได้เปิดเกิน 7 วัน</p>`
    : `<p><b>ติดตั้ง GEO เป็นแอปบนเครื่อง</b><br>${canPromptInstall() ? 'ใช้งาน offline ได้เต็มที่และเปิดได้จากหน้าจอโฮม' : 'ใน Chrome แตะเมนู ⋮ แล้วเลือก Install app หรือ Add to Home screen'}</p>`;
  return `<div class="banner" id="banner">
    ${body}
    <div class="banner-actions">
      ${!isIOS() && canPromptInstall() ? '<button type="button" class="btn sm" data-install>ติดตั้ง</button>' : ''}
      <button type="button" class="icon-btn" data-dismiss aria-label="ปิดข้อความนี้">${icon('close')}</button>
    </div>
  </div>`;
}

const STATUS_TEXT = {
  searching: 'กำลังหาสัญญาณ GPS',
  paused: 'GPS หยุดชั่วคราว',
  denied: 'ไม่ได้รับสิทธิ์ใช้ตำแหน่ง',
  insecure: 'ต้องเปิดผ่าน https',
  unsupported: 'เครื่องนี้ไม่มี GPS',
  off: 'GPS ปิดอยู่',
};

export async function render(root) {
  mainHeader();
  root.innerHTML = `
  <div class="screen gps-screen">
    <div id="bannerSlot">${bannerHTML()}</div>
    <div class="minimap" id="mm" role="button" tabindex="0" aria-label="เปิดแผนที่">
      <div class="gps-chip" id="gpsChip"></div>
    </div>
    <div class="help hidden" id="gpsHelp"></div>
    <dl class="readout" id="readout">
      <div class="ro-row" data-copy="latlon"><dt>LAT</dt><dd id="vLat">—</dd></div>
      <div class="ro-row" data-copy="latlon"><dt>LONG</dt><dd id="vLon">—</dd></div>
      <div class="ro-row utm" data-copy="utm"><dt>UTM <b id="vZone"></b></dt><dd id="vUtm">—</dd></div>
      <div class="ro-row"><dt>ELEV</dt><dd id="vElev">—</dd></div>
      <div class="ro-row"><dt>ACC</dt><dd id="vAcc">—</dd></div>
    </dl>
    <div class="compass" id="cmp">
      ${dialSVG()}
      <div class="cmp-read">
        <div class="cmp-label">Bearing</div>
        <div class="cmp-val"><span id="vBrg">—</span><span class="cmp-card" id="vCard"></span></div>
        <div class="cmp-sub" id="vCmpSub"></div>
      </div>
      <button type="button" class="btn sm hidden" id="btnCmp">เปิดเข็มทิศ</button>
    </div>
  </div>
  <div class="cta"><button type="button" class="btn-primary xl" id="btnNew">${icon('pin')}<span>NEW STATION</span></button></div>`;

  const el = (id) => root.querySelector('#' + id);
  const readout = el('readout');
  const mapEl = el('mm');
  const mm = createMap(mapEl, { interactive: false });
  let lastCopy = { latlon: '', utm: '' };

  // Stations on the mini map
  store.listStations().then((list) => mm.setStations(list)).catch(() => {});

  // ----- GPS -----
  function renderFix(s) {
    const chip = el('gpsChip');
    const help = el('gpsHelp');
    const f = s.fix;
    const fmt = store.getSettings().coordFormat;
    const age = f ? Math.round((Date.now() - f.received) / 1000) : null;
    const live = !!f && s.status === 'ok' && age <= 10;

    if (live) {
      chip.innerHTML = `<i class="dot q-${accClass(f.acc)}"></i>GPS ±${fmtAcc(f.acc)} m`;
    } else if (f && s.status === 'ok') {
      chip.innerHTML = `<i class="dot"></i>ค่าล่าสุดเมื่อ ${age} วินาทีก่อน`;
    } else {
      const pulse = s.status === 'searching' ? ' pulse q-fair' : s.status === 'denied' || s.status === 'insecure' || s.status === 'unsupported' ? ' q-bad' : '';
      chip.innerHTML = `<i class="dot${pulse}"></i>${STATUS_TEXT[s.status] || 'GPS'}`;
    }

    if (s.status === 'denied') {
      help.classList.remove('hidden');
      help.innerHTML = `<p><b>เปิดสิทธิ์ตำแหน่งให้ GEO</b><br>
        iPhone: Settings → Privacy &amp; Security → Location Services → Safari Websites → While Using the App<br>
        Android: แตะไอคอนข้างช่องที่อยู่เว็บ → Permissions → Location → Allow</p>
        <button type="button" class="btn sm" id="btnRetry">${icon('refresh')}ลองอีกครั้ง</button>`;
      el('btnRetry').onclick = () => gps.retry();
    } else if (s.status === 'insecure') {
      help.classList.remove('hidden');
      help.innerHTML = '<p>เบราว์เซอร์อนุญาตให้ใช้ GPS เฉพาะหน้าเว็บที่เปิดผ่าน https เช่น GitHub Pages</p>';
    } else {
      help.classList.add('hidden');
    }

    readout.classList.toggle('stale', !live);
    if (!f) return;

    el('vLat').textContent = fmtLat(f.lat, fmt);
    el('vLon').textContent = fmtLon(f.lon, fmt);
    const u = toUTM(f.lat, f.lon, store.zoneLock());
    el('vZone').textContent = u ? `${u.zone}${u.band}` : '';
    el('vUtm').innerHTML = u ? `${Math.round(u.easting)} E<br>${Math.round(u.northing)} N` : '—';
    el('vElev').innerHTML = f.alt != null
      ? `${Math.round(f.alt)}<span class="u">m</span>${f.altAcc != null ? `<small>±${Math.round(f.altAcc)}</small>` : ''}`
      : '<span class="na">เครื่องไม่ส่งค่าความสูง</span>';
    const q = accClass(f.acc);
    const bars = accBars(f.acc);
    el('vAcc').innerHTML = `<span class="q-${q}">±${fmtAcc(f.acc)}<span class="u">m</span></span><span class="qbar q-${q}" aria-hidden="true">${[1, 2, 3, 4, 5].map((i) => `<i${i <= bars ? ' class="on"' : ''}></i>`).join('')}</span>`;
    lastCopy = {
      latlon: `${f.lat.toFixed(6)}, ${f.lon.toFixed(6)}`,
      utm: u ? `${u.zone}${u.band} ${Math.round(u.easting)} ${Math.round(u.northing)}` : '',
    };
    if (live) mm.setPosition(f, { follow: true });
  }
  const unsubGps = gps.subscribe(renderFix);
  const ticker = setInterval(() => renderFix(gps.current()), 1000);

  // ----- Compass -----
  const btnCmp = el('btnCmp');
  function renderHeading(c) {
    const sub = el('vCmpSub');
    const cmp = el('cmp');
    btnCmp.classList.toggle('hidden', c.status !== 'needs-permission');
    cmp.classList.toggle('off', c.status !== 'ok');
    if (c.status !== 'ok') {
      el('vBrg').textContent = '—';
      el('vCard').textContent = '';
      sub.textContent = {
        'needs-permission': 'แตะปุ่มเพื่อให้ GEO อ่านเข็มทิศ',
        waiting: 'กำลังอ่านเซนเซอร์',
        unavailable: 'เครื่องนี้ไม่มีเซนเซอร์เข็มทิศ',
        denied: 'ไม่ได้รับสิทธิ์ใช้เซนเซอร์ทิศทาง',
        off: '',
      }[c.status] || '';
      return;
    }
    const decl = Number(store.getSettings().declination) || 0;
    const h = norm360(c.heading + decl);
    root.querySelector('#dialCard').setAttribute('transform', `rotate(${(-h).toFixed(1)} 50 50)`);
    el('vBrg').textContent = `${String(Math.round(h) % 360).padStart(3, '0')}°`;
    el('vCard').textContent = cardinal(h);
    const ref = decl ? `ทิศเหนือจริง (declination ${decl > 0 ? '+' : ''}${decl}°)` : 'ทิศเหนือแม่เหล็ก';
    sub.textContent = c.accuracy != null && c.accuracy > 20
      ? 'เข็มทิศคลาดเคลื่อน หมุนโทรศัพท์เป็นเลข 8 เพื่อปรับเทียบ'
      : `${ref}${c.accuracy != null ? ` ±${Math.round(c.accuracy)}°` : ''}`;
  }
  const unsubCmp = compass.subscribe(renderHeading);
  btnCmp.onclick = () => compass.requestPermission();

  // ----- actions -----
  readout.addEventListener('click', async (e) => {
    const row = e.target.closest('[data-copy]');
    const text = row && lastCopy[row.dataset.copy];
    if (!text) return;
    try {
      await navigator.clipboard.writeText(text);
      toast(`คัดลอกแล้ว: ${text}`);
    } catch {
      toast(text, 4000);
    }
  });

  const openMap = () => { location.hash = '#/map'; };
  mapEl.addEventListener('click', openMap);
  mapEl.addEventListener('keydown', (e) => { if (e.key === 'Enter') openMap(); });

  const slot = el('bannerSlot');
  slot.addEventListener('click', async (e) => {
    if (e.target.closest('[data-dismiss]')) {
      await store.updateSettings({ bannerDismissed: true });
      slot.innerHTML = '';
      mm.invalidate();
    } else if (e.target.closest('[data-install]')) {
      if (await promptInstall()) slot.innerHTML = '';
    }
  });
  const onInstallable = () => { slot.innerHTML = bannerHTML(); };
  document.addEventListener('geo:installable', onInstallable);

  const btnNew = el('btnNew');
  btnNew.onclick = async () => {
    btnNew.disabled = true;
    try {
      const s = gps.current();
      const fix = s.fix && Date.now() - s.fix.received < 15000 ? s.fix : null;
      const st = await store.createStation(fix ? { ...fix, method: 'single', n: 1 } : null);
      store.freshIds.add(st.id);
      location.hash = `#/station/${st.id}`;
    } catch (err) {
      toast(`สร้าง Station ไม่สำเร็จ: ${err.message}`);
      btnNew.disabled = false;
    }
  };

  return () => {
    unsubGps();
    unsubCmp();
    clearInterval(ticker);
    document.removeEventListener('geo:installable', onInstallable);
    mm.destroy();
  };
}
