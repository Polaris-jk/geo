// Battery-aware GPS.
// The watch runs only while some screen subscribes AND the app is visible.
// Leaving the GPS/Map screens or locking the phone stops it.

import { metersBetween, norm360 } from './geomath.js';
import { geoidN } from './geoid-th.js';
import { isAppleWebKit } from './util.js';

const subs = new Set();
let watchId = null;
let state = { status: 'off', fix: null, error: null };

const supported = typeof navigator !== 'undefined' && 'geolocation' in navigator;
// iPhone/iPad report altitude above mean sea level; Android (and the W3C spec) report
// height above the WGS84 ellipsoid, ~30 m different in Thailand. Normalise everything to MSL.
const ALT_IS_MSL = isAppleWebKit();

function emit() {
  for (const fn of subs) {
    try { fn(state); } catch (err) { console.error(err); }
  }
}

function toFix(p) {
  const c = p.coords;
  const lat = c.latitude;
  const lon = c.longitude;
  let alt = null;
  let altRef = null;
  const raw = Number.isFinite(c.altitude) ? c.altitude : null;
  if (raw != null) {
    if (ALT_IS_MSL) { alt = raw; altRef = 'msl'; }
    else {
      const N = geoidN(lat, lon);
      if (N != null) { alt = raw - N; altRef = 'egm96'; }
      else { alt = raw; altRef = 'ellipsoid'; }
    }
  }
  return {
    lat,
    lon,
    acc: Number.isFinite(c.accuracy) ? c.accuracy : null,
    alt,
    altRaw: raw,
    altRef,
    altAcc: Number.isFinite(c.altitudeAccuracy) ? c.altitudeAccuracy : null,
    heading: Number.isFinite(c.heading) ? norm360(c.heading) : null,
    speed: Number.isFinite(c.speed) ? c.speed : null,
    time: p.timestamp || Date.now(),
    received: Date.now(),
  };
}

function onPosition(p) {
  state = { status: 'ok', fix: toFix(p), error: null };
  emit();
}

function onError(err) {
  if (err.code === 1) {
    state = { ...state, status: 'denied', error: err.message };
    stopWatch();
  } else if (!state.fix) {
    state = { ...state, status: 'searching', error: err.message };
  } else {
    state = { ...state, error: err.message };
  }
  emit();
}

function startWatch() {
  if (watchId !== null || document.hidden || !subs.size) return;
  if (!supported) { state = { ...state, status: 'unsupported' }; emit(); return; }
  if (!window.isSecureContext) { state = { ...state, status: 'insecure' }; emit(); return; }
  if (state.status === 'denied') return;
  if (state.status !== 'ok') state = { ...state, status: 'searching' };
  watchId = navigator.geolocation.watchPosition(onPosition, onError, {
    enableHighAccuracy: true,
    maximumAge: 0,
    timeout: 30000,
  });
  emit();
}

function stopWatch() {
  if (watchId !== null) {
    navigator.geolocation.clearWatch(watchId);
    watchId = null;
  }
  if (state.status === 'ok' || state.status === 'searching') state = { ...state, status: 'paused' };
}

document.addEventListener('visibilitychange', () => {
  if (document.hidden) stopWatch();
  else startWatch();
});

export const current = () => state;
export const isRunning = () => watchId !== null;

/** Subscribe to GPS updates. Returns an unsubscribe function. */
export function subscribe(fn) {
  subs.add(fn);
  startWatch();
  fn(state);
  return () => {
    subs.delete(fn);
    if (!subs.size) stopWatch();
  };
}

/** Try again after the person allowed location in system settings. */
export function retry() {
  if (state.status === 'denied') state = { ...state, status: 'off' };
  startWatch();
}

const abortError = () => Object.assign(new Error('aborted'), { name: 'AbortError' });

/** Resolve with the first fix that arrives after now. */
export function fresh(timeout = 20000, signal) {
  return new Promise((resolve, reject) => {
    const t0 = Date.now();
    let done = false;
    let unsub = null;
    let timer = null;
    const finish = (err, fix) => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      signal?.removeEventListener('abort', onAbort);
      if (unsub) unsub();
      err ? reject(err) : resolve(fix);
    };
    const onAbort = () => finish(abortError());
    if (signal?.aborted) return onAbort();
    signal?.addEventListener('abort', onAbort);
    timer = setTimeout(() => finish(new Error('timeout')), timeout);
    unsub = subscribe((s) => {
      if (s.status === 'denied') return finish(new Error('denied'));
      if (s.status === 'unsupported' || s.status === 'insecure') return finish(new Error(s.status));
      if (s.fix && s.fix.received >= t0) finish(null, { ...s.fix, method: 'single', n: 1 });
    });
    if (done) unsub();
  });
}

const median = (xs) => {
  if (!xs.length) return null;
  const s = [...xs].sort((x, y) => x - y);
  const m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};

/**
 * Average positions for `ms` milliseconds while the person stands still.
 * Weighted by 1/accuracy². Reported accuracy is the median of the fixes (fixes are
 * correlated, so dividing by √n would overstate the improvement).
 */
export function average(ms = 10000, onProgress, signal) {
  return new Promise((resolve, reject) => {
    const t0 = Date.now();
    const fixes = [];
    let last = null;
    let done = false;
    let unsub = null;
    const tick = setInterval(() => {
      const elapsed = Date.now() - t0;
      onProgress?.({ n: fixes.length, elapsed, total: ms });
      if (elapsed >= ms) finish();
    }, 250);
    function finish(err) {
      if (done) return;
      done = true;
      clearInterval(tick);
      signal?.removeEventListener('abort', onAbort);
      if (unsub) unsub();
      if (err) return reject(err);
      if (!fixes.length) return reject(new Error('timeout'));
      resolve(combine(fixes));
    }
    const onAbort = () => finish(abortError());
    if (signal?.aborted) return onAbort();
    signal?.addEventListener('abort', onAbort);
    unsub = subscribe((s) => {
      if (s.status === 'denied') return finish(new Error('denied'));
      const f = s.fix;
      if (!f || f === last || f.received < t0) return;
      last = f;
      fixes.push(f);
      onProgress?.({ n: fixes.length, elapsed: Date.now() - t0, total: ms });
    });
    if (done) unsub();
  });
}

function combine(fixes) {
  let sw = 0, slat = 0, slon = 0;
  for (const f of fixes) {
    const w = 1 / Math.max(f.acc || 10, 1) ** 2;
    sw += w; slat += w * f.lat; slon += w * f.lon;
  }
  const lat = slat / sw;
  const lon = slon / sw;
  const withAlt = fixes.filter((f) => f.alt != null);
  let alt = null, altRaw = null, altAcc = null, altRef = null;
  if (withAlt.length) {
    let w2 = 0, sa = 0, sr = 0;
    for (const f of withAlt) {
      const w = 1 / Math.max(f.altAcc || 10, 1) ** 2;
      w2 += w; sa += w * f.alt; sr += w * f.altRaw;
    }
    alt = sa / w2;
    altRaw = sr / w2;
    altAcc = median(withAlt.map((f) => f.altAcc).filter((x) => x != null));
    altRef = withAlt[withAlt.length - 1].altRef;
  }
  const spread = Math.sqrt(fixes.reduce((s, f) => s + metersBetween(lat, lon, f.lat, f.lon) ** 2, 0) / fixes.length);
  return {
    lat, lon,
    acc: median(fixes.map((f) => f.acc).filter((x) => x != null)),
    alt, altRaw, altRef, altAcc,
    n: fixes.length,
    spread,
    method: 'average',
    time: Date.now(),
    received: Date.now(),
  };
}
