// Map — every station with its strike/dip symbol, and where you are now.

import * as gps from '../gps.js';
import * as store from '../store.js';
import { createMap } from '../map.js';
import { icon } from '../icons.js';
import { mainHeader, toast } from '../ui.js';
import { accClass, fmtAcc } from '../geomath.js';

export async function render(root, ctx) {
  mainHeader();
  root.innerHTML = `<div class="map-screen">
    <div class="bigmap" id="bigmap"></div>
    <div class="gps-chip map-chip" id="mapChip"></div>
    <div class="map-fabs">
      <button type="button" class="fab" id="fabFit" aria-label="แสดงทุก Station">${icon('fit')}</button>
      <button type="button" class="fab" id="fabMe" aria-label="ไปยังตำแหน่งปัจจุบัน">${icon('locate')}</button>
    </div>
  </div>`;

  const m = createMap(root.querySelector('#bigmap'), { interactive: true });
  const list = await store.listStations();
  if (!ctx.alive()) { m.destroy(); return; }
  m.setStations(list, (st) => { location.hash = `#/station/${st.id}`; });
  if (m.hasStations()) m.fitStations();

  let centred = m.hasStations();
  const chip = root.querySelector('#mapChip');
  const unsub = gps.subscribe((s) => {
    const f = s.fix;
    if (f) {
      m.setPosition(f);
      if (!centred) { m.centerOn(f, 16); centred = true; }
      chip.innerHTML = `<i class="dot q-${accClass(f.acc)}"></i>±${fmtAcc(f.acc)} m`;
    } else {
      chip.innerHTML = `<i class="dot pulse q-fair"></i>กำลังหาสัญญาณ GPS`;
    }
  });

  root.querySelector('#fabMe').onclick = () => {
    const f = gps.current().fix;
    if (f) m.centerOn(f, 17);
    else toast('ยังไม่มีพิกัดจาก GPS');
  };
  root.querySelector('#fabFit').onclick = () => {
    if (m.hasStations()) m.fitStations();
    else toast('ยังไม่มี Station บนแผนที่');
  };

  return () => { unsub(); m.destroy(); };
}
