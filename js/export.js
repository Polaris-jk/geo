// Export to QGIS / Excel: CSV (UTF-8 with BOM for Thai in Excel), GeoJSON (RFC 7946, WGS84),
// and a project ZIP with every table, the photos and a full JSON backup.

import { zipSync, strToU8 } from '../vendor/fflate.js';
import * as store from './store.js';
import { toUTM } from './utm.js';
import { lithInfo, lithName, weatheringLabel } from './vocab.js';
import { isoDate, pad, stamp } from './util.js';
import { hasMeasurement } from './geomath.js';

const r = (v, d) => (v == null || !Number.isFinite(v) ? null : Number(v.toFixed(d)));

export const STATION_COLS = [
  'station', 'status', 'date', 'time', 'lat', 'lon', 'utm_zone', 'utm_e', 'utm_n', 'utm_epsg',
  'elev_m', 'elev_ref', 'elev_acc_m', 'acc_m', 'fix_method', 'fix_n',
  'lithology', 'lithology_th', 'weathering', 'color',
  'struct_type', 'strike', 'dip', 'dip_dir', 'n_struct',
  'samples', 'n_photos', 'notes', 'collector', 'project', 'timestamp_utc',
];
export const STRUCT_COLS = ['station', 'struct_no', 'type', 'strike', 'dip', 'dip_dir', 'lat', 'lon', 'utm_zone', 'utm_e', 'utm_n', 'date'];
const SAMPLE_COLS = ['sample_id', 'station', 'note', 'lithology', 'lat', 'lon', 'utm_zone', 'utm_e', 'utm_n', 'date', 'collector'];
const PHOTO_COLS = ['file', 'station', 'photo_no', 'width', 'height', 'taken_utc'];

const ELEV_REF = { msl: 'MSL (device)', egm96: 'MSL (EGM96 from ellipsoid)', ellipsoid: 'WGS84 ellipsoid' };

function place(st) {
  const L = st.location;
  if (!L) return { lat: null, lon: null, utm_zone: null, utm_e: null, utm_n: null, utm_epsg: null };
  const u = toUTM(L.lat, L.lon, store.zoneLock());
  return {
    lat: r(L.lat, 7),
    lon: r(L.lon, 7),
    utm_zone: u ? `${u.zone}${u.band}` : null,
    utm_e: u ? r(u.easting, 1) : null,
    utm_n: u ? r(u.northing, 1) : null,
    utm_epsg: u ? u.epsg : null,
  };
}

const when = (st) => st.location?.time || st.createdAt;

function stationRow(st, project) {
  const L = st.location || {};
  const t = when(st);
  const d = new Date(t);
  const meas = (st.measurements || []).filter(hasMeasurement);
  const m0 = meas[0] || {};
  return {
    station: st.code,
    status: st.status,
    date: isoDate(t),
    time: `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`,
    ...place(st),
    elev_m: r(L.alt, 1),
    elev_ref: L.altRef ? ELEV_REF[L.altRef] : null,
    elev_acc_m: r(L.altAcc, 1),
    acc_m: r(L.acc, 1),
    fix_method: L.method ?? null,
    fix_n: L.n ?? null,
    lithology: lithName(st),
    lithology_th: lithInfo(st.lithology)?.th || '',
    weathering: weatheringLabel(st.weathering),
    color: st.color || '',
    struct_type: m0.type || '',
    strike: m0.strike ?? null,
    dip: m0.dip ?? null,
    dip_dir: m0.dipdir ?? null,
    n_struct: meas.length,
    samples: (st.samples || []).map((s) => s.id).filter(Boolean).join('; '),
    n_photos: (st.photoIds || []).length,
    notes: st.notes || '',
    collector: st.collector || '',
    project: project.name,
    timestamp_utc: new Date(t).toISOString(),
  };
}

function structureRows(stations) {
  const rows = [];
  for (const st of stations) {
    (st.measurements || []).filter(hasMeasurement).forEach((m, i) => {
      const p = place(st);
      rows.push({
        station: st.code, struct_no: i + 1, type: m.type || '',
        strike: m.strike ?? null, dip: m.dip ?? null, dip_dir: m.dipdir ?? null,
        lat: p.lat, lon: p.lon, utm_zone: p.utm_zone, utm_e: p.utm_e, utm_n: p.utm_n,
        date: isoDate(when(st)),
      });
    });
  }
  return rows;
}

function sampleRows(stations) {
  const rows = [];
  for (const st of stations) {
    for (const s of st.samples || []) {
      if (!s.id) continue;
      const p = place(st);
      rows.push({
        sample_id: s.id, station: st.code, note: s.note || '', lithology: lithName(st),
        lat: p.lat, lon: p.lon, utm_zone: p.utm_zone, utm_e: p.utm_e, utm_n: p.utm_n,
        date: isoDate(when(st)), collector: st.collector || '',
      });
    }
  }
  return rows;
}

function csvCell(v) {
  if (v == null) return '';
  const s = String(v);
  return /[",\r\n]|^\s|\s$/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function toCSV(rows, cols) {
  const lines = [cols.join(',')];
  for (const row of rows) lines.push(cols.map((c) => csvCell(row[c])).join(','));
  return '﻿' + lines.join('\r\n') + '\r\n';
}

function featureCollection(name, rows) {
  return {
    type: 'FeatureCollection',
    name,
    features: rows
      .filter((p) => p.lat != null && p.lon != null)
      .map((p) => ({ type: 'Feature', geometry: { type: 'Point', coordinates: [p.lon, p.lat] }, properties: p })),
  };
}

const slug = (s) => (s || 'project').normalize('NFC').trim().replace(/[\\/:*?"<>|\s]+/g, '_').slice(0, 40);
const photoBase = (code) => code.replace(/[^A-Za-z0-9]/g, '');
const extFor = (type) => ({ 'image/jpeg': 'jpg', 'image/png': 'png', 'image/heic': 'heic', 'image/webp': 'webp' }[type] || 'jpg');

async function collect() {
  const project = store.getProject();
  const stations = (await store.listStations()).sort((a, b) => a.number - b.number);
  return { project, stations };
}

const README = (project, n) => `GEO field data export
Project: ${project.name}
Stations: ${n}
Exported: ${new Date().toISOString()}

stations.geojson    Stations as points (WGS84). Drag into QGIS.
stations.csv        Same table for Excel / Google Sheets (UTF-8).
structures.geojson  One point per strike/dip measurement (right-hand rule).
structures.csv      Same table as CSV.
samples.csv         Sample IDs with station and location.
photos/             Photos named <station>_<nn>.jpg, listed in photos.csv.
project.json        Full backup of everything recorded in GEO.

Coordinates: lat/lon WGS84 (EPSG:4326); UTM columns use the zone in utm_zone (EPSG in utm_epsg).
Elevation: metres above mean sea level when elev_ref says MSL.
`;

/**
 * Build an export file.
 * @param {'zip'|'geojson'|'csv'|'struct'} kind
 */
export async function build(kind, onProgress) {
  const { project, stations } = await collect();
  const rows = stations.map((s) => stationRow(s, project));
  const base = `GEO_${slug(project.name)}_${stamp()}`;

  if (kind === 'geojson') {
    const json = JSON.stringify(featureCollection('stations', rows), null, 1);
    return new File([json], `${base}_stations.geojson`, { type: 'application/geo+json' });
  }
  if (kind === 'csv') {
    return new File([toCSV(rows, STATION_COLS)], `${base}_stations.csv`, { type: 'text/csv' });
  }
  if (kind === 'struct') {
    const json = JSON.stringify(featureCollection('structures', structureRows(stations)), null, 1);
    return new File([json], `${base}_structures.geojson`, { type: 'application/geo+json' });
  }

  // Project ZIP
  const files = {};
  const sRows = structureRows(stations);
  files['stations.geojson'] = strToU8(JSON.stringify(featureCollection('stations', rows), null, 1));
  files['stations.csv'] = strToU8(toCSV(rows, STATION_COLS));
  files['structures.geojson'] = strToU8(JSON.stringify(featureCollection('structures', sRows), null, 1));
  files['structures.csv'] = strToU8(toCSV(sRows, STRUCT_COLS));
  files['samples.csv'] = strToU8(toCSV(sampleRows(stations), SAMPLE_COLS));

  const photoRows = [];
  const photoMeta = [];
  const total = stations.reduce((n, s) => n + (s.photoIds || []).length, 0);
  let done = 0;
  for (const st of stations) {
    const metas = await store.listPhotos(st);
    let k = 0;
    for (const p of metas) {
      k += 1;
      const data = await store.getPhotoData(p.id);
      done += 1;
      onProgress?.(done, total);
      if (!data) continue;
      const file = `photos/${photoBase(st.code)}_${pad(k)}.${extFor(p.type)}`;
      files[file] = [new Uint8Array(data), { level: 0 }];
      photoRows.push({ file, station: st.code, photo_no: k, width: p.width, height: p.height, taken_utc: new Date(p.createdAt).toISOString() });
      photoMeta.push({ id: p.id, stationId: st.id, file, type: p.type, width: p.width, height: p.height, createdAt: p.createdAt });
    }
  }
  files['photos.csv'] = strToU8(toCSV(photoRows, PHOTO_COLS));
  const { bannerDismissed, ...settings } = store.getSettings();
  files['project.json'] = strToU8(JSON.stringify({
    app: 'GEO', version: store.APP_VERSION, exportedAt: new Date().toISOString(),
    project, settings, stations, photos: photoMeta,
  }, null, 1));
  files['README.txt'] = strToU8(README(project, stations.length));

  const zipped = zipSync(files, { level: 6 });
  return new File([zipped], `${base}.zip`, { type: 'application/zip' });
}

/** Hand the file to the share sheet (iPhone: Save to Files, LINE, Drive…) or download it. */
export async function deliver(file) {
  if (navigator.canShare && navigator.share) {
    let ok = false;
    try { ok = navigator.canShare({ files: [file] }); } catch { ok = false; }
    if (ok) {
      try {
        await navigator.share({ files: [file], title: file.name });
        return 'shared';
      } catch (err) {
        if (err.name === 'AbortError') return 'cancelled';
      }
    }
  }
  const url = URL.createObjectURL(file);
  const a = document.createElement('a');
  a.href = url;
  a.download = file.name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 60000);
  return 'downloaded';
}
