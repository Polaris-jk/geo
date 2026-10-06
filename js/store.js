// Projects, stations, photos and settings — the field notebook itself.

import * as db from './db.js';
import { uuid, pad } from './util.js';
import { hasMeasurement } from './geomath.js';

export const APP_VERSION = '0.1.0';

const DEFAULTS = {
  projectId: null,
  stationPrefix: 'ST',
  samplePrefix: 'GEO',
  collector: '',
  utmZone: 'auto', // 'auto' | '47' | '48' | …
  coordFormat: 'dd', // 'dd' | 'dms'
  declination: 0, // degrees, east positive
  theme: 'dark', // 'dark' | 'sun'
  bannerDismissed: false,
};

let settings = { ...DEFAULTS };
let project = null;

/** Stations created this session that the person has not touched yet. */
export const freshIds = new Set();

export async function init() {
  const saved = await db.get('kv', 'settings');
  settings = { ...DEFAULTS, ...(saved || {}) };
  if (settings.projectId) project = await db.get('projects', settings.projectId);
  if (!project) {
    project = { id: uuid(), name: 'My Project', createdAt: Date.now() };
    await db.put('projects', project);
    settings.projectId = project.id;
    await db.put('kv', { ...settings }, 'settings');
  }
}

export const getSettings = () => settings;
export const getProject = () => project;

export async function updateSettings(patch) {
  Object.assign(settings, patch);
  await db.put('kv', { ...settings }, 'settings');
}

export async function renameProject(name) {
  project = { ...project, name: name.trim() || 'My Project', updatedAt: Date.now() };
  await db.put('projects', project);
}

/** UTM zone lock from settings, or undefined for automatic. */
export function zoneLock() {
  const z = parseInt(settings.utmZone, 10);
  return Number.isFinite(z) && z >= 1 && z <= 60 ? z : undefined;
}

// ---------- stations ----------

export async function listStations() {
  const rows = await db.getAllByIndex('stations', 'projectId', project.id);
  return rows.sort((a, b) => b.number - a.number);
}

export const getStation = (id) => db.get('stations', id);

export async function saveStation(st) {
  st.updatedAt = Date.now();
  await db.put('stations', st);
  return st;
}

export function makeLocation(fix) {
  return {
    lat: fix.lat,
    lon: fix.lon,
    acc: fix.acc ?? null,
    alt: fix.alt ?? null,
    altRaw: fix.altRaw ?? null,
    altRef: fix.altRef ?? null,
    altAcc: fix.altAcc ?? null,
    method: fix.method || 'single',
    n: fix.n || 1,
    spread: fix.spread ?? null,
    time: fix.time || Date.now(),
  };
}

export async function createStation(fix) {
  const all = await listStations();
  const number = all.reduce((m, s) => Math.max(m, s.number || 0), 0) + 1;
  const now = Date.now();
  const st = {
    id: uuid(),
    projectId: project.id,
    number,
    code: `${settings.stationPrefix || 'ST'}-${pad(number, 3)}`,
    status: 'draft',
    createdAt: now,
    updatedAt: now,
    location: fix ? makeLocation(fix) : null,
    lithology: '',
    lithologyOther: '',
    weathering: '',
    color: '',
    measurements: [],
    samples: [],
    sampleSeq: 0,
    notes: '',
    photoIds: [],
    collector: settings.collector || '',
  };
  await db.put('stations', st);
  return st;
}

export function isEmptyStation(st) {
  return (
    !st.lithology && !st.weathering && !st.color?.trim() && !st.notes?.trim() &&
    !(st.samples || []).length && !(st.photoIds || []).length &&
    !(st.measurements || []).some(hasMeasurement)
  );
}

export async function deleteStation(st) {
  const photos = await db.getAllByIndex('photos', 'stationId', st.id);
  await db.transact(['stations', 'photos', 'photoData'], (os) => {
    os('stations').delete(st.id);
    for (const p of photos) {
      os('photos').delete(p.id);
      os('photoData').delete(p.id);
    }
  });
}

// ---------- photos ----------
// Full images and small thumbnails are stored separately so lists stay fast.
// Images are stored as ArrayBuffers (the most reliable format across iOS/Android WebViews).

async function makeThumb(file, max = 420) {
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise((res, rej) => {
      const i = new Image();
      i.onload = () => res(i);
      i.onerror = () => rej(new Error('อ่านไฟล์รูปไม่ได้'));
      i.src = url;
    });
    const w = img.naturalWidth;
    const h = img.naturalHeight;
    const s = Math.min(1, max / Math.max(w, h));
    const c = document.createElement('canvas');
    c.width = Math.max(1, Math.round(w * s));
    c.height = Math.max(1, Math.round(h * s));
    c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
    const blob = await new Promise((res) => c.toBlob(res, 'image/jpeg', 0.8));
    return { buf: await blob.arrayBuffer(), w, h };
  } finally {
    URL.revokeObjectURL(url);
  }
}

export async function addPhoto(st, file) {
  const [data, thumb] = await Promise.all([file.arrayBuffer(), makeThumb(file)]);
  const id = uuid();
  const meta = {
    id,
    stationId: st.id,
    type: file.type || 'image/jpeg',
    name: file.name || '',
    size: file.size,
    width: thumb.w,
    height: thumb.h,
    thumb: thumb.buf,
    createdAt: Date.now(),
  };
  st.photoIds = [...(st.photoIds || []), id];
  st.updatedAt = Date.now();
  await db.transact(['photos', 'photoData', 'stations'], (os) => {
    os('photos').put(meta);
    os('photoData').put(data, id);
    os('stations').put(st);
  });
  return meta;
}

export async function listPhotos(st) {
  const rows = await db.getAllByIndex('photos', 'stationId', st.id);
  const order = new Map((st.photoIds || []).map((id, i) => [id, i]));
  return rows.sort((a, b) => (order.get(a.id) ?? 1e9) - (order.get(b.id) ?? 1e9));
}

export const getPhotoData = (id) => db.get('photoData', id);

export async function deletePhoto(st, id) {
  st.photoIds = (st.photoIds || []).filter((x) => x !== id);
  st.updatedAt = Date.now();
  await db.transact(['photos', 'photoData', 'stations'], (os) => {
    os('photos').delete(id);
    os('photoData').delete(id);
    os('stations').put(st);
  });
}

// ---------- storage ----------

/** Ask the browser not to clear GEO's data when the phone runs low on space. */
export async function ensurePersistence() {
  try {
    if (navigator.storage?.persisted && !(await navigator.storage.persisted())) {
      return await navigator.storage.persist();
    }
    return true;
  } catch {
    return false;
  }
}

export async function storageInfo() {
  const out = {};
  try {
    if (navigator.storage?.estimate) Object.assign(out, await navigator.storage.estimate());
    if (navigator.storage?.persisted) out.persisted = await navigator.storage.persisted();
  } catch { /* not supported */ }
  return out;
}
