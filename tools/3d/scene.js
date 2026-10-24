/* Iron Ladder – 3D-Szene: Studio-Licht, Boden, Geräte (GLB aus Blender), bewegliche Teile, Kamera. */
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { PATTERNS, resolvePattern } from './poses.js';

const DEG = Math.PI / 180;
const V3 = (a) => new THREE.Vector3(a[0], a[1], a[2]);
const clamp = (x, a, b) => Math.max(a, Math.min(b, x));

/* ---------- Geräte laden ---------- */
let BASE = '/3d/';
export function setBase(b) { BASE = b; }
const EQ_CACHE = new Map();
function loadEq(name, ver) {
  if (!EQ_CACHE.has(name)) {
    const l = new GLTFLoader(); l.setMeshoptDecoder(MeshoptDecoder);
    EQ_CACHE.set(name, l.loadAsync(`${BASE}eq/${name}.glb${ver ? '?v=' + ver : ''}`).catch((e) => { EQ_CACHE.delete(name); throw e; }));
  }
  return EQ_CACHE.get(name);
}
function instance(gltf) {
  const o = gltf.scene.clone(true);
  o.traverse((m) => { if (m.isMesh) { m.castShadow = true; m.receiveShadow = true; } });
  const nodes = {}; o.traverse((n) => { if (n.name) nodes[n.name] = n; });
  return { root: o, nodes };
}

/* ---------- Boden-Textur (Gummigranulat) ---------- */
function floorTexture(dark) {
  const c = document.createElement('canvas'); c.width = c.height = 512; const x = c.getContext('2d');
  const base = dark ? [34, 35, 38] : [206, 206, 210];
  x.fillStyle = `rgb(${base})`; x.fillRect(0, 0, 512, 512);
  let seed = 7; const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
  for (let i = 0; i < 30000; i++) {
    const d = (rnd() - 0.5) * (dark ? 34 : 26) + (rnd() < 0.03 ? (dark ? 40 : -50) : 0);
    x.fillStyle = `rgba(${base.map((v) => Math.round(v + d))},${0.5 + rnd() * 0.5})`; const s = 0.8 + rnd() * 1.6; x.fillRect(rnd() * 512, rnd() * 512, s, s);
  }
  x.strokeStyle = dark ? 'rgba(0,0,0,.6)' : 'rgba(0,0,0,.12)'; x.lineWidth = 2; x.strokeRect(1, 1, 510, 510);
  const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(5, 5); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4;
  return t;
}
function fadeTexture() {
  const c = document.createElement('canvas'); c.width = c.height = 256; const x = c.getContext('2d');
  const g = x.createRadialGradient(128, 128, 10, 128, 128, 128); g.addColorStop(0, '#fff'); g.addColorStop(0.35, '#fff'); g.addColorStop(0.75, '#555'); g.addColorStop(1, '#000');
  x.fillStyle = g; x.fillRect(0, 0, 256, 256); return new THREE.CanvasTexture(c);
}

export class Scene3D {
  constructor(canvas, opts = {}) {
    this.dark = !!opts.dark; this.ver = opts.ver || '';
    const r = this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, preserveDrawingBuffer: !!opts.preserve });
    r.setPixelRatio(Math.min(window.devicePixelRatio || 1, opts.maxDpr || 2));
    r.outputColorSpace = THREE.SRGBColorSpace; r.toneMapping = THREE.NeutralToneMapping; r.toneMappingExposure = 1.0;
    r.shadowMap.enabled = opts.shadows !== false; r.shadowMap.type = THREE.PCFShadowMap;
    const sc = this.scene = new THREE.Scene();
    const pm = new THREE.PMREMGenerator(r); sc.environment = pm.fromScene(new RoomEnvironment(), 0.04).texture; sc.environmentIntensity = this.dark ? 0.55 : 0.7; pm.dispose();
    this.cam = new THREE.PerspectiveCamera(28, 1, 0.05, 60);
    const key = this.key = new THREE.DirectionalLight(0xffffff, 2.0); key.position.set(2.2, 4.5, 2.8); key.castShadow = true;
    key.shadow.mapSize.set(opts.shadowSize || 2048, opts.shadowSize || 2048); key.shadow.bias = -0.0004; key.shadow.normalBias = 0.02; key.shadow.radius = 4;
    sc.add(key); sc.add(key.target);
    const rim = new THREE.DirectionalLight(0xe6eeff, 1.1); rim.position.set(-3, 2.6, -3.2); sc.add(rim);
    // Boden
    const fm = new THREE.MeshStandardMaterial({ map: floorTexture(this.dark), roughness: 0.92, metalness: 0, transparent: true, alphaMap: fadeTexture(), depthWrite: false });
    this.floor = new THREE.Mesh(new THREE.CircleGeometry(2.4, 64), fm); this.floor.rotation.x = -Math.PI / 2; this.floor.receiveShadow = true; sc.add(this.floor);
    this.floor.material.map.rotation = 0;
    this.yaw = 0; this.pitch = 0.1; this.zoom = 1; this.target = new THREE.Vector3(0, 0.9, 0); this.fitR = 1.2;
    this.dyn = new THREE.Group(); sc.add(this.dyn);
    this.eq = []; this.view = 'side';
  }

  setFigure(fig) { if (this.fig) this.scene.remove(this.fig.scene); this.fig = fig; this.scene.add(fig.scene); }

  /** Übung setzen: Muster + Equipment der Übung; lädt Geräte. */
  async setExercise(patKey, eqKind, prim, sec, accent) {
    const pat = resolvePattern(patKey, eqKind);
    this.pat = pat; const fig = this.fig;
    if (accent) fig.uni.uAccent.value.set(accent);
    fig.setHighlight(prim, sec);
    // Geräte laden
    const names = new Set((pat.eq || []).map((e) => e.m));
    if (pat.hold) names.add(pat.hold === 'db2' || pat.hold === 'dbL' || pat.hold === 'dbMid' ? 'dumbbell' : pat.hold === 'kb' ? 'kettlebell' : pat.hold);
    if (pat.cable && pat.cable.handle) names.add(pat.cable.handle);
    if (pat.lever) names.add('dhandle');
    names.delete('smith-bar'); names.delete(undefined); names.delete('');
    const loaded = {}; await Promise.all([...names].map((n) => loadEq(n, this.ver).then((g) => { loaded[n] = g; })));
    // Alte Geräte entfernen
    for (const e of this.eq) this.scene.remove(e.root);
    this.dyn.clear(); this.eq = []; this.held = {};
    for (const e of pat.eq || []) {
      const inst = instance(loaded[e.m]); inst.def = e;
      inst.root.position.copy(V3(e.p || [0, 0, 0])); inst.root.rotation.set((e.rx || 0) * DEG, (e.ry || 0) * DEG, 0);
      if (e.back !== undefined && inst.nodes.back) inst.nodes.back.rotation.x = e.back * DEG;
      if (e.car !== undefined && inst.nodes.carriage) inst.nodes.carriage.position.y = e.car;
      this.scene.add(inst.root); this.eq.push(inst);
      inst.rest = {}; for (const k of ['stack', 'sled', 'arm', 'bar', 'padL', 'padR', 'crank']) if (inst.nodes[k]) inst.rest[k] = { p: inst.nodes[k].position.clone(), r: inst.nodes[k].rotation.clone() };
    }
    this.scene.updateMatrixWorld(true);
    const hold = pat.hold;
    const add = (n) => { const i = instance(loaded[n]); this.dyn.add(i.root); return i; };
    if (hold === 'barbell' || hold === 'barbell2' || hold === 'ezbar' || hold === 'abwheel') this.held.bar = add(hold);
    if (hold === 'db2') { this.held.dbL = add('dumbbell'); this.held.dbR = add('dumbbell'); }
    if (hold === 'dbL') this.held.dbL = add('dumbbell');
    if (hold === 'dbMid') this.held.dbMid = add('dumbbell');
    if (hold === 'kb') this.held.kb = add('kettlebell');
    // Kabel
    this.cables = [];
    if (pat.cable) {
      const c = pat.cable; const n = c.each ? 2 : 1;
      for (let i = 0; i < n; i++) {
        const h = c.handle ? add(c.handle) : null;
        const tube = new THREE.Mesh(new THREE.CylinderGeometry(0.0035, 0.0035, 1, 8), new THREE.MeshStandardMaterial({ color: 0x141414, roughness: 0.6 }));
        tube.castShadow = true; this.dyn.add(tube);
        this.cables.push({ h, tube, side: n === 2 ? (i === 0 ? 'L' : 'R') : null });
      }
    }
    // Hebel für Maschinengriffe
    this.levers = [];
    if (pat.lever) for (const s of ['L', 'R']) {
      const h = add('dhandle'); const arm = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.05, 1), new THREE.MeshStandardMaterial({ color: 0x2a2c30, roughness: 0.4, metalness: 0.3 }));
      arm.castShadow = true; this.dyn.add(arm); this.levers.push({ s, h, arm });
    }
    // 'fit' (gestreckte Arme/Beine) einmal je Pose ausrechnen, damit die Bewegung stetig bleibt
    for (const key of ['_A', '_B']) {
      const pose = pat[key]; if (!pose.fit) continue;
      const one = Object.assign({}, pat, { _A: pose, _B: pose, _EA: null, _EB: null, dyn: pat.dyn });
      fig.apply(one, 0); pat[key] = Object.assign({}, pose, { p: fig.rootPos.toArray(), fit: null });
    }
    pat._EA = pat._EB = null;
    // Ausgangslängen der Kabel (für den Gewichtsblock)
    this._minCable = null;
    const lens = []; for (const t of [0, 0.5, 1]) { fig.apply(pat, t); this._update(true); lens.push(this._cableLen); }
    this._minCable = Math.min(...lens);
    // Kamera einpassen über die Bewegung
    const box = new THREE.Box3();
    for (const t of [0, 0.25, 0.5, 0.75, 1]) { fig.apply(pat, t); this._update(); fig.mesh.skeleton.update(); box.expandByObject(fig.mesh, true); box.expandByObject(this.dyn); }
    for (const e of this.eq) e.root.traverse((o) => { if (o.isMesh && !(e.def.nofit)) box.expandByObject(o); });
    fig.apply(pat, 0); this._update();
    const ctr = box.getCenter(new THREE.Vector3()), size = box.getSize(new THREE.Vector3());
    this.box = box; this.target.copy(ctr); this.fitR = Math.max(size.y * 0.58, Math.hypot(size.x, size.z) * 0.5, 0.6);
    // Schatten-Kamera passend
    const k = this.key; const R = Math.max(size.x, size.y, size.z) * 0.75 + 0.3;
    k.target.position.copy(ctr); k.position.copy(ctr).add(new THREE.Vector3(1.6, 3.6, 2.2));
    Object.assign(k.shadow.camera, { left: -R, right: R, top: R, bottom: -R, near: 0.1, far: 12 }); k.shadow.camera.updateProjectionMatrix();
    this.floor.position.set(ctr.x, 0, ctr.z);
    this.setView(this.defaultView());
    return pat;
  }

  setView(v) { const V = { side: [Math.PI / 2, 0.08], front: [0, 0.08], back: [Math.PI, 0.12], tq: [0.72, 0.18], oblique: [1.05, 0.16], high: [0.62, 0.42] }[v] || [0.72, 0.18]; this.yaw = V[0]; this.pitch = V[1]; this.zoom = 1; this.view = v; }
  defaultView() { return this.pat.view || 'tq'; }

  /** Bewegliche Teile und Handgeräte an die Figur koppeln */
  _update(measure) {
    const fig = this.fig, pat = this.pat, H = this.held || {};
    const GL = fig.G.L, GR = fig.G.R; const mid = GL.clone().add(GR).multiplyScalar(0.5);
    const axis = GL.clone().sub(GR); const ax = axis.lengthSq() > 0.01 ? axis.normalize() : new THREE.Vector3(1, 0, 0);
    const orientX = (o, x, upHint) => { const X = x.clone().normalize(); let Y = (upHint || new THREE.Vector3(0, 1, 0)).clone(); Y.addScaledVector(X, -Y.dot(X)); if (Y.lengthSq() < 1e-6) Y.set(0, 0, 1).addScaledVector(X, -X.z); Y.normalize(); const Z = X.clone().cross(Y); o.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(X, Y, Z)); };
    if (H.bar) { H.bar.root.position.copy(pat.hold === 'abwheel' ? mid.clone().setY(0.092) : mid); orientX(H.bar.root, ax); }
    if (H.dbL) { H.dbL.root.position.copy(GL); orientX(H.dbL.root, fig.T.L); }
    if (H.dbR) { H.dbR.root.position.copy(GR); orientX(H.dbR.root, fig.T.R); }
    if (H.dbMid) { H.dbMid.root.position.copy(mid); orientX(H.dbMid.root, ax); }
    if (H.kb) { H.kb.root.position.copy(mid); orientX(H.kb.root, ax, new THREE.Vector3(0, 1, 0)); }
    // Geräteknoten
    let cableLen = 0;
    for (const e of this.eq) {
      const n = e.nodes, d = e.def;
      if (n.bar && pat.hold === 'smith') { // Multipresse: Stange folgt den Händen
        const lp = e.root.worldToLocal(mid.clone()); n.bar.position.set(0, lp.y, e.rest.bar.p.z);
      }
      if (n.sled && d.sled) { // Beinpresse: Fußplatte folgt den Füßen entlang der Schiene
        const ax2 = new THREE.Vector3(0, Math.SQRT1_2, Math.SQRT1_2).applyQuaternion(e.root.quaternion);
        const feet = fig.J('toe.L').add(fig.J('toe.R')).add(fig.J('foot.L')).add(fig.J('foot.R')).multiplyScalar(0.25);
        const restC = e.root.localToWorld(e.rest.sled.p.clone());
        const s = feet.sub(restC).dot(ax2) - (d.sled.off || 0);
        n.sled.position.copy(e.rest.sled.p).add(new THREE.Vector3(0, Math.SQRT1_2, Math.SQRT1_2).multiplyScalar(s));
      }
      if (n.arm && d.arm) { // Hebel folgt dem Unterschenkel
        const piv = e.root.localToWorld(e.rest.arm.p.clone());
        const tgt = fig.J('foot.L').add(fig.J('foot.R')).multiplyScalar(0.5).lerp(fig.J('lowerleg01.L').add(fig.J('lowerleg01.R')).multiplyScalar(0.5), d.arm.at ?? 0.15);
        const sh = fig.J('foot.L').sub(fig.J('lowerleg01.L')).normalize(); const nrm = new THREE.Vector3(1, 0, 0).cross(sh).normalize();
        tgt.addScaledVector(nrm, d.arm.side === 'back' ? 0.075 : -0.075);
        const lt = e.root.worldToLocal(tgt).sub(e.rest.arm.p);
        const want = Math.atan2(lt.z, -lt.y), rest = Math.atan2(d.arm.rz, -d.arm.ry);
        n.arm.rotation.x = -(want - rest);
      }
      if (n.padL && d.pads) for (const s of ['L', 'R']) { // Abduktoren: Polster folgen den Knien
        const k = e.root.worldToLocal(fig.J('lowerleg01.' + s)); const p = e.rest['pad' + s].p;
        n['pad' + s].rotation.y = Math.atan2(k.x - p.x, k.z - p.z) - (s === 'L' ? 0.2 : -0.2);
      }
      if (n.crank && pat.crank) n.crank.rotation.x = -this._t * 2 * Math.PI;
    }
    // Kabel
    for (const c of this.cables || []) {
      const C = pat.cable; let start, dirUp;
      const src = (c.side === 'R' && C.from2) ? C.from2 : C.from; const e = this.eq.find((x) => x.def.id === src.id) || this.eq[0];
      const pul = e.root.localToWorld(V3(src.p).add(src.node && e.nodes[src.node] ? e.nodes[src.node].position : new THREE.Vector3()));
      if (C.ankle) start = fig.J('foot.' + C.ankle).add(new THREE.Vector3(0, 0.03, 0));
      else if (c.side) start = c.side === 'L' ? GL.clone() : GR.clone();
      else start = mid.clone();
      if (c.h) {
        const toP = pul.clone().sub(start).normalize();
        if (c.side || !C.wide) orientX(c.h.root, c.side ? fig.T[c.side] : ax, toP); else orientX(c.h.root, ax, toP);
        c.h.root.position.copy(start); c.h.root.updateMatrixWorld(true);
        const hk = c.h.nodes.hook; if (hk) start = hk.getWorldPosition(new THREE.Vector3());
      }
      const d = pul.clone().sub(start); const L = d.length(); cableLen += L;
      c.tube.position.copy(start).addScaledVector(d, 0.5); c.tube.scale.set(1, L, 1); c.tube.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.normalize());
    }
    this._cableLen = cableLen;
    if (!measure && this._minCable !== null) for (const e of this.eq) if (e.nodes.stack && e.def.stack !== false) e.nodes.stack.position.y = e.rest.stack.p.y + clamp((cableLen - this._minCable) * (e.def.ratio ?? 0.5), 0, 0.6);
    // Maschinenhebel
    for (const lv of this.levers || []) {
      const G = lv.s === 'L' ? GL : GR; const pv = V3(pat.lever.pivot); if (lv.s === 'R') pv.x = -pv.x;
      orientX(lv.h.root, fig.T[lv.s], G.clone().sub(pv)); lv.h.root.position.copy(G); lv.h.root.updateMatrixWorld(true);
      const hk = lv.h.nodes.hook.getWorldPosition(new THREE.Vector3()); const d = hk.clone().sub(pv); const L = d.length();
      lv.arm.position.copy(pv).addScaledVector(d, 0.5); lv.arm.scale.set(1, 1, L); lv.arm.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), d.normalize());
    }
  }

  frame(t, pulse) { this._t = t; this.fig.apply(this.pat, t); this._update(); this.fig.uni.uPulse.value = pulse || 0; }

  fitCurrent(pad = 1) {
    const b = new THREE.Box3(); this.fig.mesh.skeleton.update(); b.expandByObject(this.fig.mesh, true); b.expandByObject(this.dyn);
    for (const e of this.eq) if (!e.def.nofit) e.root.traverse((o) => { if (o.isMesh) b.expandByObject(o); });
    const c = b.getCenter(new THREE.Vector3()), s = b.getSize(new THREE.Vector3());
    const right = new THREE.Vector3(Math.cos(this.yaw), 0, -Math.sin(this.yaw));
    const pts = []; for (const x of [b.min.x, b.max.x]) for (const z of [b.min.z, b.max.z]) pts.push(x * right.x + z * right.z);
    this.target.copy(c); this.fitR = Math.max(s.y, Math.max(...pts) - Math.min(...pts)) * 0.5 * pad;
  }

  render(w, h) {
    if (w && h && (this._w !== w || this._h !== h)) { this.renderer.setSize(w, h, false); this.cam.aspect = w / h; this.cam.updateProjectionMatrix(); this._w = w; this._h = h; }
    const fovV = this.cam.fov * DEG; const fovH = 2 * Math.atan(Math.tan(fovV / 2) * this.cam.aspect);
    const d = (this.fitR / Math.sin(Math.min(fovV, fovH) / 2)) * 0.98 / this.zoom;
    const cp = Math.cos(this.pitch);
    this.cam.position.set(this.target.x + Math.sin(this.yaw) * cp * d, Math.max(0.05, this.target.y + Math.sin(this.pitch) * d), this.target.z + Math.cos(this.yaw) * cp * d);
    this.cam.lookAt(this.target);
    this.renderer.render(this.scene, this.cam);
  }

  dispose() { this.renderer.dispose(); this.renderer.forceContextLoss && this.renderer.forceContextLoss(); }
}
