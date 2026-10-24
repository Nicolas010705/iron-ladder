/* Iron Ladder – 3D-Übungsansicht (three.js).
 * Gebaut mit esbuild zu /3d/iron3d.js (tools/3d/build.mjs).
 * Körper: /3d/body.glb (MakeHuman CC0, in Blender aufbereitet), Geräte: /3d/eq/*.glb (in Blender modelliert).
 */
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js';
import { PATTERNS, resolvePattern } from './poses.js';
import { Figure } from './figure.js';
import { Scene3D, setBase } from './scene.js';
export { PATTERNS, Figure, Scene3D, resolvePattern, setBase };
const clamp = (x, a, b) => Math.max(a, Math.min(b, x));

/* ---------------- Modell laden (einmal pro Seite) ---------------- */
let MODEL_P = null;
export function loadModel(url) {
  if (!MODEL_P) {
    const loader = new GLTFLoader(); loader.setMeshoptDecoder(MeshoptDecoder);
    MODEL_P = loader.loadAsync(url).then((g) => prepModel(g)).catch((e) => { MODEL_P = null; throw e; });
  }
  return MODEL_P;
}

function prepModel(gltf) {
  let mesh = null; gltf.scene.traverse((o) => { if (o.isSkinnedMesh) mesh = o; });
  const geo = mesh.geometry; const col = geo.attributes.color; const n = geo.attributes.position.count;
  const region = new Uint8Array(n);
  for (let i = 0; i < n; i++) region[i] = Math.round(col.getX(i) * 31);
  geo.deleteAttribute('color');
  // Nachbarschaft für weiche Übergänge der Hervorhebung
  const idx = geo.index.array; const nb = Array.from({ length: n }, () => new Set());
  for (let i = 0; i < idx.length; i += 3) { const a = idx[i], b = idx[i + 1], c = idx[i + 2]; nb[a].add(b).add(c); nb[b].add(a).add(c); nb[c].add(a).add(b); }
  const off = new Uint32Array(n + 1); let tot = 0; nb.forEach((s, i) => { off[i] = tot; tot += s.size; }); off[n] = tot;
  const adj = new Uint32Array(tot); nb.forEach((s, i) => { let k = off[i]; s.forEach((j) => { adj[k++] = j; }); });
  return { gltf, region, off, adj };
}

/* ---------------- Zyklus wie in der App (Halt am Umkehrpunkt) ---------------- */
export function cycle(u) { // u in [0,1)
  const e = (x) => x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2;
  if (u < 0.42) return { t: e(u / 0.42), up: true };
  if (u < 0.52) return { t: 1, up: true };
  if (u < 0.94) return { t: 1 - e((u - 0.52) / 0.42), up: false };
  return { t: 0, up: false };
}

/* ---------------- UI: Ansicht in der App ---------------- */
const CSS = `
.v3d{display:flex;flex-direction:column;gap:10px}
.v3d-stage{position:relative;background:var(--row);border-radius:var(--r,16px);overflow:hidden;aspect-ratio:4/3.3;max-height:min(62vh,460px);width:100%;touch-action:pan-y;user-select:none;-webkit-user-select:none}
.v3d-stage canvas{width:100%;height:100%;display:block;cursor:grab}
.v3d-stage canvas:active{cursor:grabbing}
.v3d-load{position:absolute;inset:0;display:grid;place-items:center;color:var(--muted);font-size:.875rem;font-weight:600}
.v3d-tl{position:absolute;left:10px;top:10px;display:flex;gap:6px;flex-wrap:wrap}
.v3d-tr{position:absolute;right:10px;top:10px;display:flex;flex-direction:column;gap:6px}
.v3d-bl{position:absolute;left:10px;right:10px;bottom:10px;display:flex;gap:8px;align-items:center}
.v3d-pill{all:unset;box-sizing:border-box;cursor:pointer;min-height:32px;min-width:32px;padding:0 10px;border-radius:999px;display:inline-flex;align-items:center;justify-content:center;gap:6px;font-size:.8125rem;font-weight:600;color:var(--fg);background:color-mix(in srgb,var(--surface) 82%,transparent);backdrop-filter:blur(10px);-webkit-backdrop-filter:blur(10px);box-shadow:0 1px 3px rgba(0,0,0,.12)}
.v3d-pill[aria-pressed="true"]{background:var(--fg);color:var(--bg)}
.v3d-pill:focus-visible{outline:2px solid var(--accent);outline-offset:2px}
.v3d-pill svg{width:16px;height:16px}
.v3d-seg{display:inline-flex;gap:2px;padding:2px;border-radius:999px;background:color-mix(in srgb,var(--surface) 82%,transparent);backdrop-filter:blur(10px);-webkit-backdrop-filter:blur(10px);box-shadow:0 1px 3px rgba(0,0,0,.12)}
.v3d-seg .v3d-pill{background:none;box-shadow:none;backdrop-filter:none;min-height:28px}
.v3d-seg .v3d-pill[aria-pressed="true"]{background:var(--fg);color:var(--bg)}
.v3d-scrub{flex:1;accent-color:var(--accent);min-width:0}
.v3d-phase{font-size:.75rem;font-weight:700;color:var(--muted);min-width:76px;text-align:right;font-variant-numeric:tabular-nums}
.v3d-mus{display:flex;flex-wrap:wrap;gap:6px;align-items:center}
.v3d-mus .lbl{font-size:.75rem;color:var(--muted);font-weight:600;margin-right:2px}
.v3d-chip{all:unset;box-sizing:border-box;cursor:pointer;min-height:32px;padding:0 12px;border-radius:999px;display:inline-flex;align-items:center;gap:6px;font-size:.875rem;font-weight:600;background:var(--row);color:var(--fg)}
.v3d-chip i{width:10px;height:10px;border-radius:50%;background:var(--accent);flex:none}
.v3d-chip.sec i{opacity:.45}
.v3d-chip[aria-pressed="true"]{box-shadow:inset 0 0 0 2px var(--accent)}
.v3d-chip:focus-visible{outline:2px solid var(--accent);outline-offset:2px}
.v3d-hint{font-size:.75rem;color:var(--muted);margin:0}
`;
const ICON = {
  play: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M8 5.5v13l11-6.5z"/></svg>',
  pause: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M7 5h4v14H7zM13 5h4v14h-4z"/></svg>',
  rot: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M20 12a8 8 0 1 1-2.3-5.7"/><path d="M20 4v4h-4"/></svg>',
  plus: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><path d="M12 5v14M5 12h14"/></svg>',
  minus: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><path d="M5 12h14"/></svg>',
};
const PREF = { speed: 1, spin: false };
const LIVE = new Set(); let WATCH = 0;
function sweep() { for (const v of LIVE) if (!v.el.isConnected) v.kill(); if (!LIVE.size && WATCH) { clearInterval(WATCH); WATCH = 0; } }
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
function cssVar(el, n, d) { const v = getComputedStyle(el).getPropertyValue(n).trim(); return v || d; }
function isDark(el) { const c = new THREE.Color(); try { c.setStyle(cssVar(el, '--bg', '#ffffff')); } catch (e) { return false; } return (c.r + c.g + c.b) / 3 < 0.35; }

/**
 * Bindet die 3D-Ansicht in el ein. o: {pat, eq, prim:[], sec:[], names:{key:label}, hold, reduced, model}
 * Der bisherige Inhalt von el bleibt als Rückfall stehen, bis das Modell geladen ist.
 */
export async function mount(el, o) {
  if (!document.getElementById('v3d-css')) { const st = document.createElement('style'); st.id = 'v3d-css'; st.textContent = CSS; document.head.appendChild(st); }
  const test = document.createElement('canvas');
  if (!(test.getContext('webgl2') || test.getContext('webgl'))) return false;
  const model = await loadModel(o.model || '/3d/body.glb');
  if (!el.isConnected) return false;
  const hold = !!o.hold; const reduced = !!o.reduced;
  const names = o.names || {};
  const allM = [...(o.prim || []), ...(o.sec || [])];
  el.innerHTML = `<div class="v3d-stage"><canvas aria-label="3D-Ansicht der Übung. Ziehen zum Drehen." role="img"></canvas>
   <div class="v3d-tl"><div class="v3d-seg" role="group" aria-label="Ansicht">${[['side', 'Seite'], ['front', 'Vorne'], ['back', 'Hinten'], ['tq', 'Schräg']].map(([k, n]) => `<button class="v3d-pill" data-view="${k}" aria-pressed="false">${n}</button>`).join('')}</div></div>
   <div class="v3d-tr"><button class="v3d-pill" data-z="1" aria-label="Heranzoomen">${ICON.plus}</button><button class="v3d-pill" data-z="-1" aria-label="Herauszoomen">${ICON.minus}</button><button class="v3d-pill" data-spin aria-pressed="${PREF.spin}" aria-label="Automatisch drehen">${ICON.rot}</button></div>
   <div class="v3d-bl">${hold ? '<span class="v3d-pill" style="cursor:default">Position halten</span>' : `<button class="v3d-pill" data-play aria-label="Pause">${ICON.pause}</button><button class="v3d-pill" data-speed aria-label="Tempo">${PREF.speed === 1 ? '1×' : '0,5×'}</button><input class="v3d-scrub" type="range" min="0" max="1000" value="0" aria-label="Bewegungsablauf"><span class="v3d-phase" aria-live="off"></span>`}</div>
  </div>
  <div class="v3d-mus" role="group" aria-label="Muskeln hervorheben"><span class="lbl">Muskeln</span><button class="v3d-chip" data-m="" aria-pressed="true">Alle</button>${(o.prim || []).map((m) => `<button class="v3d-chip" data-m="${m}" aria-pressed="false"><i></i>${esc(names[m] || m)}</button>`).join('')}${(o.sec || []).map((m) => `<button class="v3d-chip sec" data-m="${m}" aria-pressed="false"><i></i>${esc(names[m] || m)}</button>`).join('')}</div>
  <p class="v3d-hint">Ziehen zum Drehen, mit zwei Fingern zoomen, doppelt tippen setzt die Ansicht zurück. Kräftig gefärbt: Hauptmuskel, heller: mitarbeitende Muskeln.</p>`;
  sweep();
  const stage = el.querySelector('.v3d-stage'), canvas = el.querySelector('canvas');
  const dark = isDark(document.documentElement);
  const sc = new Scene3D(canvas, { dark, ver: o.ver });
  const fig = new Figure(model); sc.setFigure(fig);
  if (dark) fig.mesh.material.color.set(0xb3aea8);
  const accent = cssVar(document.documentElement, '--accent', '#00a86b');
  await sc.setExercise(o.pat, o.eq, o.prim, o.sec, accent);
  if (!el.isConnected) { sc.dispose(); return false; }
  const looped = !!sc.pat.loop;
  const st = { playing: !hold && !reduced, u: 0, manualT: (reduced && !hold) ? 0.6 : null, last: performance.now(), spin: PREF.spin };
  const $ = (s) => el.querySelector(s);
  const views = el.querySelectorAll('[data-view]');
  const markView = () => views.forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.view === sc.view)));
  markView();
  const playBtn = $('[data-play]'), scrub = $('.v3d-scrub'), phase = $('.v3d-phase');
  const syncPlay = () => { if (playBtn) { playBtn.innerHTML = st.playing ? ICON.pause : ICON.play; playBtn.setAttribute('aria-label', st.playing ? 'Pause' : 'Abspielen'); } };
  syncPlay();
  views.forEach((b) => b.addEventListener('click', () => { sc.setView(b.dataset.view); markView(); kick(); }));
  el.querySelectorAll('[data-z]').forEach((b) => b.addEventListener('click', () => { sc.zoom = clamp(sc.zoom * (b.dataset.z === '1' ? 1.25 : 0.8), 0.6, 3); kick(); }));
  $('[data-spin]').addEventListener('click', (e) => { st.spin = PREF.spin = !st.spin; e.currentTarget.setAttribute('aria-pressed', String(st.spin)); kick(); });
  playBtn && playBtn.addEventListener('click', () => { st.playing = !st.playing; if (st.playing && st.manualT !== null) { st.u = 0.42 * st.manualT; st.manualT = null; } st.last = performance.now(); syncPlay(); kick(); });
  const spd = $('[data-speed]'); spd && spd.addEventListener('click', () => { PREF.speed = PREF.speed === 1 ? 0.5 : 1; spd.textContent = PREF.speed === 1 ? '1×' : '0,5×'; });
  scrub && scrub.addEventListener('input', () => { st.playing = false; syncPlay(); st.manualT = +scrub.value / 1000; kick(); });
  el.querySelectorAll('[data-m]').forEach((b) => b.addEventListener('click', () => {
    const m = b.dataset.m; el.querySelectorAll('[data-m]').forEach((x) => x.setAttribute('aria-pressed', String(x === b)));
    if (!m) fig.setHighlight(o.prim, o.sec); else fig.setHighlight([m], []);
    kick();
  }));
  // Ziehen / Pinch
  const ptr = new Map(); let pinch0 = 0, zoom0 = 1, lastTap = 0;
  canvas.addEventListener('pointerdown', (e) => { ptr.set(e.pointerId, { x: e.clientX, y: e.clientY }); if (ptr.size === 2) { const [a, b] = [...ptr.values()]; pinch0 = Math.hypot(a.x - b.x, a.y - b.y); zoom0 = sc.zoom; } canvas.setPointerCapture && canvas.setPointerCapture(e.pointerId);
    const now = performance.now(); if (now - lastTap < 300) { sc.setView(sc.defaultView()); markView(); kick(); } lastTap = now; });
  canvas.addEventListener('pointermove', (e) => {
    const p = ptr.get(e.pointerId); if (!p) return;
    if (ptr.size === 2) { p.x = e.clientX; p.y = e.clientY; const [a, b] = [...ptr.values()]; const d = Math.hypot(a.x - b.x, a.y - b.y); if (pinch0) sc.zoom = clamp(zoom0 * d / pinch0, 0.6, 3); kick(); return; }
    const dx = e.clientX - p.x, dy = e.clientY - p.y; p.x = e.clientX; p.y = e.clientY;
    sc.yaw -= dx * 0.012; if (e.pointerType === 'mouse') sc.pitch = clamp(sc.pitch + dy * 0.008, -0.35, 1.25);
    if (sc.view) { sc.view = null; markView(); }
    kick();
  });
  const up = (e) => { ptr.delete(e.pointerId); if (ptr.size < 2) pinch0 = 0; };
  canvas.addEventListener('pointerup', up); canvas.addEventListener('pointercancel', up); canvas.addEventListener('pointerleave', up);
  canvas.addEventListener('wheel', (e) => { if (!e.ctrlKey && !e.metaKey) return; e.preventDefault(); sc.zoom = clamp(sc.zoom * Math.exp(-e.deltaY * 0.01), 0.6, 3); kick(); }, { passive: false });
  // Schleife
  let raf = 0, visible = true;
  const io = 'IntersectionObserver' in window ? new IntersectionObserver((en) => { visible = en[0].isIntersecting; if (visible) kick(); }) : null;
  io && io.observe(stage);
  function loop(now) {
    raf = 0;
    if (!el.isConnected) { live.kill(); return; }
    const dt = Math.min(0.1, (now - st.last) / 1000); st.last = now;
    if (st.playing) st.u = (st.u + dt * PREF.speed / 3.0) % 1;
    if (st.spin) sc.yaw += dt * 0.45;
    const c = hold ? { t: 0, up: true } : (st.manualT !== null && !st.playing) ? { t: st.manualT, up: true } : looped ? { t: st.u, up: true } : cycle(st.u);
    sc.frame(c.t, st.playing ? 0.5 + 0.5 * Math.sin(now / 420) : 0.5);
    const w = stage.clientWidth, h = stage.clientHeight; sc.render(w, h);
    if (scrub && st.playing) scrub.value = String(Math.round(c.t * 1000));
    if (phase) phase.textContent = looped ? '' : c.t > 0.98 ? 'Umkehrpunkt' : c.t < 0.02 ? 'Start' : (!st.playing ? '' : c.up ? 'Hinweg' : 'Rückweg');
    if (visible && !document.hidden && (st.playing || st.spin)) raf = requestAnimationFrame(loop);
  }
  function kick() { if (raf === 0) { st.last = performance.now(); raf = requestAnimationFrame(loop); } }
  const onVis = () => { if (!document.hidden) kick(); };
  document.addEventListener('visibilitychange', onVis);
  const live = { el, kill() { if (raf) cancelAnimationFrame(raf); raf = -1; io && io.disconnect(); document.removeEventListener('visibilitychange', onVis); sc.dispose(); LIVE.delete(live); } };
  LIVE.add(live); if (!WATCH) WATCH = setInterval(sweep, 1500);
  kick();
  return true;
}

/** Vorschaubild (für das Build-Skript) */
export async function thumb(canvas, patKey, eq, t, size, url = '/3d/body.glb') {
  const model = await loadModel(url);
  const sc = new Scene3D(canvas, { preserve: true, maxDpr: 1, shadowSize: 1024 }); const fig = new Figure(model); sc.setFigure(fig);
  await sc.setExercise(patKey, eq, [], [], '#00a86b'); sc.floor.visible = false;
  sc.frame(t, 0); sc.fitCurrent(1.04); sc.render(size, size); return sc;
}
