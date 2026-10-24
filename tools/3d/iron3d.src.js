/* Iron Ladder – 3D-Übungsansicht (three.js).
 * Gebaut mit esbuild zu /3d/iron3d.js (siehe tools/3d/build.mjs).
 * Modell: /3d/body.glb (MakeHuman CC0, in Blender aufbereitet, Muskelregionen im Farbattribut).
 */
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js';
import { PATTERNS, PROP_OF } from './poses.js';

export { PATTERNS };
const REGIONS = ['none', 'chest_up', 'chest_mid', 'chest_low', 'lats', 'upback', 'traps', 'lower',
  'delt_front', 'delt_side', 'delt_rear', 'biceps', 'triceps', 'forearms',
  'abs', 'obliques', 'quads', 'hams', 'glutes', 'adductors', 'calves'];
const DEG = Math.PI / 180;
const v3 = (a) => new THREE.Vector3(a[0], a[1], a[2]);
const tmpV = new THREE.Vector3(), tmpV2 = new THREE.Vector3(), tmpQ = new THREE.Quaternion();
const qAxis = (axis, ang) => new THREE.Quaternion().setFromAxisAngle(axis, ang);
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

/* ---------------- Rig ---------------- */
const SIDES = ['L', 'R'];
const bname = (n) => n.replace(/[\[\]\.:\/]/g, ''); // three.js säubert Knotennamen

class Rig {
  constructor(root) {
    this.root = root; this.b = {};
    root.traverse((o) => { if (o.isBone) this.b[o.name] = o; });
    this.get = (n) => this.b[bname(n)];
    root.updateMatrixWorld(true);
    this.order = []; const walk = (o) => { if (o.isBone) this.order.push(o); o.children.forEach(walk); };
    walk(root);
    this.rest = new Map();
    for (const bo of this.order) {
      const q = new THREE.Quaternion(), p = new THREE.Vector3();
      bo.getWorldQuaternion(q); bo.getWorldPosition(p);
      this.rest.set(bo, { q, p, lq: bo.quaternion.clone(), lp: bo.position.clone() });
    }
    const P = (n) => this.rest.get(this.get(n)).p.clone();
    this.R = {}; // Ruhe-Richtungen
    for (const s of SIDES) {
      const sh = P('upperarm01.' + s), el = P('lowerarm01.' + s), wr = P('wrist.' + s);
      const hip = P('upperleg01.' + s), kn = P('lowerleg01.' + s), an = P('foot.' + s), toe = P('toe.' + s);
      const u = el.clone().sub(sh).normalize(), f = wr.clone().sub(el).normalize();
      const th = kn.clone().sub(hip).normalize(), shn = an.clone().sub(kn).normalize();
      const kneeAx = new THREE.Vector3(1, 0, 0).projectOnPlane(th).normalize();
      // Handfläche: Normale aus Zeige- und Kleinfinger-Ansatz
      const i1 = P('finger2-1.' + s), p1 = P('finger5-1.' + s);
      let palm = i1.clone().sub(wr).cross(p1.clone().sub(wr)).normalize(); if (s === 'R') palm.negate();
      // Handfläche zeigt bei der A-Pose zum Körper/nach hinten – Vorzeichen so, dass sie von der Faust weg zeigt
      this.R[s] = { u, f, elbowAx: u.clone().cross(f).normalize(), th, shn, kneeAx, foot: toe.clone().sub(an).normalize(), palm,
        ankleH: an.y, toeH: toe.y };
    }
    this.restRoot = P('root');
  }
}

/* ---------------- Posen-Mathematik ---------------- */
function mirrorDir(d) { return d && typeof d !== 'string' ? [-d[0], d[1], d[2], d[3]] : d; }
function sidePose(pose, key, s) {
  const k = key + s; if (pose[k] !== undefined) return pose[k];
  const v = pose[key]; return s === 'R' ? mirrorDir(v) : v;
}
const lerp = (a, b, t) => a + (b - a) * t;
function lerpArr(a, b, t) { if (!a) return b; if (!b) return a; return a.map((x, i) => (typeof x === 'number' ? lerp(x, b[i], t) : (t < 0.5 ? x : b[i]))); }

/** Swing-Rotation, die Vektor a auf b dreht */
const swing = (a, b) => new THREE.Quaternion().setFromUnitVectors(a.clone().normalize(), b.clone().normalize());
function signedAngle(a, b, axis) { const c = tmpV.copy(a).cross(b); return Math.atan2(c.dot(axis), a.dot(b)); }

export class Figure {
  constructor(model) {
    this.model = model;
    // Eigene Kopie der Szene (SkeletonUtils-frei: Modell nur einmal je Ansicht verwendet)
    const src = model.gltf.scene;
    this.scene = cloneSkinned(src);
    this.mesh = null; this.scene.traverse((o) => { if (o.isSkinnedMesh) this.mesh = o; });
    this.mesh.frustumCulled = false;
    this.rig = new Rig(this.scene);
    const n = this.mesh.geometry.attributes.position.count;
    this.hl = new Float32Array(n);
    this.mesh.geometry = this.mesh.geometry.clone();
    this.mesh.geometry.setAttribute('hl', new THREE.BufferAttribute(this.hl, 1));
    this.uni = { uAccent: { value: new THREE.Color('#00a86b') }, uPulse: { value: 0 }, uSec: { value: 0.5 } };
    const mat = new THREE.MeshStandardMaterial({ color: 0xc4bfb9, roughness: 0.62, metalness: 0.0 });
    mat.onBeforeCompile = (sh) => {
      Object.assign(sh.uniforms, this.uni);
      sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nattribute float hl;\nvarying float vHl;')
        .replace('#include <begin_vertex>', '#include <begin_vertex>\nvHl = hl;');
      sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nuniform vec3 uAccent;\nuniform float uPulse;\nvarying float vHl;')
        .replace('#include <color_fragment>', '#include <color_fragment>\nfloat hk = smoothstep(0.0, 1.0, vHl);\ndiffuseColor.rgb = mix(diffuseColor.rgb, uAccent, clamp(hk * 1.05, 0.0, 1.0));')
        .replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\ntotalEmissiveRadiance += uAccent * hk * (0.10 + 0.22 * uPulse);');
    };
    this.mesh.material = mat;
    this.props = new THREE.Group(); this.scene.add(this.props);
    this.fist = { L: new THREE.Vector3(), R: new THREE.Vector3() }; this.gripAx = { L: new THREE.Vector3(), R: new THREE.Vector3() };
  }

  setHighlight(prim, sec) {
    const { region, off, adj } = this.model; const hl = this.hl; const n = hl.length;
    const P = new Set(prim || []), Sx = new Set(sec || []);
    for (let i = 0; i < n; i++) { const r = REGIONS[region[i]]; hl[i] = P.has(r) ? 1 : Sx.has(r) ? 0.5 : 0; }
    const tmp = new Float32Array(n);
    for (let pass = 0; pass < 3; pass++) {
      for (let i = 0; i < n; i++) { let s = 0; const a = off[i], b = off[i + 1]; for (let k = a; k < b; k++) s += hl[adj[k]]; tmp[i] = b > a ? 0.5 * hl[i] + 0.5 * s / (b - a) : hl[i]; }
      hl.set(tmp);
    }
    this.mesh.geometry.attributes.hl.needsUpdate = true;
  }

  /** Pose t (0 = a, 1 = b) eines Musters anwenden */
  apply(pat, t) {
    const A = pat._A, B = pat._B; const rig = this.rig;
    const DEF = { r: [0, 0, 0], sp: [0, 0, 0], hd: 0, el: 0, pr: 0, g: pat.g ?? 1 };
    const g = (k) => {
      const a = A[k] !== undefined ? A[k] : DEF[k], b = B[k] !== undefined ? B[k] : a;
      if (a === undefined) return b;
      return Array.isArray(a) ? lerpArr(a, b, t) : (typeof a === 'number' ? lerp(a, b, t) : (t < 0.5 ? a : b));
    };
    const r = g('r') || [0, 0, 0], sp = g('sp') || [0, 0, 0], hd = g('hd') || 0, el = g('el') || 0;
    const grip = g('g'), pr = g('pr');
    const Qb = new THREE.Quaternion().setFromEuler(new THREE.Euler(r[0] * DEG, r[1] * DEG, r[2] * DEG, 'YXZ'));
    const Qyaw = qAxis(new THREE.Vector3(0, 1, 0), r[1] * DEG);
    const D = new Map(); // Bone -> Delta (Welt)
    const setD = (n, q) => D.set(rig.get(n), q);
    const parentD = (bo) => { let p = bo.parent; while (p && !D.has(p)) p = p.parent; return p ? D.get(p) : new THREE.Quaternion(); };
    setD('root', Qb.clone());
    const sb = ['spine05', 'spine04', 'spine03', 'spine02', 'spine01'];
    const spineQ = (f) => new THREE.Quaternion().setFromEuler(new THREE.Euler(sp[0] * DEG * f, sp[2] * DEG * f, -sp[1] * DEG * f, 'YXZ'));
    sb.forEach((n, i) => setD(n, Qb.clone().multiply(spineQ((i + 1) / sb.length))));
    const Dc = D.get(rig.get('spine01')).clone();
    const Dp = Qb.clone();
    ['neck01', 'neck02', 'neck03', 'head'].forEach((n, i) => setD(n, Dc.clone().multiply(qAxis(new THREE.Vector3(1, 0, 0), hd * DEG * (i + 1) / 4))));
    const frameQ = (fr) => (fr === 'w' ? new THREE.Quaternion() : fr === 'p' ? Dp : Dc);
    const dirOf = (key, s, defFrame) => {
      const kA = A[key + s] !== undefined || A[key] !== undefined, kB = B[key + s] !== undefined || B[key] !== undefined;
      const da = sidePose(A, key, s), db = kB ? sidePose(B, key, s) : da;
      if (!da && !db) return null;
      const one = (d) => (d && typeof d !== 'string') ? v3(d).normalize().applyQuaternion(frameQ(d[3] || defFrame)) : null;
      if (typeof da === 'string' || typeof db === 'string') return t < 0.5 ? (typeof da === 'string' ? da : one(da)) : (typeof db === 'string' ? db : one(db));
      const wa = one(da), wb = one(db);
      return wa.lerp(wb, t).normalize();
    };
    for (const s of SIDES) {
      const sg = s === 'L' ? 1 : -1; const RS = rig.R[s];
      // Schlüsselbein / Schulter (Shrug)
      const Dcl = Dc.clone().multiply(qAxis(new THREE.Vector3(0, 0, 1), sg * el * DEG));
      setD('clavicle.' + s, Dcl); setD('shoulder01.' + s, Dcl);
      // Arm: Oberarm-Richtung + Ellbogen als Scharnier
      const u = dirOf('ua', s, 'c'), f = dirOf('fa', s, 'c');
      if (u && f) {
        const carried = RS.u.clone().applyQuaternion(Dcl);
        const S = swing(carried, u).multiply(Dcl);
        const restAx = RS.elbowAx.clone().applyQuaternion(S);
        const pole = new THREE.Vector3(0, 0, 1).applyQuaternion(Dc);
        let ax = u.clone().cross(f); const k = ax.length();
        ax.add(u.clone().cross(pole).normalize().multiplyScalar(0.12)).normalize();
        if (k < 1e-4 && ax.lengthSq() < 1e-6) ax.copy(restAx);
        const tw = signedAngle(restAx.clone().projectOnPlane(u).normalize(), ax.clone().projectOnPlane(u).normalize(), u);
        const Dua = qAxis(u, tw).multiply(S);
        setD('upperarm01.' + s, Dua); setD('upperarm02.' + s, Dua);
        const fc = RS.f.clone().applyQuaternion(Dua);
        const bend = signedAngle(fc, f, ax);
        const Dfa = qAxis(ax, bend).multiply(Dua);
        setD('lowerarm01.' + s, Dfa);
        const Dpr = qAxis(f, sg * pr * DEG * 0.5).multiply(Dfa);
        setD('lowerarm02.' + s, Dpr);
        setD('wrist.' + s, qAxis(f, sg * pr * DEG * 0.5).multiply(Dpr));
      }
      // Finger: Griff
      const Dw = D.get(rig.get('wrist.' + s)) || parentD(rig.get('wrist.' + s));
      const palm = RS.palm.clone().applyQuaternion(Dw);
      for (let fi = 1; fi <= 5; fi++) {
        let Dprev = Dw;
        for (let k = 1; k <= 3; k++) {
          const bo = rig.get(`finger${fi}-${k}.${s}`); if (!bo) continue;
          const ch = bo.children.find((c) => c.isBone); const rp = rig.rest.get(bo).p;
          const tip = ch ? rig.rest.get(ch).p : null; if (!tip) { D.set(bo, Dprev); continue; }
          const dir = tip.clone().sub(rp).normalize().applyQuaternion(Dprev);
          const ax = dir.clone().cross(palm).normalize();
          const amt = fi === 1 ? [0.25, 0.45, 0.35][k - 1] : [0.95, 1.15, 0.75][k - 1];
          const q = qAxis(ax, -sg * 0 + amt * grip * (fi === 1 ? 0.9 : 1.15)).multiply(Dprev);
          D.set(bo, q); Dprev = q;
        }
      }
      // Bein: Oberschenkel + Knie als Scharnier
      setD('pelvis.' + s, Dp);
      const th = dirOf('th', s, 'p'), shn = dirOf('sh', s, 'p');
      if (th && shn) {
        const carried = RS.th.clone().applyQuaternion(Dp);
        const S = swing(carried, th).multiply(Dp);
        const restAx = RS.kneeAx.clone().applyQuaternion(S);
        const pole = new THREE.Vector3(0, 0, -1).applyQuaternion(Dp);
        const ax = th.clone().cross(shn); ax.add(th.clone().cross(pole).normalize().multiplyScalar(0.12)).normalize();
        const tw = signedAngle(restAx.clone().projectOnPlane(th).normalize(), ax.clone().projectOnPlane(th).normalize(), th);
        const Dth = qAxis(th, tw).multiply(S);
        setD('upperleg01.' + s, Dth); setD('upperleg02.' + s, Dth);
        const sc = RS.shn.clone().applyQuaternion(Dth);
        const Dsh = qAxis(ax, signedAngle(sc, shn, ax)).multiply(Dth);
        setD('lowerleg01.' + s, Dsh); setD('lowerleg02.' + s, Dsh);
        // Fuß
        let ft = dirOf('ft', s, 'p');
        const fc = RS.foot.clone().applyQuaternion(Dsh);
        if (ft === 'rel') setD('foot.' + s, Dsh);
        else {
          if (!ft || ft === 'flat' || ft === 'flatout') { ft = RS.foot.clone().applyQuaternion(Qyaw); if (ft === 'flatout' || sidePose(A, 'ft', s) === 'flatout') ft.applyAxisAngle(new THREE.Vector3(0, 1, 0), sg * 18 * DEG); }
          const Df = swing(fc, ft).multiply(Dsh);
          // Fuß nicht verdrehen: Knöchelachse bleibt horizontal-ish
          setD('foot.' + s, Df);
        }
      }
    }
    // Lokale Rotationen setzen
    for (const bo of rig.order) {
      const rs = rig.rest.get(bo);
      const d = D.has(bo) ? D.get(bo) : parentD(bo);
      D.set(bo, d);
      const qw = d.clone().multiply(rs.q);
      const pq = bo.parent && bo.parent.isBone ? D.get(bo.parent).clone().multiply(rig.rest.get(bo.parent).q) : this._parentWorldQ(bo);
      bo.quaternion.copy(pq.invert().multiply(qw));
    }
    // Becken positionieren
    const rootB = rig.get('root');
    rootB.position.copy(rig.rest.get(rootB).lp);
    const p = g('p');
    this.scene.updateMatrixWorld(true);
    const gnd = pat.gnd || 'feet';
    const off = new THREE.Vector3();
    const J = (n) => rig.get(n).getWorldPosition(new THREE.Vector3());
    this._fists();
    const C = this._contacts(J);
    if (gnd === 'none') off.copy(v3(p || [0, 0.9, 0])).sub(J('root'));
    else if (gnd === 'feet') { off.set(-C.feet.x, -C.feet.y, -C.feet.z); }
    else if (gnd === 'feetY') { off.set(p ? p[0] : 0, -C.feet.y, p ? p[2] : 0); off.x -= J('root').x; off.z -= J('root').z; }
    else if (gnd === 'hands') { const h = pat.hang; off.set(h[0] - C.hands.x, h[1] - (this.fist.L.y + this.fist.R.y) / 2, h[2] - C.hands.z); }
    else if (gnd === 'knees') { off.set(-C.knees.x, -C.knees.y, -C.knees.z); }
    else if (gnd === 'footL' || gnd === 'footR') { const c = C[gnd]; const tg = pat.footAt || [gnd === 'footL' ? 0.1 : -0.1, pat.footY || 0, 0]; off.set(tg[0] - c.x, tg[1] - c.y, tg[2] - c.z); }
    else if (gnd === 'contact') {
      const ys = (pat.contact || ['feet']).map((k) => C[k].y); const my = Math.min(...ys);
      const ax = pat.anchorXZ ? C[pat.anchorXZ] : J('root');
      off.set(-ax.x, -my, -ax.z);
    }
    const parentInv = new THREE.Matrix4().copy(rootB.parent.matrixWorld).invert();
    const wp = J('root').add(off).applyMatrix4(parentInv);
    rootB.position.copy(wp);
    this.scene.updateMatrixWorld(true);
    this._fists();
    this.J = J;
  }

  _parentWorldQ(bo) { const q = new THREE.Quaternion(); if (bo.parent) bo.parent.getWorldQuaternion(q); return q; }

  _fists() {
    const rig = this.rig;
    for (const s of SIDES) {
      const w = rig.get('wrist.' + s).getWorldPosition(new THREE.Vector3());
      const i1 = rig.get('finger2-1.' + s).getWorldPosition(new THREE.Vector3());
      const p1 = rig.get('finger5-1.' + s).getWorldPosition(new THREE.Vector3());
      const mid = i1.clone().add(p1).multiplyScalar(0.5);
      const pn = i1.clone().sub(w).cross(p1.clone().sub(w)).normalize(); if (s === 'R') pn.negate();
      this.fist[s].copy(w).lerp(mid, 1.25).addScaledVector(pn, -0.028);
      this.gripAx[s].copy(i1).sub(p1).normalize();
      this.palmN = this.palmN || {}; this.palmN[s] = pn;
    }
  }

  _contacts(J) {
    const R = this.rig.R; const c = {};
    const foot = (s) => { const a = J('foot.' + s), t = J('toe.' + s); return { y: Math.min(a.y - R[s].ankleH, t.y - R[s].toeH), x: (a.x + t.x) / 2, z: (a.z + t.z) / 2 }; };
    const fl = foot('L'), fr = foot('R');
    c.footL = fl; c.footR = fr;
    c.feet = { x: (fl.x + fr.x) / 2, y: Math.min(fl.y, fr.y), z: (fl.z + fr.z) / 2 };
    const hl = this.fist.L, hr = this.fist.R;
    c.hands = { x: (hl.x + hr.x) / 2, y: Math.min(hl.y, hr.y) - 0.035, z: (hl.z + hr.z) / 2 };
    const kl = J('lowerleg01.L'), kr = J('lowerleg01.R');
    c.knees = { x: (kl.x + kr.x) / 2, y: Math.min(kl.y, kr.y) - 0.055, z: (kl.z + kr.z) / 2 };
    const el = J('lowerarm01.L'), er = J('lowerarm01.R');
    c.elbows = { x: (el.x + er.x) / 2, y: Math.min(el.y, er.y) - 0.045, z: (el.z + er.z) / 2 };
    return c;
  }
}

/* SkinnedMesh sauber klonen (Knochen neu verknüpfen) */
function cloneSkinned(src) {
  const clone = src.clone(true);
  const srcB = {}, dstB = {};
  src.traverse((o) => { if (o.isBone) srcB[o.name] = o; });
  clone.traverse((o) => { if (o.isBone) dstB[o.name] = o; });
  clone.traverse((o) => {
    if (o.isSkinnedMesh) {
      const sk = o.skeleton; const bones = sk.bones.map((b) => dstB[b.name]);
      o.bind(new THREE.Skeleton(bones, sk.boneInverses), o.bindMatrix);
    }
  });
  return clone;
}

/* ---------------- Geräte ---------------- */
const M = {};
function mats(dark) {
  const k = dark ? 'd' : 'l';
  if (!M[k]) M[k] = {
    metal: new THREE.MeshStandardMaterial({ color: 0xa7adb5, roughness: 0.35, metalness: 0.8 }),
    plate: new THREE.MeshStandardMaterial({ color: dark ? 0x3a3a40 : 0x2c2c32, roughness: 0.55, metalness: 0.2 }),
    pad: new THREE.MeshStandardMaterial({ color: dark ? 0x4a4a52 : 0x3b3b43, roughness: 0.8 }),
    frame: new THREE.MeshStandardMaterial({ color: dark ? 0x6b6f78 : 0x5d6169, roughness: 0.5, metalness: 0.5 }),
    cable: new THREE.LineBasicMaterial({ color: dark ? 0xbbbbbb : 0x555555 }),
    shadow: null,
  };
  return M[k];
}
const cyl = (r, h, m, seg = 20) => new THREE.Mesh(new THREE.CylinderGeometry(r, r, h, seg), m);
const box = (w, h, d, m) => new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m);
function roundedBox(w, h, d, m) { const b = box(w, h, d, m); return b; }

function makeBarbell(m, len, plateR, nPlates) {
  const g = new THREE.Group();
  const bar = cyl(0.014, len, m.metal, 12); bar.rotation.z = Math.PI / 2; g.add(bar);
  for (const sgn of [-1, 1]) {
    const sleeve = cyl(0.025, len * 0.2, m.metal, 14); sleeve.rotation.z = Math.PI / 2; sleeve.position.x = sgn * len * 0.4; g.add(sleeve);
    for (let i = 0; i < nPlates; i++) {
      const r = plateR * (1 - i * 0.18); const pl = cyl(r, 0.045, m.plate, 28); pl.rotation.z = Math.PI / 2;
      pl.position.x = sgn * (len * 0.31 + i * 0.05); g.add(pl);
    }
  }
  return g;
}
function makeDumbbell(m) {
  const g = new THREE.Group();
  const h = cyl(0.016, 0.16, m.metal, 10); h.rotation.z = Math.PI / 2; g.add(h);
  for (const sgn of [-1, 1]) { const hd = cyl(0.058, 0.07, m.plate, 6); hd.rotation.z = Math.PI / 2; hd.position.x = sgn * 0.11; g.add(hd); }
  return g;
}
function makeKettlebell(m) {
  const g = new THREE.Group();
  const ball = new THREE.Mesh(new THREE.SphereGeometry(0.1, 24, 16), m.plate); ball.position.y = -0.13; g.add(ball);
  const hdl = new THREE.Mesh(new THREE.TorusGeometry(0.06, 0.012, 8, 20, Math.PI), m.plate); hdl.position.y = -0.04; g.add(hdl);
  return g;
}

export class Scene3D {
  constructor(canvas, opts = {}) {
    this.canvas = canvas; this.dark = !!opts.dark;
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, preserveDrawingBuffer: !!opts.preserve });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, opts.maxDpr || 2));
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.NeutralToneMapping;
    this.scene = new THREE.Scene();
    this.cam = new THREE.PerspectiveCamera(28, 1, 0.05, 60);
    const hemi = new THREE.HemisphereLight(0xffffff, this.dark ? 0x30303a : 0x8a8580, this.dark ? 1.5 : 1.7); this.scene.add(hemi);
    const key = new THREE.DirectionalLight(0xffffff, 2.1); key.position.set(2.5, 4, 3); this.scene.add(key);
    const rim = new THREE.DirectionalLight(0xdfe8ff, 1.2); rim.position.set(-3, 2.5, -3); this.scene.add(rim);
    const fill = new THREE.DirectionalLight(0xffffff, 0.5); fill.position.set(-2, 1, 3); this.scene.add(fill);
    this.yaw = 0; this.pitch = 0.08; this.zoom = 1; this.target = new THREE.Vector3(0, 0.9, 0); this.fitR = 1.2;
    // Bodenschatten
    const c = document.createElement('canvas'); c.width = c.height = 128; const x = c.getContext('2d');
    const gr = x.createRadialGradient(64, 64, 4, 64, 64, 64); gr.addColorStop(0, `rgba(0,0,0,${this.dark ? 0.55 : 0.28})`); gr.addColorStop(1, 'rgba(0,0,0,0)');
    x.fillStyle = gr; x.fillRect(0, 0, 128, 128);
    this.shadow = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(c), transparent: true, depthWrite: false }));
    this.shadow.rotation.x = -Math.PI / 2; this.shadow.position.y = 0.002; this.scene.add(this.shadow);
  }

  setFigure(fig) { if (this.fig) this.scene.remove(this.fig.scene); this.fig = fig; this.scene.add(fig.scene); }

  /** Muster + Equipment setzen und Kamera einpassen */
  setExercise(patKey, eq, prim, sec, accent) {
    const fig = this.fig; const key = PATTERNS[patKey + '@' + eq] ? patKey + '@' + eq : patKey;
    const pat = PATTERNS[key] || PATTERNS.ohp;
    pat._A = pat.a; pat._B = Object.assign({}, pat.a, pat.b || {});
    this.pat = pat; this.patKey = key; this.eq = eq;
    this.prop = pat.oneDB ? 'db' : (PROP_OF[eq] ?? '');
    if (accent) fig.uni.uAccent.value.set(accent);
    fig.setHighlight(prim, sec);
    // Kontur über beide Posen einpassen
    const box3 = new THREE.Box3();
    for (const t of [0, 0.5, 1]) { fig.apply(pat, t); fig.mesh.skeleton.update(); box3.expandByObject(fig.mesh, true); }
    fig.apply(pat, 0);
    this._buildProps();
    this._updateProps();
    this.propsStatic.traverse((o) => { if (o.isMesh && !o.userData.skipFit) box3.expandByObject(o); });
    const ctr = box3.getCenter(new THREE.Vector3()), size = box3.getSize(new THREE.Vector3());
    this.target.copy(ctr); this.fitR = Math.max(size.y * 0.62, Math.hypot(size.x, size.z) * 0.5, 0.6);
    this.shadow.position.x = ctr.x; this.shadow.position.z = ctr.z;
    this.shadow.scale.setScalar(Math.max(size.x, size.z, 0.7) * 1.35);
    this.setView(this.defaultView());
    return pat;
  }

  setView(v) { const V = { side: [Math.PI / 2, 0.06], front: [0, 0.06], back: [Math.PI, 0.1], tq: [0.72, 0.16], oblique: [1.05, 0.14], high: [0.62, 0.42] }[v] || [0.72, 0.16]; this.yaw = V[0]; this.pitch = V[1]; this.zoom = 1; this.view = v; }
  /** Empfohlene Startansicht: Langhantel schräg von vorn, damit die Scheiben den Körper nicht verdecken */
  defaultView() { const v = this.pat.view || 'side'; return (v === 'side' && ['bar', 'smith', 'ez'].includes(this.prop)) ? 'oblique' : v; }

  _buildProps() {
    const fig = this.fig, pat = this.pat, m = mats(this.dark);
    if (this.propsStatic) this.scene.remove(this.propsStatic);
    fig.props.clear();
    const st = new THREE.Group(); this.propsStatic = st; this.scene.add(st);
    const J = fig.J; const rootA = J('root');
    const addBox = (x, y, z, w, h, d, mt = m.pad) => { const b = box(w, h, d, mt); b.position.set(x, y, z); st.add(b); return b; };
    const post = (x, z, h, r = 0.022) => { const c = cyl(r, h, m.frame, 10); c.position.set(x, h / 2, z); st.add(c); return c; };
    for (const pr of pat.props || []) {
      const [k, ...a] = pr;
      if (k === 'bench') { const [x, top, zc, len, w] = a; addBox(x, top - 0.04, zc, w, 0.08, len); addBox(x, (top - 0.08) / 2, zc - len * 0.36, 0.08, top - 0.08, 0.06, m.frame); addBox(x, (top - 0.08) / 2, zc + len * 0.36, 0.08, top - 0.08, 0.06, m.frame); addBox(x, 0.015, zc, 0.36, 0.03, len * 0.85, m.frame); }
      if (k === 'ibench') {
        // Sitz unter dem Becken, Rückenlehne entlang des Rückens (aus Pose a)
        const sp = J('spine01'), rt = J('root');
        const dir = sp.clone().sub(rt).normalize(); const back = new THREE.Vector3(0, 0, 1).applyQuaternion(fig.rig.get('spine01').getWorldQuaternion(new THREE.Quaternion())).negate();
        const seatY = rt.y - 0.12; addBox(0, seatY - 0.04, rt.z + 0.12, 0.32, 0.08, 0.38);
        const len = 0.85; const c = rt.clone().addScaledVector(dir, len / 2 - 0.05).addScaledVector(back, 0.155);
        const bp = box(0.3, 0.08, len, m.pad); bp.position.copy(c); bp.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), dir); st.add(bp);
        addBox(0, (seatY - 0.08) / 2, rt.z + 0.1, 0.08, seatY - 0.08, 0.08, m.frame); addBox(0, 0.015, rt.z, 0.36, 0.03, 0.9, m.frame);
        const low = c.clone().addScaledVector(dir, -len / 2 + 0.05); const brace = cyl(0.025, 1, m.frame, 8); const top = c.clone().addScaledVector(dir, len * 0.25).addScaledVector(back, 0.05);
        const bot = new THREE.Vector3(0, 0.02, top.z); brace.position.copy(top).add(bot).multiplyScalar(0.5); brace.scale.y = top.distanceTo(bot); brace.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), top.clone().sub(bot).normalize()); st.add(brace);
      }
      if (k === 'seat') { const [x, top, zc, len, w] = a; addBox(x, top - 0.04, zc, w, 0.08, len); post(x, zc, top - 0.08, 0.035); addBox(x, 0.015, zc, 0.4, 0.03, 0.5, m.frame); }
      if (k === 'back') { const [x, top, zc, ang] = a; const bp = box(0.36, 0.7, 0.07, m.pad); bp.position.set(x, top + 0.38, zc); bp.rotation.x = -(90 - ang) * DEG; st.add(bp); }
      if (k === 'pad') { const [x, y, z] = a; const c = cyl(0.05, 0.36, m.pad, 16); c.rotation.z = Math.PI / 2; c.position.set(x, y, z); st.add(c); post(0.0, z + 0.25, y + 0.05); }
      if (k === 'block') { const [x, y, z, w, d, h] = a; addBox(x, y, z, w, h, d, m.pad); }
      if (k === 'pullbar') { const y = a[0]; const b = cyl(0.016, 1.5, m.metal, 12); b.rotation.z = Math.PI / 2; b.position.set(0, y, 0); st.add(b); post(0.75, -0.02, y + 0.05, 0.03).userData.skipFit = true; post(-0.75, -0.02, y + 0.05, 0.03).userData.skipFit = true; }
      if (k === 'dipbars') { const y = a[0]; const xs = Math.abs(fig.fist.L.x) + 0.0; for (const s of [-1, 1]) { const b = cyl(0.02, 0.6, m.metal, 12); b.rotation.x = Math.PI / 2; b.position.set(s * xs, y, 0.05); st.add(b); post(s * xs, 0.3, y, 0.028); post(s * xs, -0.2, y, 0.028); } }
      if (k === 'bike') {
        const rt = J('root'); addBox(0, rt.y - 0.12, rt.z - 0.02, 0.16, 0.05, 0.26);
        const tube = cyl(0.025, rt.y - 0.12, m.frame, 10); tube.position.set(0, (rt.y - 0.12) / 2, rt.z - 0.02); st.add(tube);
        const hb = cyl(0.016, 0.5, m.metal, 10); hb.rotation.z = Math.PI / 2; hb.position.set(0, fig.fist.L.y, fig.fist.L.z); st.add(hb);
        const col = cyl(0.03, fig.fist.L.y, m.frame, 10); col.position.set(0, fig.fist.L.y / 2, fig.fist.L.z - 0.05); st.add(col);
        const fly = cyl(0.25, 0.06, m.plate, 32); fly.rotation.z = Math.PI / 2; fly.position.set(0, 0.32, rt.z + 0.45); st.add(fly);
        addBox(0, 0.02, rt.z + 0.25, 0.4, 0.04, 1.0, m.frame);
      }
      if (k === 'hyper') {
        const rt = J('root'); const pad = cyl(0.07, 0.4, m.pad, 16); pad.rotation.z = Math.PI / 2; pad.position.set(0, rt.y - 0.02, rt.z + 0.1); st.add(pad);
        const an = J('foot.L'); const fp = cyl(0.045, 0.36, m.pad, 14); fp.rotation.z = Math.PI / 2; fp.position.set(0, an.y + 0.06, an.z - 0.06); st.add(fp);
        const bot = new THREE.Vector3(0, 0.03, an.z - 0.2), top = new THREE.Vector3(0, rt.y - 0.08, rt.z + 0.05);
        const fr = cyl(0.03, 1, m.frame, 8); fr.position.copy(top).add(bot).multiplyScalar(0.5); fr.scale.y = top.distanceTo(bot); fr.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), top.clone().sub(bot).normalize()); st.add(fr);
        addBox(0, 0.015, (an.z + rt.z) / 2, 0.4, 0.03, Math.abs(an.z - rt.z) + 0.5, m.frame);
      }
      if (k === 'ankbar') { const an = J('foot.L'); const b = cyl(0.04, 0.4, m.pad, 14); b.rotation.z = Math.PI / 2; b.position.set(0, an.y + 0.05, an.z - 0.07); st.add(b); }
    }
    // Kabelturm(e)
    const cab = pat.cable;
    if (cab && (this.prop === 'cable' || cab.ankle || cab.always || this.eq === 'KB')) {
      for (const an of cab.anchors) {
        const h = Math.max(an[1] + 0.15, 0.4); const col = box(0.08, h, 0.08, m.frame); col.userData.skipFit = true; col.position.set(an[0], h / 2, an[2] + 0.06 * Math.sign(an[2] || 1)); st.add(col);
        const pul = new THREE.Mesh(new THREE.SphereGeometry(0.035, 12, 8), m.metal); pul.position.set(an[0], an[1], an[2]); st.add(pul);
      }
      this._cableLines = [];
      const n = cab.each ? 2 : 1;
      for (let i = 0; i < n; i++) { const geo = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3()]); const ln = new THREE.Line(geo, m.cable); st.add(ln); this._cableLines.push(ln); }
    } else this._cableLines = null;
    // Handgeräte
    const P = fig.props; this._hand = {};
    const kind = this.prop;
    if (pat.barAt === 'hips' && (kind === 'bar' || kind === 'smith')) this._hand.hipbar = P.add(makeBarbell(m, 2.0, 0.225, 2)) && P.children[P.children.length - 1];
    else if (kind === 'bar' || kind === 'smith') { this._hand.bar = makeBarbell(m, 2.0, 0.225, pat === PATTERNS.rdl || pat === PATTERNS.shrug ? 2 : 2); P.add(this._hand.bar); }
    else if (kind === 'ez') { this._hand.bar = makeBarbell(m, 1.25, 0.14, 1); P.add(this._hand.bar); }
    else if (kind === 'db') {
      if (pat.oneDB === 'mid' || pat.hold1) { this._hand.dbMid = makeDumbbell(m); P.add(this._hand.dbMid); }
      else { this._hand.dbL = makeDumbbell(m); P.add(this._hand.dbL); if (pat.oneDB !== 'L') { this._hand.dbR = makeDumbbell(m); P.add(this._hand.dbR); } }
    }
    else if (kind === 'kb') { this._hand.kb = makeKettlebell(m); P.add(this._hand.kb); }
    if (cab && cab.bar && this._cableLines) { this._hand.bar = makeBarbell(m, cab.bar, 0.001, 0); P.add(this._hand.bar); }
    else if (this._cableLines && !cab.ankle) { this._hand.hL = cyl(0.018, 0.13, m.frame, 10); P.add(this._hand.hL); if (cab.each) { this._hand.hR = cyl(0.018, 0.13, m.frame, 10); P.add(this._hand.hR); } }
    if (kind === 'smith' && this._hand.bar) { for (const s of [-1, 1]) { const r = cyl(0.025, 2.2, m.frame, 10); r.position.set(s * 0.98, 1.1, fig.fist.L.z); st.add(r); } }
    if (pat.sled) { this._hand.sled = box(0.6, 0.6, 0.04, m.frame); P.add(this._hand.sled); }
    if (pat.roller) { this._hand.roller = cyl(0.05, 0.38, m.pad, 16); P.add(this._hand.roller); }
    if (pat.wheel) { const w = new THREE.Group(); const wh = cyl(0.09, 0.05, m.plate, 28); wh.rotation.z = Math.PI / 2; w.add(wh); const ax = cyl(0.012, 0.36, m.metal, 8); ax.rotation.z = Math.PI / 2; w.add(ax); this._hand.wheel = w; P.add(w); }
  }

  _updateProps() {
    const fig = this.fig, h = this._hand || {}; const fl = fig.fist.L, fr = fig.fist.R;
    const mid = fl.clone().add(fr).multiplyScalar(0.5);
    const orient = (obj, axis) => obj.quaternion.setFromUnitVectors(new THREE.Vector3(1, 0, 0), axis.clone().normalize());
    if (h.bar) { h.bar.position.copy(mid); const ax = fl.distanceTo(fr) > 0.18 ? fl.clone().sub(fr) : new THREE.Vector3(1, 0, 0); orient(h.bar, ax); }
    if (h.hipbar) { const r = fig.J('root'); const fw = new THREE.Vector3(0, 0, 1).applyQuaternion(fig.rig.get('root').getWorldQuaternion(new THREE.Quaternion())); h.hipbar.position.copy(r).addScaledVector(fw, 0.17); h.hipbar.position.y += 0.02; h.hipbar.quaternion.identity(); }
    if (h.dbL) { h.dbL.position.copy(fl); orient(h.dbL, fig.gripAx.L); }
    if (h.dbR) { h.dbR.position.copy(fr); orient(h.dbR, fig.gripAx.R); }
    if (h.dbMid) { h.dbMid.position.copy(mid); const up = fl.clone().sub(fig.J('lowerarm01.L')).add(fr.clone().sub(fig.J('lowerarm01.R'))); orient(h.dbMid, up); h.dbMid.position.addScaledVector(up.normalize(), 0.06); }
    if (h.kb) { h.kb.position.copy(mid); const dn = mid.clone().sub(fig.J('lowerarm01.L').add(fig.J('lowerarm01.R')).multiplyScalar(0.5)).normalize(); h.kb.quaternion.setFromUnitVectors(new THREE.Vector3(0, -1, 0), dn); }
    if (h.hL) { h.hL.position.copy(fl); h.hL.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), fig.gripAx.L); }
    if (h.hR) { h.hR.position.copy(fr); h.hR.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), fig.gripAx.R); }
    if (this._cableLines) {
      const cab = this.pat.cable; const set = (ln, a, b) => { const p = ln.geometry.attributes.position; p.setXYZ(0, a.x, a.y, a.z); p.setXYZ(1, b[0], b[1], b[2]); p.needsUpdate = true; ln.geometry.computeBoundingSphere(); };
      if (cab.ankle) set(this._cableLines[0], fig.J('foot.' + cab.ankle), cab.anchors[0]);
      else if (cab.each) { set(this._cableLines[0], fl, cab.anchors[0]); set(this._cableLines[1], fr, cab.anchors[1]); }
      else set(this._cableLines[0], mid, cab.anchors[0]);
    }
    if (h.sled) { const a = fig.J('toe.L').add(fig.J('toe.R')).multiplyScalar(0.5).add(fig.J('foot.L').add(fig.J('foot.R')).multiplyScalar(0.5)).multiplyScalar(0.5); const n = fig.J('lowerleg01.L').sub(fig.J('foot.L')).normalize(); h.sled.position.copy(a).addScaledVector(n, -0.07); h.sled.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), n.negate()); }
    if (h.roller) {
      const s = this.pat.roller; const a = fig.J('foot.L').add(fig.J('foot.R')).multiplyScalar(0.5); const k = fig.J('lowerleg01.L').add(fig.J('lowerleg01.R')).multiplyScalar(0.5);
      const sh = a.clone().sub(k).normalize(); const fwd = new THREE.Vector3(1, 0, 0).cross(sh).normalize();
      h.roller.position.copy(k).lerp(a, 0.82).addScaledVector(fwd, s === 'heel' ? 0.07 : -0.07); h.roller.rotation.set(0, 0, Math.PI / 2);
    }
    if (h.wheel) { h.wheel.position.copy(mid); h.wheel.position.y = Math.min(mid.y, 0.09); }
  }

  /** Ausschnitt nur auf die aktuelle Pose (für Vorschaubilder) */
  fitCurrent(pad = 1) {
    const b = new THREE.Box3(); this.fig.mesh.skeleton.update(); b.expandByObject(this.fig.mesh, true); b.expandByObject(this.fig.props);
    this.propsStatic.traverse((o) => { if (o.isMesh && !o.userData.skipFit) b.expandByObject(o); });
    const c = b.getCenter(new THREE.Vector3()), s = b.getSize(new THREE.Vector3());
    // Breite aus Sicht der Kamera
    const right = new THREE.Vector3(Math.cos(this.yaw), 0, -Math.sin(this.yaw));
    const pts = []; for (const x of [b.min.x, b.max.x]) for (const z of [b.min.z, b.max.z]) pts.push(x * right.x + z * right.z);
    const w = Math.max(...pts) - Math.min(...pts);
    this.target.copy(c); this.fitR = Math.max(s.y, w) * 0.5 * pad;
  }

  /** Zeitpunkt t (0..1) des Bewegungszyklus zeichnen */
  frame(t, pulse) {
    this.fig.apply(this.pat, t); this._updateProps();
    this.fig.uni.uPulse.value = pulse || 0;
  }

  render(w, h) {
    if (w && h && (this._w !== w || this._h !== h)) { this.renderer.setSize(w, h, false); this.cam.aspect = w / h; this.cam.updateProjectionMatrix(); this._w = w; this._h = h; }
    const fovV = this.cam.fov * DEG; const fovH = 2 * Math.atan(Math.tan(fovV / 2) * this.cam.aspect);
    const d = (this.fitR / Math.sin(Math.min(fovV, fovH) / 2)) * 0.98 / this.zoom;
    const cp = Math.cos(this.pitch);
    this.cam.position.set(this.target.x + Math.sin(this.yaw) * cp * d, this.target.y + Math.sin(this.pitch) * d, this.target.z + Math.cos(this.yaw) * cp * d);
    this.cam.lookAt(this.target);
    this.renderer.render(this.scene, this.cam);
  }

  dispose() { this.renderer.dispose(); this.renderer.forceContextLoss && this.renderer.forceContextLoss(); }
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
  const sc = new Scene3D(canvas, { dark });
  const fig = new Figure(model); sc.setFigure(fig);
  if (dark) fig.mesh.material.color.set(0xb3aea8);
  const accent = cssVar(document.documentElement, '--accent', '#00a86b');
  sc.setExercise(o.pat, o.eq, o.prim, o.sec, accent);
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
    const c = hold ? { t: 0, up: true } : (st.manualT !== null && !st.playing) ? { t: st.manualT, up: true } : cycle(st.u);
    sc.frame(c.t, st.playing ? 0.5 + 0.5 * Math.sin(now / 420) : 0.5);
    const w = stage.clientWidth, h = stage.clientHeight; sc.render(w, h);
    if (scrub && st.playing) scrub.value = String(Math.round(c.t * 1000));
    if (phase) phase.textContent = c.t > 0.98 ? 'Umkehrpunkt' : c.t < 0.02 ? 'Start' : (!st.playing ? '' : c.up ? 'Hinweg' : 'Rückweg');
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
  const sc = new Scene3D(canvas, { preserve: true, maxDpr: 1 }); const fig = new Figure(model); sc.setFigure(fig);
  sc.setExercise(patKey, eq, [], [], '#00a86b');
  sc.frame(t, 0); sc.fitCurrent(1.04); sc.render(size, size); return sc;
}
