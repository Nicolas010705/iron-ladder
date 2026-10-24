/* Iron Ladder – Figur: Rig, Posen-Mischung, inverse Kinematik für Hände und Füße.
 *
 * Welt: y oben, z = Blickrichtung der Figur in Ruhe, x = linke Körperseite. Meter.
 * Eine Pose beschreibt Becken + Wirbelsäule (FK) und Ziele für Hände/Füße (IK):
 *   p    [x,y,z]   Beckenposition (Knochen "root")
 *   r    [pitch,yaw,roll]  Beckenausrichtung, pitch + = nach vorn kippen
 *   sp   [beugen, seitneigen, drehen]   hd Kopf nicken   el Schultern hochziehen
 *   rest y          Rumpf liegt/sitzt exakt auf Fläche in Höhe y (überschreibt p.y)
 *   bar  {c, w, n, t:'in'|'out', ax, k}   Stange: Mitte c, halbe Griffbreite w, Handfläche zeigt nach n
 *   hand {L:{p,n,t,k}, R:{…}}   Griffmitte p, Handfläche n, Daumenrichtung t, k: g Griff | f flach | o locker | x Faust
 *   foot {L:{p,f,u,piv}, R:{…}} Fußpunkt p am Boden (piv 'heel' unter dem Knöchel | 'ball' Fußballen), Zehenrichtung f, Sohlen-Normale u
 *   apole/lpole  Richtung, in die Ellbogen/Knie zeigen (Welt)
 *   ua/fa/th/sh  Freie Gliedmaßen (Richtungen) wie bisher, [x,y,z,'c'|'p'|'w']
 * Rechts wird von links gespiegelt (x → -x), außer …R ist angegeben.
 */
import * as THREE from 'three';

export const REGIONS = ['none', 'chest_up', 'chest_mid', 'chest_low', 'lats', 'upback', 'traps', 'lower',
  'delt_front', 'delt_side', 'delt_rear', 'biceps', 'triceps', 'forearms',
  'abs', 'obliques', 'quads', 'hams', 'glutes', 'adductors', 'calves'];
const DEG = Math.PI / 180;
const SIDES = ['L', 'R'];
const V3 = (a) => new THREE.Vector3(a[0], a[1], a[2]);
const qAxis = (axis, ang) => new THREE.Quaternion().setFromAxisAngle(axis, ang);
const swing = (a, b) => new THREE.Quaternion().setFromUnitVectors(a.clone().normalize(), b.clone().normalize());
const _c = new THREE.Vector3();
function signedAngle(a, b, axis) { _c.copy(a).cross(b); return Math.atan2(_c.dot(axis), a.dot(b)); }
const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
const bname = (n) => n.replace(/[\[\]\.:\/]/g, '');
function basisQ(x, y, z) { const m = new THREE.Matrix4().makeBasis(x, y, z); return new THREE.Quaternion().setFromRotationMatrix(m); }
function frameQ(t, n) { const a = t.clone().normalize(), b = n.clone().normalize(); return basisQ(a, b, a.clone().cross(b)); }

/* ---------- Posen mischen ---------- */
const MIRROR_KEYS = new Set(['p', 'n', 't', 'f', 'u', 'c']);
function mirrorVec(v) { return Array.isArray(v) && typeof v[0] === 'number' ? [-v[0], ...v.slice(1)] : v; }
function mirrorObj(o) { const r = {}; for (const k in o) r[k] = MIRROR_KEYS.has(k) ? mirrorVec(o[k]) : o[k]; return r; }
export function mix(a, b, t) {
  if (a === undefined || a === null) return (typeof b === 'number' || Array.isArray(b)) ? b : (t < 0.5 ? a : b);
  if (b === undefined || b === null) return (typeof a === 'number' || Array.isArray(a)) ? a : (t < 0.5 ? a : b);
  if (typeof a === 'number' && typeof b === 'number') return a + (b - a) * t;
  if (Array.isArray(a) && Array.isArray(b)) return a.map((x, i) => mix(x, b[i], t));
  if (a && b && typeof a === 'object' && typeof b === 'object' && !Array.isArray(a)) { const r = {}; for (const k of new Set([...Object.keys(a), ...Object.keys(b)])) r[k] = mix(a[k], b[k], t); return r; }
  return t < 0.5 ? a : b;
}
/** Hand-/Fußangaben vervollständigen (Spiegelung, Stange → zwei Hände) */
export function expandPose(P) {
  const o = Object.assign({}, P);
  if (o.bar) {
    const b = o.bar; const ax = V3(b.ax || [1, 0, 0]).normalize(); const c = V3(b.c);
    const n = b.n || [0, 0, -1];
    const L = c.clone().addScaledVector(ax, b.w ?? 0.25), R = c.clone().addScaledVector(ax, -(b.w ?? 0.25));
    const tin = b.t !== 'out';
    o.hand = { L: { p: L.toArray(), n, t: ax.clone().multiplyScalar(tin ? -1 : 1).toArray(), k: b.k || 'g', fr: b.fr, dirw: b.dirw },
      R: { p: R.toArray(), n, t: ax.clone().multiplyScalar(tin ? 1 : -1).toArray(), k: b.k || 'g', fr: b.fr, dirw: b.dirw } };
  }
  if (o.hand) { const h = o.hand; o.hand = { L: h.L || null, R: h.R === 0 ? null : (h.R || (h.L && mirrorObj(h.L))) }; }
  if (o.foot) { const f = o.foot; o.foot = { L: f.L || null, R: f.R === 0 ? null : (f.R || (f.L && mirrorObj(f.L))) }; }
  return o;
}

/* ---------- Rig ---------- */
class Rig {
  constructor(root, mesh) {
    this.root = root; this.b = {};
    root.traverse((o) => { if (o.isBone) this.b[o.name] = o; });
    this.get = (n) => this.b[bname(n)];
    root.updateMatrixWorld(true);
    this.order = []; const walk = (o) => { if (o.isBone) this.order.push(o); o.children.forEach(walk); }; walk(root);
    this.rest = new Map();
    for (const bo of this.order) { const q = new THREE.Quaternion(), p = new THREE.Vector3(); bo.getWorldQuaternion(q); bo.getWorldPosition(p); this.rest.set(bo, { q, p, lp: bo.position.clone() }); }
    const P = (n) => this.rest.get(this.get(n)).p.clone();
    this.R = {};
    for (const s of SIDES) {
      const sh = P('upperarm01.' + s), el = P('lowerarm01.' + s), wr = P('wrist.' + s);
      const hip = P('upperleg01.' + s), kn = P('lowerleg01.' + s), an = P('foot.' + s), toe = P('toe.' + s);
      const u = el.clone().sub(sh).normalize(), f = wr.clone().sub(el).normalize();
      const th = kn.clone().sub(hip).normalize(), shn = an.clone().sub(kn).normalize();
      const i1 = P('finger2-1.' + s), p1 = P('finger5-1.' + s), m1 = P('finger3-1.' + s);
      const back = i1.clone().sub(wr).cross(p1.clone().sub(wr)).normalize(); if (s === 'R') back.negate();
      const n = back.clone().negate(); // Handfläche
      const tt = i1.clone().sub(p1); tt.addScaledVector(n, -tt.dot(n)).normalize(); // Daumenseite
      const ff = m1.clone().sub(wr); ff.addScaledVector(n, -ff.dot(n)); ff.addScaledVector(tt, -ff.dot(tt)).normalize();
      const fsign = Math.sign(ff.dot(n.clone().cross(tt)));
      const knuck = i1.clone().add(p1).multiplyScalar(0.5);
      const grip = knuck.clone().addScaledVector(n, 0.024).addScaledVector(ff, 0.012); // Stangenmitte in der geschlossenen Hand
      const palm = knuck.clone().lerp(wr, 0.45).addScaledVector(n, -0.012);              // Handflächenmitte (flach aufgesetzt)
      this.R[s] = {
        u, f, l1: sh.distanceTo(el), l2: el.distanceTo(wr), elbowAx: u.clone().cross(f).normalize(),
        th, shn, lt: hip.distanceTo(kn), ls: kn.distanceTo(an), kneeAx: new THREE.Vector3(1, 0, 0).projectOnPlane(th).normalize(),
        hand: { n, t: tt, f: ff, fsign, Qr: frameQ(tt, n), grip: grip.sub(wr), palm: palm.sub(wr) },
        ankle: an, ankleOffHeel: an.clone().sub(new THREE.Vector3(an.x, 0, an.z)), ankleOffBall: an.clone().sub(new THREE.Vector3(toe.x, 0, toe.z)),
        ankleH: an.y, toeH: toe.y, foot: toe.clone().sub(an).normalize(),
      };
    }
    // Rumpf-Vertices für Auflage auf Bank/Sitz
    const geo = mesh.geometry, si = geo.attributes.skinIndex, sw = geo.attributes.skinWeight; const bones = mesh.skeleton.bones;
    const torso = new Set(['root', 'spine05', 'spine04', 'spine03', 'spine02', 'spine01', 'pelvisL', 'pelvisR', 'upperleg01L', 'upperleg01R'].map(bname));
    this.torsoVerts = [];
    for (let i = 0; i < si.count; i += 2) {
      let best = 0, bi = 0; for (let k = 0; k < 4; k++) { const w = sw.getComponent(i, k); if (w > best) { best = w; bi = si.getComponent(i, k); } }
      if (torso.has(bones[bi].name)) this.torsoVerts.push(i);
    }
  }
}

/* SkinnedMesh klonen (Knochen neu verknüpfen) */
export function cloneSkinned(src) {
  const clone = src.clone(true); const dstB = {};
  clone.traverse((o) => { if (o.isBone) dstB[o.name] = o; });
  clone.traverse((o) => { if (o.isSkinnedMesh) { const sk = o.skeleton; o.bind(new THREE.Skeleton(sk.bones.map((b) => dstB[b.name]), sk.boneInverses), o.bindMatrix); } });
  return clone;
}

const GRIP = { g: [[0.95, 1.2, 0.8], [0.35, 0.55, 0.6]], x: [[1.3, 1.5, 1.0], [0.4, 0.7, 0.7]], o: [[0.25, 0.35, 0.25], [0.1, 0.15, 0.1]], f: [[0.0, 0.05, 0.05], [0.0, 0.05, 0.05]] };

export class Figure {
  constructor(model) {
    this.model = model;
    this.scene = cloneSkinned(model.gltf.scene);
    this.mesh = null; this.scene.traverse((o) => { if (o.isSkinnedMesh) this.mesh = o; });
    this.mesh.frustumCulled = false; this.mesh.castShadow = true; this.mesh.receiveShadow = true;
    this.mesh.geometry = this.mesh.geometry.clone();
    this.rig = new Rig(this.scene, this.mesh);
    const n = this.mesh.geometry.attributes.position.count;
    this.hl = new Float32Array(n);
    this.mesh.geometry.setAttribute('hl', new THREE.BufferAttribute(this.hl, 1));
    this.uni = { uAccent: { value: new THREE.Color('#00a86b') }, uPulse: { value: 0 } };
    const mat = new THREE.MeshPhysicalMaterial({ color: 0xb4ada6, roughness: 0.6, metalness: 0, sheen: 0.3, sheenRoughness: 0.6, sheenColor: new THREE.Color(0xffe2d2) });
    mat.onBeforeCompile = (sh) => {
      Object.assign(sh.uniforms, this.uni);
      sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nattribute float hl;\nvarying float vHl;').replace('#include <begin_vertex>', '#include <begin_vertex>\nvHl = hl;');
      sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nuniform vec3 uAccent;\nuniform float uPulse;\nvarying float vHl;')
        .replace('#include <color_fragment>', '#include <color_fragment>\nfloat hk = smoothstep(0.0, 1.0, vHl);\ndiffuseColor.rgb = mix(diffuseColor.rgb, uAccent, clamp(hk * 1.05, 0.0, 1.0));')
        .replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\ntotalEmissiveRadiance += uAccent * hk * (0.08 + 0.18 * uPulse);');
    };
    this.mesh.material = mat;
    this.G = { L: new THREE.Vector3(), R: new THREE.Vector3() }; // Griffmitten (Welt)
    this.T = { L: new THREE.Vector3(1, 0, 0), R: new THREE.Vector3(-1, 0, 0) };
    this.warn = [];
  }

  setHighlight(prim, sec) {
    const { region, off, adj } = this.model; const hl = this.hl; const n = hl.length;
    const P = new Set(prim || []), S = new Set(sec || []);
    for (let i = 0; i < n; i++) { const r = REGIONS[region[i]]; hl[i] = P.has(r) ? 1 : S.has(r) ? 0.5 : 0; }
    const tmp = new Float32Array(n);
    for (let pass = 0; pass < 3; pass++) {
      for (let i = 0; i < n; i++) { let s = 0; const a = off[i], b = off[i + 1]; for (let k = a; k < b; k++) s += hl[adj[k]]; tmp[i] = b > a ? 0.5 * hl[i] + 0.5 * s / (b - a) : hl[i]; }
      hl.set(tmp);
    }
    this.mesh.geometry.attributes.hl.needsUpdate = true;
  }

  J(n) { return this.rig.get(n).getWorldPosition(new THREE.Vector3()); }

  _commit(D, rootPos) {
    const rig = this.rig;
    for (const bo of rig.order) {
      let d = D.get(bo);
      if (!d) { let p = bo.parent; while (p && p.isBone && !D.has(p)) p = p.parent; d = (p && D.get(p)) || new THREE.Quaternion(); D.set(bo, d); }
      const qw = d.clone().multiply(rig.rest.get(bo).q);
      let pq;
      if (bo.parent && bo.parent.isBone) pq = D.get(bo.parent).clone().multiply(rig.rest.get(bo.parent).q);
      else { pq = new THREE.Quaternion(); bo.parent && bo.parent.getWorldQuaternion(pq); }
      bo.quaternion.copy(pq.invert().multiply(qw));
    }
    const rootB = rig.get('root');
    if (rootPos) { const inv = new THREE.Matrix4().copy(rootB.parent.matrixWorld).invert(); rootB.position.copy(rootPos.clone().applyMatrix4(inv)); }
    this.scene.updateMatrixWorld(true);
    // Nicht gesetzte Knochen dürfen beim nächsten Commit neu erben
    for (const bo of rig.order) if (!this._fixed.has(bo)) D.delete(bo);
  }

  _torsoMinDist(n, p0) {
    const m = this.mesh, v = new THREE.Vector3(); let mn = Infinity;
    for (const i of this.rig.torsoVerts) { m.getVertexPosition(i, v); v.applyMatrix4(m.matrixWorld); const d = v.sub(p0).dot(n); if (d < mn) mn = d; }
    return mn;
  }

  /** Pose t ∈ [0,1] zwischen a und b anwenden */
  apply(pat, t) {
    const rig = this.rig; this.warn.length = 0;
    if (!pat._EA) { pat._EA = expandPose(pat._A); pat._EB = expandPose(pat._B); }
    const EA = pat._EA, EB = pat._EB;
    const noH = (o) => { const r = Object.assign({}, o); delete r.hand; delete r.bar; return r; };
    const P = this.P = mix(noH(EA), noH(EB), t);
    if (pat.dyn) pat.dyn(P, t);
    const r = P.r || [0, 0, 0], sp = P.sp || [0, 0, 0], hd = P.hd || 0, el = P.el || 0;
    const Qb = new THREE.Quaternion().setFromEuler(new THREE.Euler(r[0] * DEG, r[1] * DEG, r[2] * DEG, 'YXZ'));
    const D = new Map(); this._fixed = new Set();
    const setD = (n, q) => { const bo = rig.get(n); D.set(bo, q); this._fixed.add(bo); };
    setD('root', Qb.clone());
    const sb = ['spine05', 'spine04', 'spine03', 'spine02', 'spine01'];
    const spineQ = (f) => new THREE.Quaternion().setFromEuler(new THREE.Euler(sp[0] * DEG * f, sp[2] * DEG * f, -sp[1] * DEG * f, 'YXZ'));
    sb.forEach((n, i) => setD(n, Qb.clone().multiply(spineQ((i + 1) / sb.length))));
    const Dc = D.get(rig.get('spine01')).clone(), Dp = Qb.clone();
    ['neck01', 'neck02', 'neck03', 'head'].forEach((n, i) => setD(n, Dc.clone().multiply(qAxis(new THREE.Vector3(1, 0, 0), hd * DEG * (i + 1) / 4))));
    for (const s of SIDES) { setD('pelvis.' + s, Dp.clone()); }
    // Becken-Position
    let rootPos = P.p ? V3(P.p) : rig.rest.get(rig.get('root')).p.clone();
    // Schultern (vorläufig) und Schlüsselbein
    const clav = {};
    for (const s of SIDES) { clav[s] = Dc.clone().multiply(qAxis(new THREE.Vector3(0, 0, 1), (s === 'L' ? 1 : -1) * el * DEG)); setD('clavicle.' + s, clav[s]); setD('shoulder01.' + s, clav[s]); }
    this._commit(D, rootPos);
    if (P.rest !== undefined && P.rest !== null) {
      const pl = typeof P.rest === 'number' ? { n: [0, 1, 0], p: [0, P.rest, 0] } : P.rest;
      const n = V3(pl.n).normalize(); const d = this._torsoMinDist(n, V3(pl.p)); rootPos.addScaledVector(n, -d); this._commit(D, rootPos);
    }
    // Ziele relativ zu Brustkorb ('c') oder Becken ('p') in Welt umrechnen
    const frameXf = (fr) => {
      const bo = rig.get(fr === 'p' ? 'root' : 'spine01'); const q = D.get(bo).clone();
      const o = bo.getWorldPosition(new THREE.Vector3()); const o0 = rig.rest.get(bo).p;
      return { p: (v) => V3(v).sub(o0).applyQuaternion(q).add(o), d: (v) => V3(v).applyQuaternion(q) };
    };
    const toW = (h) => { if (!h) return null; if (!h.fr || h.fr === 'w') return { p: V3(h.p), n: V3(h.n).normalize(), t: V3(h.t).normalize(), k: h.k }; const X = frameXf(h.fr); return h.dirw ? { p: X.p(h.p), n: V3(h.n).normalize(), t: V3(h.t).normalize(), k: h.k } : { p: X.p(h.p), n: X.d(h.n).normalize(), t: X.d(h.t).normalize(), k: h.k }; };
    P.hand = {};
    for (const s of SIDES) {
      const a = toW(EA.hand && EA.hand[s]), b = toW(EB.hand && EB.hand[s]);
      const h = a && b ? { p: a.p.lerp(b.p, t), n: a.n.lerp(b.n, t).normalize(), t: a.t.lerp(b.t, t).normalize(), k: t < 0.5 ? a.k : b.k } : (t < 0.5 ? a : b) || a || b;
      if (h) P.hand[s] = { p: h.p.toArray(), n: h.n.toArray(), t: h.t.toArray(), k: h.k };
    }
    // Höhe so wählen, dass Arme (Hängen) bzw. Beine (Stehen) fast gestreckt sind
    if (P.fit) {
      const k = P.fit.k || 0.985; let dy = null;
      for (const s of (P.fit.side ? [P.fit.side] : SIDES)) {
        const RS = rig.R[s];
        if (P.fit.arms && P.hand && P.hand[s]) {
          const h = P.hand[s]; const n = V3(h.n).normalize(); let tt = V3(h.t); tt.addScaledVector(n, -tt.dot(n)).normalize();
          const Q = frameQ(tt, n).multiply(RS.hand.Qr.clone().invert());
          const W = V3(h.p).sub((h.k === 'f' ? RS.hand.palm : RS.hand.grip).clone().applyQuaternion(Q));
          const S = this.J('upperarm01.' + s); const L = (RS.l1 + RS.l2) * k; const hz = Math.hypot(W.x - S.x, W.z - S.z);
          if (P.fit.arms === 'up') { const v = W.y - S.y + Math.sqrt(Math.max(0, L * L - hz * hz)); dy = dy === null ? v : Math.min(dy, v); }
          else { const v = W.y - S.y - Math.sqrt(Math.max(0, L * L - hz * hz)); dy = dy === null ? v : Math.max(dy, v); }
        }
        if (P.fit.legs && P.foot && P.foot[s]) {
          const ft = P.foot[s]; const fw = V3(ft.f || [0, 0, 1]).normalize(); const up = V3(ft.u || [0, 1, 0]); up.addScaledVector(fw, -up.dot(fw)).normalize();
          const Qf = basisQ(up.clone().cross(fw).normalize(), up, fw);
          const A = V3(ft.p).add((ft.piv === 'ball' ? RS.ankleOffBall : RS.ankleOffHeel).clone().applyQuaternion(Qf));
          const H = this.J('upperleg01.' + s); const L = (RS.lt + RS.ls) * k; const hz = Math.hypot(A.x - H.x, A.z - H.z);
          const v = A.y - H.y + Math.sqrt(Math.max(0, L * L - hz * hz)); dy = dy === null ? v : Math.min(dy, v);
        }
      }
      if (dy !== null) { rootPos.y += dy; this._commit(D, rootPos); }
    }
    // Schulterblatt folgt dem Arm (skapulohumeraler Rhythmus)
    const hands = P.hand || {};
    const handQ = {}, wristT = {};
    for (const s of SIDES) {
      const h = hands[s]; if (!h) continue; const RS = rig.R[s]; const sg = s === 'L' ? 1 : -1;
      const n = V3(h.n).normalize(); let tt = V3(h.t); tt.addScaledVector(n, -tt.dot(n)).normalize();
      const Q = frameQ(tt, n).multiply(RS.hand.Qr.clone().invert());
      handQ[s] = Q; const k = h.k || 'g';
      const off = (k === 'f' ? RS.hand.palm : RS.hand.grip).clone().applyQuaternion(Q);
      wristT[s] = V3(h.p).sub(off);
      this.G[s].copy(V3(h.p)); this.T[s].copy(tt);
      const S = this.J('upperarm01.' + s);
      const v = wristT[s].clone().sub(S).applyQuaternion(Dc.clone().invert()).normalize();
      const elev = Math.acos(clamp(-v.y, -1, 1)) / DEG;
      const up = clamp((elev - 35) / 135, 0, 1) * 24 + el;
      const pro = clamp(v.z, -1, 1) * 9;
      const q = Dc.clone().multiply(qAxis(new THREE.Vector3(0, 0, 1), sg * up * DEG)).multiply(qAxis(new THREE.Vector3(0, 1, 0), -sg * pro * DEG));
      setD('clavicle.' + s, q); setD('shoulder01.' + s, q); clav[s] = q;
    }
    this._commit(D, rootPos);
    // Arme
    for (const s of SIDES) {
      const RS = rig.R[s]; const sg = s === 'L' ? 1 : -1; const Dcl = clav[s];
      let u, f;
      if (wristT[s]) {
        const S = this.J('upperarm01.' + s), W = wristT[s];
        const pole = P.apole ? V3(s === 'L' ? P.apole : mirrorVec(P.apole)).normalize() : new THREE.Vector3(sg * 0.45, -1, -0.35).applyQuaternion(Dc).normalize();
        const r2 = this._ik2(S, W, RS.l1, RS.l2, pole, s, 'Arm');
        u = r2.E.clone().sub(S).normalize(); f = W.clone().sub(r2.E).normalize();
      } else {
        u = this._dir(P, 'ua', s, 'c', Dc, Dp); f = this._dir(P, 'fa', s, 'c', Dc, Dp);
      }
      if (u && f) {
        const carried = RS.u.clone().applyQuaternion(Dcl);
        const S = swing(carried, u).multiply(Dcl);
        const restAx = RS.elbowAx.clone().applyQuaternion(S);
        const pole = new THREE.Vector3(0, 0, 1).applyQuaternion(Dc);
        const ax = u.clone().cross(f); ax.add(u.clone().cross(pole).normalize().multiplyScalar(0.12)).normalize();
        const tw = signedAngle(restAx.clone().projectOnPlane(u).normalize(), ax.clone().projectOnPlane(u).normalize(), u);
        const Dua = qAxis(u, tw).multiply(S);
        setD('upperarm01.' + s, qAxis(u, tw * 0.5).multiply(S)); setD('upperarm02.' + s, Dua);
        const fc = RS.f.clone().applyQuaternion(Dua);
        const Dfa = qAxis(ax, signedAngle(fc, f, ax)).multiply(Dua);
        setD('lowerarm01.' + s, Dfa);
        let Dw;
        if (handQ[s]) {
          Dw = handQ[s];
          // Drehung der Hand großteils über den Unterarm (Pronation/Supination)
          const rel = Dw.clone().multiply(Dfa.clone().invert());
          const va = new THREE.Vector3(rel.x, rel.y, rel.z); const proj = f.clone().multiplyScalar(va.dot(f));
          const twq = new THREE.Quaternion(proj.x, proj.y, proj.z, rel.w).normalize();
          setD('lowerarm02.' + s, new THREE.Quaternion().slerp(twq, 0.8).multiply(Dfa));
          const bend = RS.hand.f.clone().applyQuaternion(Dw).angleTo(f) / DEG; if (bend > 50) this.warn.push(`Handgelenk ${s} ${bend.toFixed(0)}°`);
        } else {
          const pr = (P.pr || 0) * sg * DEG;
          const Dpr = qAxis(f, pr * 0.5).multiply(Dfa); setD('lowerarm02.' + s, Dpr); Dw = qAxis(f, pr * 0.5).multiply(Dpr);
        }
        setD('wrist.' + s, Dw);
        // Finger
        const k = (hands[s] && hands[s].k) || P.k || 'o';
        const g = GRIP[k] || GRIP.o; const palm = RS.hand.n.clone().applyQuaternion(Dw);
        for (let fi = 1; fi <= 5; fi++) {
          let Dprev = Dw; const amts = fi === 1 ? g[1] : g[0];
          for (let kk = 1; kk <= 3; kk++) {
            const bo = rig.get(`finger${fi}-${kk}.${s}`); if (!bo) continue;
            const ch = bo.children.find((c) => c.isBone); if (!ch) { D.set(bo, Dprev); this._fixed.add(bo); continue; }
            const dir = rig.rest.get(ch).p.clone().sub(rig.rest.get(bo).p).normalize().applyQuaternion(Dprev);
            const ax2 = dir.clone().cross(palm).normalize();
            const q = qAxis(ax2, amts[kk - 1]).multiply(Dprev); D.set(bo, q); this._fixed.add(bo); Dprev = q;
          }
        }
      }
    }
    // Beine
    const feet = P.foot || {};
    for (const s of SIDES) {
      const RS = rig.R[s]; const sg = s === 'L' ? 1 : -1; let th, shn, Qf = null;
      const ft = feet[s];
      if (ft) {
        const fw = V3(ft.f || [0, 0, 1]).normalize(); const up = V3(ft.u || [0, 1, 0]); up.addScaledVector(fw, -up.dot(fw)).normalize();
        Qf = basisQ(up.clone().cross(fw).normalize(), up, fw); // Ruhe-Fußrahmen = Weltachsen
        const A = V3(ft.p).add((ft.piv === 'ball' ? RS.ankleOffBall : RS.ankleOffHeel).clone().applyQuaternion(Qf));
        const H = this.J('upperleg01.' + s);
        const pole = P.lpole ? V3(s === 'L' ? P.lpole : mirrorVec(P.lpole)).normalize() : new THREE.Vector3(sg * 0.18, 0, 1).applyQuaternion(Dp).normalize();
        const r2 = this._ik2(H, A, RS.lt, RS.ls, pole, s, 'Bein');
        th = r2.E.clone().sub(H).normalize(); shn = A.clone().sub(r2.E).normalize();
      } else { th = this._dir(P, 'th', s, 'p', Dc, Dp); shn = this._dir(P, 'sh', s, 'p', Dc, Dp); }
      if (th && shn) {
        const carried = RS.th.clone().applyQuaternion(Dp);
        const S = swing(carried, th).multiply(Dp);
        const restAx = RS.kneeAx.clone().applyQuaternion(S);
        const pole = new THREE.Vector3(0, 0, -1).applyQuaternion(Dp);
        const ax = th.clone().cross(shn); ax.add(th.clone().cross(pole).normalize().multiplyScalar(0.12)).normalize();
        const tw = signedAngle(restAx.clone().projectOnPlane(th).normalize(), ax.clone().projectOnPlane(th).normalize(), th);
        const Dth = qAxis(th, tw).multiply(S);
        setD('upperleg01.' + s, qAxis(th, tw * 0.5).multiply(S)); setD('upperleg02.' + s, Dth);
        const Dsh = qAxis(ax, signedAngle(RS.shn.clone().applyQuaternion(Dth), shn, ax)).multiply(Dth);
        setD('lowerleg01.' + s, Dsh); setD('lowerleg02.' + s, Dsh);
        if (Qf) setD('foot.' + s, Qf);
        else {
          let fd = P['ft' + s] !== undefined ? P['ft' + s] : (s === 'R' ? mirrorVec(P.ft) : P.ft);
          if (fd === 'rel') setD('foot.' + s, Dsh);
          else {
            const yaw = qAxis(new THREE.Vector3(0, 1, 0), r[1] * DEG);
            const want = (!fd || typeof fd === 'string') ? RS.foot.clone().applyQuaternion(yaw).applyAxisAngle(new THREE.Vector3(0, 1, 0), fd === 'flatout' ? sg * 18 * DEG : 0)
              : V3(fd).normalize().applyQuaternion(fd[3] === 'p' ? Dp : fd[3] === 'c' ? Dc : new THREE.Quaternion());
            setD('foot.' + s, swing(RS.foot.clone().applyQuaternion(Dsh), want).multiply(Dsh));
          }
        }
      }
    }
    this._commit(D, rootPos);
    // Alte Muster ohne feste Ziele: auf den Boden stellen
    if (!P.p && (P.rest === undefined || P.rest === null)) this._ground(pat, rootPos, D);
    this.rootPos = rootPos.clone();
    if (!wristT.L || !wristT.R) this._fists();
  }

  _ik2(S, W, a, b, pole, s, what) {
    const dv = W.clone().sub(S); let d = dv.length(); const u = dv.clone().divideScalar(d || 1);
    if (d > a + b - 0.002) { if (d > a + b + 0.01) this.warn.push(`${what} ${s} zu kurz um ${((d - a - b) * 100).toFixed(1)} cm`); d = a + b - 0.002; }
    if (d < Math.abs(a - b) + 0.01) d = Math.abs(a - b) + 0.01;
    const x = (a * a - b * b + d * d) / (2 * d), h = Math.sqrt(Math.max(0, a * a - x * x));
    const pp = pole.clone().addScaledVector(u, -pole.dot(u)); if (pp.lengthSq() < 1e-8) pp.set(0, 0, 1); pp.normalize();
    return { E: S.clone().addScaledVector(u, x).addScaledVector(pp, h) };
  }

  _dir(P, key, s, def, Dc, Dp) {
    let d = P[key + s] !== undefined ? P[key + s] : (s === 'R' ? mirrorVec(P[key]) : P[key]);
    if (!d || typeof d === 'string') return null;
    const fr = d[3] || def; const q = fr === 'w' ? new THREE.Quaternion() : fr === 'p' ? Dp : Dc;
    return V3(d).normalize().applyQuaternion(q);
  }

  _fists() {
    for (const s of SIDES) {
      const RS = this.rig.R[s]; const w = this.J('wrist.' + s); const q = this.rig.get('wrist.' + s).getWorldQuaternion(new THREE.Quaternion()).multiply(this.rig.rest.get(this.rig.get('wrist.' + s)).q.clone().invert());
      this.G[s].copy(w).add(RS.hand.grip.clone().applyQuaternion(q)); this.T[s].copy(RS.hand.t).applyQuaternion(q);
    }
  }

  contacts() {
    const R = this.rig.R, J = (n) => this.J(n), c = {};
    const foot = (s) => { const a = J('foot.' + s), t = J('toe.' + s); return { y: Math.min(a.y - R[s].ankleH, t.y - R[s].toeH), x: (a.x + t.x) / 2, z: (a.z + t.z) / 2 }; };
    c.footL = foot('L'); c.footR = foot('R');
    c.feet = { x: (c.footL.x + c.footR.x) / 2, y: Math.min(c.footL.y, c.footR.y), z: (c.footL.z + c.footR.z) / 2 };
    this._fists(); const hl = this.G.L, hr = this.G.R;
    c.hands = { x: (hl.x + hr.x) / 2, y: Math.min(hl.y, hr.y) - 0.035, z: (hl.z + hr.z) / 2 };
    const kl = J('lowerleg01.L'), kr = J('lowerleg01.R');
    c.knees = { x: (kl.x + kr.x) / 2, y: Math.min(kl.y, kr.y) - 0.055, z: (kl.z + kr.z) / 2 };
    const el = J('lowerarm01.L'), er = J('lowerarm01.R');
    c.elbows = { x: (el.x + er.x) / 2, y: Math.min(el.y, er.y) - 0.045, z: (el.z + er.z) / 2 };
    return c;
  }

  _ground(pat, rootPos, D) {
    const C = this.contacts(); const gnd = pat.gnd || 'feet'; const off = new THREE.Vector3(); const root = this.J('root');
    if (gnd === 'feet') off.set(-C.feet.x, -C.feet.y, -C.feet.z);
    else if (gnd === 'feetY') off.set(-root.x, -C.feet.y, -root.z);
    else if (gnd === 'hands') { const h = pat.hang; off.set(h[0] - C.hands.x, h[1] - (this.G.L.y + this.G.R.y) / 2, h[2] - C.hands.z); }
    else if (gnd === 'knees') off.set(-C.knees.x, (pat.gndY || 0) - C.knees.y, (pat.gndZ || 0) - C.knees.z);
    else if (gnd === 'contact') { const my = Math.min(...(pat.contact || ['feet']).map((k) => C[k].y)); const ax = pat.anchorXZ ? C[pat.anchorXZ] : root; off.set(-ax.x, -my, -ax.z); }
    else return;
    rootPos.copy(root).add(off); this._commit(D, rootPos); this._fists();
  }
}
