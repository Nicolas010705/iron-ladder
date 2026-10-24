/* Iron Ladder – Bewegungsmuster für die 3D-Figur (Version 2: IK + Geräte).
 *
 * Welt: Meter, y oben, z = Blickrichtung der Figur, x = linke Körperseite. Boden y = 0.
 * Ein Muster hat Pose a (Start) und b (Umkehrpunkt), Geräte (eq), Handgerät (hold), Kabel (cable).
 * Pose-Felder siehe figure.js. Kurz:
 *   p Becken, r [pitch,yaw,roll], sp Wirbelsäule, hd Kopf, el Schultern hoch
 *   rest y | {n,p}   Rumpf liegt auf Fläche      fit {legs|arms, k, side}  Höhe automatisch (gestreckt)
 *   bar {c,w,n,t,fr}  Stange (fr 'c' = mit dem Brustkorb mitbewegt, 'p' = mit dem Becken)
 *   hand {L:{p,n,t,k,fr}}   foot {L:{p,f,u,piv}}   apole/lpole   ua/fa/th/sh (frei)
 * eq: [{m: Modell, p, ry, back (Lehnenwinkel), car (Höhe Seilrolle), id, sled, arm, pads, stack, ratio}]
 * hold: barbell | barbell2 | ezbar | db2 | dbL | dbMid | kb | smith | abwheel
 * cable: {from:{id, node, p}, handle, each, ankle, wide}
 */
const STAND = { p: [0, 0.92, -0.05], fit: { legs: 1, k: 0.992 }, foot: { L: { p: [0.12, 0, 0], f: [0.12, 0, 1] } } };
const WIDE = { L: { p: [0.17, 0, 0], f: [0.32, 0, 1] } };
const S = (o) => Object.assign({}, STAND, o);
const BENCH = { m: 'bench_flat', p: [0, 0, -0.12] };
const RACK = { m: 'squat_rack', p: [0, 0, 0.02], nofit: true };
const HANG_L = (y = 0.8, z = 0.04, x = 0.235) => ({ L: { p: [x, y, z], n: [-1, 0, 0], t: [0, 0, 1], k: 'g', fr: 'c' } });
const TOWER = (x, z, ry, car, id = 't') => ({ m: 'cable_tower', p: [x, 0, z], ry, car, id });
const FROM_TOWER = (id = 't') => ({ id, node: 'carriage', p: [0, -0.02, 0.2] });

export const PATTERNS = {
  bench: {
    view: 'high', hold: 'barbell', eq: [BENCH],
    a: { r: [-90, 0, 0], p: [0, 0.6, 0.06], rest: 0.43, hd: -4, foot: { L: { p: [0.25, 0, 0.52], f: [0.15, 0, 1] } }, apole: [0.8, -0.5, 0.4],
      bar: { c: [0, 1.0, -0.38], w: 0.4, n: [0, 0.15, 1] } },
    b: { bar: { c: [0, 0.69, -0.27], w: 0.4, n: [0, 0.15, 1] } },
    v: {
      KH: { hold: 'db2', a: { hand: { L: { p: [0.17, 1.0, -0.36], n: [0, 0.1, 1], t: [-1, 0, 0] } } }, b: { hand: { L: { p: [0.33, 0.7, -0.3], n: [0, 0.1, 1], t: [-1, 0, 0] } } } },
      MA: 'chestpress',
    },
  },
  incline: {
    view: 'tq', hold: 'barbell', eq: [{ m: 'bench_adj', p: [0, 0, -0.1], back: 38 }],
    a: { r: [-52, 0, 0], p: [0, 0.6, 0.0], rest: { n: [0, 0.788, 0.616], p: [0, 0.458, -0.078] }, foot: { L: { p: [0.24, 0, 0.55], f: [0.15, 0, 1] } }, apole: [0.8, -0.6, -0.2],
      bar: { c: [0, 1.38, -0.27], w: 0.38, n: [0, 0.2, 1] } },
    b: { bar: { c: [0.0, 1.36, 0.02], w: 0.38, n: [0, -1, 0.15], fr: 'c' } },
    v: {
      KH: { hold: 'db2', a: { hand: { L: { p: [0.16, 1.38, -0.26], n: [0, 0.2, 1], t: [-1, 0, 0] } } }, b: { hand: { L: { p: [0.32, 1.36, 0.04], n: [0, -1, 0.15], t: [-1, 0, 0], fr: 'c' } } } },
      MA: 'chestpress',
    },
  },
  ohp: {
    view: 'tq', hold: 'barbell', eq: [RACK],
    a: S({ r: [-3, 0, 0], hd: -6, apole: [0.25, -0.6, 0.75], bar: { c: [0, 1.43, 0.13], w: 0.27, n: [0, 0.2, 1] } }),
    b: { bar: { c: [0, 1.99, 0.02], w: 0.27, n: [0, 0.6, 1] }, apole: [0.6, -0.2, 0.5] },
    v: {
      KH: { hold: 'db2', eq: [], a: { hand: { L: { p: [0.29, 1.45, 0.06], n: [0, 0.2, 1], t: [-1, 0, 0] } } }, b: { hand: { L: { p: [0.17, 1.98, 0.02], n: [0, 0.3, 1], t: [-1, 0, 0] } } } },
      MA: 'shoulderpress',
    },
  },
  pushup: {
    view: 'side',
    a: { r: [70, 0, 0], p: [0, 0.45, -0.42], fit: { legs: 1, k: 0.995 }, hand: { L: { p: [0.2, 0.0, 0.0], n: [0, -1, 0], t: [-1, 0, 0.3], k: 'f' } },
      foot: { L: { p: [0.09, 0, -1.25], f: [0, -0.85, 0.5], u: [0, 0.5, 0.85], piv: 'ball' } }, apole: [0.6, 0.1, -1], hd: 5 },
    b: { r: [84, 0, 0], p: [0, 0.2, -0.32], apole: [0.8, 0.3, -1] },
  },
  dip: {
    view: 'tq', eq: [{ m: 'power_tower', p: [0, 0, 0] }],
    a: { r: [10, 0, 0], p: [0, 1.0, 0.05], fit: { arms: 'up', k: 0.985 }, hand: { L: { p: [0.27, 1.24, 0.24], n: [-1, 0, 0], t: [0, 0, 1] } }, apole: [0.2, -0.3, -1],
      th: [0.05, -1, 0.25], sh: [0, -0.4, -0.9], ft: 'rel' },
    b: { r: [24, 0, 0], p: [0, 1.13, 0.1], fit: null, apole: [0.25, 0.3, -1] },
  },
  fly: {
    view: 'front', eq: [TOWER(1.15, 0.2, -90, 1.95, 't1'), TOWER(-1.15, 0.2, 90, 1.95, 't2')],
    cable: { from: FROM_TOWER('t1'), from2: FROM_TOWER('t2'), handle: 'dhandle', each: true },
    a: S({ r: [14, 0, 0], foot: { L: { p: [0.12, 0, 0.1], f: [0.12, 0, 1] }, R: { p: [-0.12, 0, -0.2], f: [-0.12, 0, 1] } },
      hand: { L: { p: [0.74, 1.47, 0.22], n: [-0.3, 0, 1], t: [0, 1, 0] } }, apole: [0.3, 0.2, -1] }),
    b: { hand: { L: { p: [0.07, 1.12, 0.52], n: [-1, 0, 0.2], t: [0, 1, 0] } }, apole: [0.6, -0.1, -1] },
    v: {
      KH: { view: 'high', hold: 'db2', cable: null, eq: [BENCH],
        a: { r: [-90, 0, 0], p: [0, 0.6, 0.06], rest: 0.43, fit: null, hd: -4, foot: { L: { p: [0.25, 0, 0.52], f: [0.15, 0, 1] } },
          hand: { L: { p: [0.12, 1.0, -0.33], n: [-1, 0, 0], t: [0, 0, -1] } }, apole: [1, 0.1, 0.1] },
        b: { hand: { L: { p: [0.66, 0.66, -0.33], n: [-0.2, 1, 0], t: [0, 0, -1] } } } },
      MA: 'butterfly',
    },
  },
  row: {
    view: 'tq', hold: 'barbell',
    a: S({ r: [58, 0, 0], p: [0, 0.82, -0.2], fit: null, hd: -18, apole: [0.4, 0.2, -1], bar: { c: [0, 0.44, 0.18], w: 0.26, n: [0, 0, -1] } }),
    b: { bar: { c: [0, 1.1, 0.13], w: 0.26, n: [0, 0, -1], fr: 'c', dirw: 1 } },
    v: {
      KH: { hold: 'dbL', eq: [{ m: 'bench_flat', p: [-0.22, 0, 0.25] }],
        a: { r: [72, 0, 0], p: [0, 0.82, -0.25], fit: null, hd: -15, foot: { L: { p: [0.2, 0, -0.1], f: [0.12, 0, 1] }, R: { p: [-0.2, 0, -0.1], f: [-0.1, 0, 1] } },
          hand: { L: { p: [0.22, 0.42, 0.2], n: [-1, 0, 0], t: [0, 0, 1] }, R: { p: [-0.22, 0.47, 0.55], n: [0, -1, 0], t: [1, 0, 0.3], k: 'f' } }, apole: [0.2, 0.3, -1] },
        b: { hand: { L: { p: [0.22, 1.12, 0.06], n: [-1, 0, 0], t: [0, 0, 1], fr: 'c' }, R: { p: [-0.22, 0.47, 0.55], n: [0, -1, 0], t: [1, 0, 0.3], k: 'f' } } } },
    },
  },
  cablerow: {
    view: 'side', eq: [{ m: 'row_machine', p: [0, 0, 0], id: 'r', ratio: 1 }],
    cable: { from: { id: 'r', p: [0, 0.45, 1.06] }, handle: 'sbar', wide: true },
    a: { r: [22, 0, 0], p: [0, 0.55, 0.02], rest: 0.435, foot: { L: { p: [0.13, 0.27, 0.84], f: [0, 0.94, 0.34], u: [0, 0.34, -0.94] } }, lpole: [0.3, 1, 0.2],
      bar: { c: [0, 0.6, 0.6], w: 0.11, n: [0, -1, 0.1] }, apole: [0.5, -0.5, -0.2] },
    b: { r: [-6, 0, 0], bar: { c: [0, 1.1, 0.18], w: 0.11, n: [0, -1, 0], fr: 'c', dirw: 1 }, apole: [0.4, -0.3, -1] },
  },
  pulldown: {
    view: 'tq', eq: [{ m: 'lat_machine', p: [0, 0, 0], id: 'l', ratio: 1 }],
    cable: { from: { id: 'l', p: [0, 2.25, 0.12] }, handle: 'latbar', wide: true },
    a: { r: [-12, 0, 0], p: [0, 0.6, 0.0], rest: 0.48, foot: { L: { p: [0.17, 0, 0.42], f: [0.15, 0, 1] } },
      bar: { c: [0, 1.62, 0.1], w: 0.38, n: [0, 0.3, 1] }, apole: [1, 0.2, 0.2] },
    b: { r: [-18, 0, 0], bar: { c: [0, 1.36, 0.17], w: 0.38, n: [0, 0, 1], fr: 'c', dirw: 1 }, apole: [1, -0.8, -0.3] },
  },
  pullup: {
    view: 'tq', eq: [{ m: 'power_tower', p: [0, 0, 0] }],
    a: { r: [-3, 0, 0], p: [0, 1.1, -0.04], fit: { arms: 1, k: 0.99 }, bar: { c: [0, 2.25, 0], w: 0.3, n: [0, 0.1, 1] }, apole: [1, 0, 0.2],
      th: [0.04, -1, 0.12], sh: [0, -1, -0.45], ft: 'rel' },
    b: { r: [-10, 0, 0], p: [0, 1.66, -0.07], fit: null, apole: [1, -0.6, 0.1] },
  },
  curl: {
    view: 'tq', hold: 'db2',
    a: S({ hand: HANG_L(0.8, 0.07, 0.24), apole: [0.1, -0.2, -1] }),
    b: { hand: { L: { p: [0.23, 1.38, 0.24], n: [0, 0.5, -0.85], t: [1, 0, 0], fr: 'c' } } },
    v: {
      KH: { a: { hand: { L: { p: [0.24, 0.8, 0.07], n: [0, 0, 1], t: [1, 0, 0], fr: 'c' } } } },
      LH: { hold: 'barbell', a: { bar: { c: [0, 0.78, 0.13], w: 0.21, n: [0, 0, 1], t: 'out', fr: 'c' } }, b: { bar: { c: [0, 1.34, 0.27], w: 0.21, n: [0, 0.5, -0.8], t: 'out', fr: 'c' } } },
      SZ: { hold: 'ezbar', a: { bar: { c: [0, 0.78, 0.13], w: 0.16, n: [0, 0, 1], t: 'out', fr: 'c' } }, b: { bar: { c: [0, 1.34, 0.27], w: 0.16, n: [0, 0.5, -0.8], t: 'out', fr: 'c' } } },
      KB: { eq: [TOWER(0, 0.95, 180, 0.12)], cable: { from: FROM_TOWER(), handle: 'sbar', wide: true },
        a: { bar: { c: [0, 0.8, 0.15], w: 0.18, n: [0, 0, 1], t: 'out', fr: 'c' } }, b: { bar: { c: [0, 1.32, 0.27], w: 0.18, n: [0, 0.5, -0.8], t: 'out', fr: 'c' } } },
      MA: 'preacher',
    },
  },
  pushdown: {
    view: 'tq', eq: [TOWER(0, 0.66, 180, 1.95)], cable: { from: FROM_TOWER(), handle: 'sbar', wide: true },
    a: S({ r: [10, 0, 0], bar: { c: [0, 1.13, 0.38], w: 0.13, n: [0, -1, 0.3] }, apole: [0.15, -0.3, -1] }),
    b: { bar: { c: [0, 0.8, 0.2], w: 0.13, n: [0, -0.3, -1] } },
  },
  ohext: {
    view: 'tq', hold: 'dbMid',
    a: S({ hand: { L: { p: [0.11, 1.45, -0.2], n: [0, 0.6, -0.8], t: [-1, 0, 0], fr: 'c' } }, apole: [0.25, 1, 0.35] }),
    b: { hand: { L: { p: [0.11, 1.95, 0.04], n: [0, 0.1, 1], t: [-1, 0, 0] } } },
    v: { KB: { eq: [TOWER(0, -0.55, 0, 0.4)], hold: null, cable: { from: FROM_TOWER(), handle: 'rope', wide: true }, a: { r: [22, 0, 0] } } },
  },
  lateral: {
    view: 'front', hold: 'db2',
    a: S({ r: [5, 0, 0], hand: { L: { p: [0.24, 0.84, 0.12], n: [-1, 0, 0], t: [0, 0, 1], fr: 'c' } }, apole: [0.4, -0.1, -1] }),
    b: { hand: { L: { p: [0.76, 1.37, 0.14], n: [0, -1, 0.05], t: [0, -0.15, 1], fr: 'c' } }, apole: [0.4, 0.8, -0.6] },
  },
  frontraise: {
    view: 'side', hold: 'db2',
    a: S({ hand: { L: { p: [0.2, 0.82, 0.12], n: [0, 0, -1], t: [-1, 0, 0], fr: 'c' } }, apole: [0.4, -0.2, -1] }),
    b: { hand: { L: { p: [0.19, 1.42, 0.63], n: [0, -1, 0], t: [-1, 0, 0], fr: 'c' } }, apole: [0.6, 0.3, -1] },
  },
  facepull: {
    view: 'tq', eq: [TOWER(0, 1.25, 180, 1.72)], cable: { from: FROM_TOWER(), handle: 'rope', wide: true },
    a: S({ r: [-6, 0, 0], hand: { L: { p: [0.18, 1.56, 0.57], n: [-1, 0, 0], t: [0, 1, 0] } }, apole: [1, 0.1, 0] }),
    b: { hand: { L: { p: [0.25, 1.62, 0.12], n: [-0.2, 0, 1], t: [-1, 0, 0] } }, apole: [1, 0.3, -0.4] },
  },
  shrug: {
    view: 'front', hold: 'barbell',
    a: S({ bar: { c: [0, 0.77, 0.12], w: 0.25, n: [0, 0, -1] }, apole: [0.4, 0, -1] }),
    b: { el: 22, bar: { c: [0, 0.85, 0.12], w: 0.25, n: [0, 0, -1] } },
    v: { KH: { hold: 'db2', a: { hand: { L: { p: [0.24, 0.79, 0.04], n: [-1, 0, 0], t: [0, 0, 1] } } }, b: { el: 22, hand: { L: { p: [0.24, 0.87, 0.04], n: [-1, 0, 0], t: [0, 0, 1] } } } } },
  },
  squat: {
    view: 'tq', hold: 'barbell', eq: [RACK],
    a: S({ foot: WIDE, lpole: [0.4, 0, 1], bar: { c: [0, 1.47, -0.1], w: 0.42, n: [0, 0.3, 1], fr: 'c' }, apole: [0.3, -1, -0.5] }),
    b: { r: [42, 0, 0], p: [0, 0.52, -0.24], fit: null, hd: -28 },
    v: {
      KH: { hold: 'dbMid', eq: [], a: { bar: { c: [0, 1.22, 0.24], w: 0.07, n: [-0.3, 0.4, 0.4], fr: 'c' }, apole: [0.4, -1, 0.3] }, b: { r: [22, 0, 0], p: [0, 0.5, -0.2], hd: -15 } },
      KG: { hold: null, eq: [], a: { bar: null, hand: { L: { p: [0.2, 1.36, 0.6], n: [0, -1, 0], t: [-1, 0, 0], k: 'o', fr: 'c' } }, apole: [0.4, -0.5, -1] }, b: { r: [22, 0, 0], p: [0, 0.5, -0.22], hd: -10 } },
      MA: 'beltsquat',
    },
  },
  lunge: {
    view: 'side', hold: 'db2',
    a: { p: [0, 0.9, -0.02], fit: { legs: 1, k: 0.995, side: 'L' }, foot: { L: { p: [0.12, 0, 0.36], f: [0.08, 0, 1] }, R: { p: [-0.12, 0, -0.4], f: [0, -0.7, 0.7], u: [0, 0.7, 0.7], piv: 'ball' } },
      hand: HANG_L(0.8, 0.04, 0.25), lpole: [0.1, 0, 1] },
    b: { p: [0, 0.5, -0.04], fit: null },
    v: {
      SM: { hold: 'smith', eq: [{ m: 'smith', p: [0, 0, -0.12] }], a: { hand: null, bar: { c: [0, 1.47, -0.1], w: 0.42, n: [0, 0.3, 1], fr: 'c' }, apole: [0.3, -1, -0.5] } },
      KG: { hold: null, a: { hand: { L: { p: [0.05, 1.18, 0.28], n: [-1, 0, 0.3], t: [0, 1, 0], k: 'o', fr: 'c' } }, apole: [0.8, -1, 0] } },
    },
  },
  deadlift: {
    view: 'tq', hold: 'barbell2',
    a: S({ r: [57, 0, 0], p: [0, 0.56, -0.17], fit: null, hd: -18, bar: { c: [0, 0.225, 0.07], w: 0.25, n: [0, 0, -1] }, apole: [0.3, 0, -1], lpole: [0.25, 0, 1] }),
    b: { r: [-3, 0, 0], p: [0, 0.92, -0.05], fit: { legs: 1, k: 0.995 }, hd: 0, bar: { c: [0, 0.76, 0.12], w: 0.25, n: [0, 0, -1] } },
  },
  rdl: {
    view: 'tq', hold: 'barbell',
    a: S({ bar: { c: [0, 0.76, 0.12], w: 0.25, n: [0, 0, -1] }, apole: [0.3, 0, -1] }),
    b: { r: [70, 0, 0], p: [0, 0.86, -0.25], fit: null, hd: -20, bar: { c: [0, 0.42, 0.13], w: 0.25, n: [0, 0, -1] } },
    v: { KH: { hold: 'db2', a: { bar: null, hand: { L: { p: [0.17, 0.77, 0.12], n: [0, 0, -1], t: [-1, 0, 0] } } }, b: { bar: null, hand: { L: { p: [0.17, 0.43, 0.14], n: [0, 0, -1], t: [-1, 0, 0] } } } } },
  },
  hipthrust: {
    view: 'tq', hold: 'barbell', eq: [{ m: 'bench_flat', p: [0, 0, -0.5], ry: 90 }],
    a: { r: [-58, 0, 0], p: [0, 0.32, 0.02], foot: { L: { p: [0.2, 0, 0.5], f: [0.15, 0, 1] } }, hd: 25,
      bar: { c: [0, 0.97, 0.17], w: 0.42, n: [0, -0.2, -1], fr: 'p' }, apole: [0.5, 1, 0.3] },
    b: { r: [-90, 0, 0], p: [0, 0.53, 0.07], hd: 40 },
    v: { KG: { hold: null, eq: [{ m: 'mat', p: [0, 0, 0] }],
      a: { r: [-90, 0, 0], p: [0, 0.2, 0.05], rest: 0.01, bar: null, foot: { L: { p: [0.15, 0.01, 0.45], f: [0.1, 0, 1] } }, hd: 0,
        hand: { L: { p: [0.3, 0.012, -0.05], n: [0, -1, 0], t: [0, 0, -1], k: 'f' } }, apole: [1, 0.2, 0] },
      b: { r: [-62, 0, 0], p: [0, 0.32, 0.06], rest: null, hd: 30 } } },
  },
  legpress: {
    view: 'side', eq: [{ m: 'leg_press', p: [0, 0, 0], sled: { off: 0.0 } }],
    a: { r: [-38, 0, 0], p: [0, 0.55, -0.05], rest: { n: [0, 0.616, 0.788], p: [0, 0.645, -0.388] },
      foot: { L: { p: [0.14, 0.67, 0.42], f: [0, 0.707, 0.707], u: [0, 0.707, -0.707] } }, lpole: [0.25, 1, 0],
      hand: { L: { p: [0.27, 0.42, -0.05], n: [-1, 0, 0], t: [0, 0, 1] } }, apole: [0.3, -1, -0.3] },
    b: { foot: { L: { p: [0.14, 0.9, 0.65], f: [0, 0.707, 0.707], u: [0, 0.707, -0.707] } } },
  },
  legext: {
    view: 'side', eq: [{ m: 'leg_ext', p: [0, 0, 0.14], arm: { ry: -0.4, rz: 0.06, at: 0.12 } }],
    a: { r: [-8, 0, 0], p: [0, 0.6, -0.05], rest: 0.51, th: [0.12, -0.2, 1, 'w'], sh: [0.03, -1, 0.05, 'w'], ft: 'rel',
      hand: { L: { p: [0.26, 0.46, 0.08], n: [-1, 0, 0], t: [0, 0, 1] } }, apole: [0.3, -1, -0.4] },
    b: { sh: [0.03, 0.12, 1, 'w'] },
  },
  legcurl: {
    view: 'side', eq: [{ m: 'leg_curl', p: [0, 0, -0.1], arm: { ry: 0.06, rz: -0.43, at: 0.1, side: 'back' } }],
    a: { r: [90, 0, 0], p: [0, 0.75, -0.08], rest: 0.6, th: [0.05, -1, 0], sh: [0.02, -1, 0.0], ft: 'rel', hd: 25,
      hand: { L: { p: [0.22, 0.6, 0.62], n: [-0.3, -1, 0], t: [-1, 0, 0.3] } }, apole: [0.6, -1, -0.3] },
    b: { sh: [0.02, 0.85, -0.5, 'w'] },
  },
  calf: {
    view: 'side', eq: [{ m: 'step', p: [0, 0, 0.14] }],
    a: S({ foot: { L: { p: [0.12, 0.095, 0.1], f: [0.1, 0.32, 1], u: [0, 1, -0.32], piv: 'ball' } }, hand: HANG_L(0.8, 0.04, 0.25), fit: { legs: 1, k: 0.995 } }),
    b: { foot: { L: { p: [0.12, 0.095, 0.1], f: [0.1, -0.75, 0.66], u: [0, 0.66, 0.75], piv: 'ball' } } },
    v: {
      SM: { hold: 'smith', eq: [{ m: 'step', p: [0, 0, 0.14] }, { m: 'smith', p: [0, 0, -0.12] }], a: { hand: null, bar: { c: [0, 1.47, -0.1], w: 0.42, n: [0, 0.3, 1], fr: 'c' }, apole: [0.3, -1, -0.5] } },
      MA: { hold: null, a: { hand: { L: { p: [0.2, 1.43, -0.02], n: [0, -0.2, 1], t: [-1, 0, 0], fr: 'c' } }, apole: [0.3, -1, -0.5] } },
    },
  },
  crunch: {
    view: 'side', eq: [{ m: 'mat', p: [0, 0, 0] }],
    a: { r: [-90, 0, 0], p: [0, 0.15, 0.0], rest: 0.01, foot: { L: { p: [0.13, 0.01, 0.48], f: [0.1, 0, 1] } }, lpole: [0.2, 1, 0],
      hand: { L: { p: [0.07, 1.63, -0.06], n: [-0.6, 0, 0.8], t: [0, 1, 0], k: 'o', fr: 'c' } }, apole: [1, 0.2, 0], hd: 12 },
    b: { sp: [36, 0, 0], hd: 25 },
  },
  plank: {
    view: 'side', eq: [{ m: 'mat', p: [0, 0, -0.45] }], hold1: true,
    a: { r: [79, 0, 0], p: [0, 0.22, -0.45], hand: { L: { p: [0.06, 0.015, 0.28], n: [0, -1, 0], t: [-0.6, 0, 0.8], k: 'o' } }, apole: [0.2, -1, -0.2],
      foot: { L: { p: [0.1, 0.01, -1.3], f: [0, -0.85, 0.5], u: [0, 0.5, 0.85], piv: 'ball' } }, hd: 5 },
  },
  hangleg: {
    view: 'tq', eq: [{ m: 'power_tower', p: [0, 0, 0] }],
    a: { r: [-3, 0, 0], p: [0, 1.1, -0.04], fit: { arms: 1, k: 0.99 }, bar: { c: [0, 2.25, 0], w: 0.27, n: [0, 0.1, 1] }, apole: [1, 0, 0.2],
      th: [0.04, -1, 0.05], sh: [0.01, -1, -0.04], ft: 'rel' },
    b: { r: [-14, 0, 0], sp: [14, 0, 0], th: [0.04, 0.1, 1], sh: [0.01, 0.05, 1] },
  },
  twist: {
    view: 'tq', eq: [{ m: 'mat', p: [0, 0, 0.1] }],
    a: { r: [-40, 0, 0], p: [0, 0.15, -0.02], rest: 0.01, foot: { L: { p: [0.13, 0.01, 0.46], f: [0.12, 0, 1] } }, lpole: [0.3, 1, 0.2],
      hand: { L: { p: [0.05, 1.12, 0.3], n: [-1, 0, 0.2], t: [0, 1, 0.2], k: 'x', fr: 'c' } }, apole: [0.5, -1, 0], sp: [8, 0, 34] },
    b: { sp: [8, 0, -34] },
  },
  carry: {
    view: 'front', hold: 'dbL', gnd: 'feet',
    a: { sp: [0, 18, 0], ua: [0.12, -1, 0.02, 'w'], fa: [0.04, -1, 0.05, 'w'], pr: 0, k: 'g' },
    b: { sp: [0, -14, 0] },
  },
  run: {
    view: 'side', gnd: 'feetY', k: 'x',
    a: { r: [8, 0, 0], thL: [0.05, -0.75, 0.66], shL: [0, -1, 0.05, 'w'], thR: [-0.05, -0.92, -0.38], shR: [0, -0.35, -0.94, 'w'],
      uaL: [0.12, -0.85, -0.5], faL: [0.04, 0.35, 0.94], uaR: [-0.12, -0.85, 0.48], faR: [-0.04, 0.7, 0.72], ft: 'rel' },
    b: { thR: [-0.05, -0.75, 0.66], shR: [0, -1, 0.05, 'w'], thL: [0.05, -0.92, -0.38], shL: [0, -0.35, -0.94, 'w'],
      uaR: [-0.12, -0.85, -0.5], faR: [-0.04, 0.35, 0.94], uaL: [0.12, -0.85, 0.48], faL: [0.04, 0.7, 0.72] },
  },
  bike: {
    view: 'side', eq: [{ m: 'bike', p: [0, 0, 0] }], crank: true, loop: true,
    a: { r: [28, 0, 0], p: [0, 0.99, -0.3], rest: 0.925, hand: { L: { p: [0.2, 1.06, 0.38], n: [0, -1, 0.2], t: [-1, 0, 0] } }, apole: [0.6, -0.6, -0.4], lpole: [0.2, 0, 1] },
  },
  stretch: {
    view: 'side', eq: [{ m: 'mat', p: [0, 0, 0] }], hold1: true,
    a: { r: [-4, 0, 0], p: [0, 0.52, -0.08], foot: { L: { p: [0.13, 0.01, 0.45], f: [0.08, 0, 1] }, R: 0 }, thR: [-0.06, -1, -0.45, 'w'], shR: [0, -0.05, -1, 'w'], ftR: [0, -0.2, -1, 'w'],
      hand: { L: { p: [0.13, 0.95, 0.24], n: [0, -1, 0], t: [-1, 0, 0.3], k: 'o', fr: 'c' } }, apole: [0.5, -0.3, -0.5], lpole: [0.1, 0, 1] },
  },
  quad: {
    view: 'side', eq: [{ m: 'mat', p: [0, 0, -0.1] }], hold1: true,
    a: { r: [90, 0, 0], p: [0, 0.56, -0.28], th: [0.08, -1, 0.0, 'w'], sh: [0, -0.04, -1, 'w'], ft: [0, -0.3, -1, 'w'], hd: 8,
      hand: { L: { p: [0.17, 0.012, 0.18], n: [0, -1, 0], t: [-1, 0, 0.1], k: 'f' } }, apole: [0.2, 0, -1] },
  },
  deepsquat: {
    view: 'tq', hold1: true,
    a: { r: [26, 0, 0], p: [0, 0.32, -0.14], foot: { L: { p: [0.2, 0, 0.02], f: [0.45, 0, 1] } }, lpole: [0.6, 0, 1], hd: -12,
      hand: { L: { p: [0.03, 1.2, 0.24], n: [-1, 0, 0], t: [0, 1, 0.3], k: 'f', fr: 'c' } }, apole: [1, -0.4, 0.3] },
  },
  swing: {
    view: 'side', hold: 'kb',
    a: S({ foot: WIDE, r: [62, 0, 0], p: [0, 0.79, -0.27], fit: null, hd: -15, hand: { L: { p: [0.03, 0.5, -0.08], n: [0, 0.2, -1], t: [-1, 0, 0] } }, apole: [0.2, 0, -1] }),
    b: { r: [-4, 0, 0], p: [0, 0.92, -0.05], fit: { legs: 1, k: 0.995 }, hd: 0, hand: { L: { p: [0.03, 1.32, 0.6], n: [0, -1, 0], t: [-1, 0, 0] } } },
  },
  kickback: {
    view: 'side', eq: [TOWER(0, 0.95, 180, 0.12)], cable: { from: FROM_TOWER(), ankle: 'L' },
    a: { r: [24, 0, 0], p: [-0.02, 0.9, 0.12], fit: { legs: 1, k: 0.99, side: 'R' }, foot: { R: { p: [-0.11, 0, 0.17], f: [-0.08, 0, 1] } },
      hand: { L: { p: [0.26, 1.18, 0.86], n: [-1, 0, 0], t: [0, 1, 0] } }, apole: [0.3, -1, -0.5],
      thL: [0.06, -1, 0.15, 'w'], shL: [0, -1, -0.05, 'w'], ftL: 'rel' },
    b: { thL: [0.06, -0.45, -0.89, 'w'], shL: [0, -0.62, -0.78, 'w'] },
  },
  abduct: {
    view: 'front', eq: [{ m: 'abductor', p: [0, 0, 0], pads: true }],
    a: { r: [-12, 0, 0], p: [0, 0.6, -0.04], rest: 0.49, th: [0.06, 0, 1, 'w'], sh: [0.03, -1, 0.05, 'w'], ft: 'rel',
      hand: { L: { p: [0.25, 0.49, -0.02], n: [-1, 0, 0], t: [0, 0, 1] } }, apole: [0.3, -1, -0.4] },
    b: { th: [0.5, 0, 0.86, 'w'], sh: [0.12, -1, 0.05, 'w'] },
  },
  abwheel: {
    view: 'side', hold: 'abwheel', eq: [{ m: 'mat', p: [0, 0, 0.3] }],
    a: { r: [68, 0, 0], p: [0, 0.5, -0.02], bar: { c: [0, 0.092, 0.42], w: 0.12, n: [0, -0.6, -0.8] }, apole: [0.3, 0, -1], hd: 5,
      thL: [0.08, -1, -0.04, 'w'], shL: [0, -0.06, -1, 'w'], thR: [-0.08, -1, -0.04, 'w'], shR: [0, -0.06, -1, 'w'], ft: [0, -0.3, -1, 'w'] },
    b: { r: [74, 0, 0], p: [0, 0.3, 0.33], bar: { c: [0, 0.092, 1.25], w: 0.12, n: [0, -0.95, -0.3] }, thL: [0.08, -0.38, -0.92, 'w'], thR: [-0.08, -0.38, -0.92, 'w'], apole: [0.3, -1, 0] },
  },
  hyperext: {
    view: 'side', eq: [{ m: 'hyper', p: [0, 0, 0] }],
    a: { r: [130, 0, 0], p: [0, 0.98, 0.1], rest: { n: [0, 0.707, 0.707], p: [0, 0.935, 0.135] },
      foot: { L: { p: [0.1, 0.39, -0.42], f: [0, -0.707, 0.707], u: [0, 0.707, 0.707] } }, lpole: [0.2, -1, 1],
      hand: { L: { p: [-0.1, 1.3, 0.16], n: [0, 0, -1], t: [0, 1, 0], k: 'o', fr: 'c' } }, apole: [0.5, -1, 0.3], hd: -5 },
    b: { r: [45, 0, 0] },
  },
  goodmorning: {
    view: 'tq', hold: 'barbell', eq: [RACK],
    a: S({ bar: { c: [0, 1.47, -0.1], w: 0.42, n: [0, 0.3, 1], fr: 'c' }, apole: [0.3, -1, -0.5] }),
    b: { r: [70, 0, 0], p: [0, 0.86, -0.24], fit: null, hd: -30 },
  },
  clean: {
    view: 'tq', hold: 'barbell',
    a: S({ r: [57, 0, 0], p: [0, 0.56, -0.17], fit: null, hd: -18, bar: { c: [0, 0.225, 0.07], w: 0.27, n: [0, 0, -1] }, apole: [0.3, 0, -1], lpole: [0.25, 0, 1] }),
    b: { r: [8, 0, 0], p: [0, 0.74, -0.1], fit: null, hd: 0, bar: { c: [0, 1.42, 0.14], w: 0.27, n: [0, 1, -0.3], fr: 'c' }, apole: [0.3, -0.25, 1] },
  },
  stepup: {
    view: 'side', hold: 'db2', eq: [{ m: 'box', p: [0, 0, 0.36] }],
    a: { r: [12, 0, 0], p: [0, 0.9, -0.06], fit: { legs: 1, k: 0.995, side: 'R' }, foot: { L: { p: [0.12, 0.45, 0.33], f: [0.08, 0, 1] }, R: { p: [-0.12, 0, -0.08], f: [-0.08, 0, 1] } },
      hand: HANG_L(0.8, 0.04, 0.25), lpole: [0.1, 0, 1] },
    b: { r: [2, 0, 0], p: [0, 1.36, 0.28], fit: { legs: 1, k: 0.995, side: 'L' }, foot: { L: { p: [0.12, 0.45, 0.33], f: [0.08, 0, 1] }, R: { p: [-0.12, 0.93, 0.6], f: [-0.05, -0.3, 1] } } },
  },
  nordic: {
    view: 'side', eq: [{ m: 'nordic', p: [0, 0, -0.02] }], gnd: 'knees', gndY: 0.105, gndZ: 0.04,
    a: { r: [0, 0, 0], th: [0.08, -1, 0.02, 'w'], sh: [0, -0.04, -1, 'w'], ft: [0, -0.4, -1, 'w'], ua: [0.25, -1, 0.15], fa: [0.15, -0.3, 1], k: 'o' },
    b: { r: [62, 0, 0], th: [0.08, -0.48, 0.88, 'w'], ua: [0.25, -0.2, 1], fa: [0.1, -0.2, 1] },
  },
  pullover: {
    view: 'side', hold: 'dbMid', eq: [BENCH],
    a: { r: [-90, 0, 0], p: [0, 0.6, 0.06], rest: 0.43, hd: -4, foot: { L: { p: [0.25, 0, 0.52], f: [0.15, 0, 1] } },
      hand: { L: { p: [0.07, 0.6, -1.0], n: [0, 1, 0], t: [-1, 0, 0] } }, apole: [0.6, 0.2, -0.3] },
    b: { hand: { L: { p: [0.07, 0.98, -0.38], n: [0, 0, -1], t: [1, 0, 0] } } },
  },
};

/* Maschinen-Varianten auf der Sitzstation (Hebel zu den Griffen) */
const SEAT = (back) => ({ m: 'machine_seat', p: [0, 0, 0], back });
const SEATED = { r: [-6, 0, 0], p: [0, 0.6, 0.02], rest: 0.49, foot: { L: { p: [0.16, 0, 0.42], f: [0.12, 0, 1] } }, lpole: [0.2, 0, 1] };
const MACHINES = {
  chestpress: { view: 'tq', eq: [SEAT(-8)], lever: { pivot: [0.34, 1.55, -0.32] }, hold: null,
    a: Object.assign({}, SEATED, { hand: { L: { p: [0.27, 1.1, 0.2], n: [-1, 0, 0], t: [0, 1, 0] } }, apole: [1, -0.4, -0.5] }),
    b: { hand: { L: { p: [0.2, 1.12, 0.6], n: [-1, 0, 0], t: [0, 1, 0] } }, apole: [0.6, -1, -0.2] } },
  shoulderpress: { view: 'tq', eq: [SEAT(-4)], lever: { pivot: [0.34, 0.95, -0.5] }, hold: null,
    a: Object.assign({}, SEATED, { hand: { L: { p: [0.29, 1.15, 0.08], n: [0, 0.1, 1], t: [-1, 0, 0] } }, apole: [0.4, -0.7, 0.4] }),
    b: { hand: { L: { p: [0.2, 1.64, 0.06], n: [0, 0.2, 1], t: [-1, 0, 0] } } } },
  butterfly: { view: 'front', eq: [SEAT(-6)], lever: { pivot: [0.12, 1.9, -0.22] }, hold: null,
    a: Object.assign({}, SEATED, { hand: { L: { p: [0.7, 1.22, 0.05], n: [-0.2, 0, 1], t: [0, 1, 0] } }, apole: [0.5, -0.4, -1] }),
    b: { hand: { L: { p: [0.08, 1.22, 0.45], n: [-1, 0, 0], t: [0, 1, 0] } }, apole: [0.8, -0.6, -0.5] } },
  preacher: { view: 'side', eq: [SEAT(-6)], lever: { pivot: [0.3, 0.98, 0.42] }, hold: null,
    a: Object.assign({}, SEATED, { r: [10, 0, 0], hand: { L: { p: [0.2, 0.82, 0.7], n: [0, 0.6, 0.8], t: [1, 0, 0] } }, apole: [0, -1, 0.6] }),
    b: { hand: { L: { p: [0.2, 1.3, 0.42], n: [0, 0.3, -1], t: [1, 0, 0] } } } },
  beltsquat: { view: 'tq', hold: null, eq: [],
    a: S({ foot: WIDE, lpole: [0.4, 0, 1], hand: { L: { p: [0.2, 0.96, 0.12], n: [-1, 0, 0], t: [0, 0, 1], k: 'o', fr: 'p' } }, apole: [0.5, -1, -0.5] }),
    b: { r: [22, 0, 0], p: [0, 0.52, -0.2], fit: null } },
};

/** Muster + Equipment der Übung → fertiges Muster (mit Pose a/b) */
export function resolvePattern(key, eqKind) {
  const base = PATTERNS[key] || PATTERNS.ohp;
  let v = base.v && base.v[eqKind];
  if (typeof v === 'string') v = MACHINES[v];
  let pat;
  if (v && MACHINES[base.v[eqKind]] === v) pat = Object.assign({}, v, { v: null });
  else if (v) pat = Object.assign({}, base, v, { a: Object.assign({}, base.a, v.a || {}), b: Object.assign({}, base.b || {}, v.b || {}) });
  else {
    pat = Object.assign({}, base);
    if (['KG', 'BD', 'CA', 'MA'].includes(eqKind) && pat.hold !== 'abwheel') { pat.hold = null; pat.cable = null; if (eqKind === 'MA') pat.eq = (pat.eq || []).filter((e) => e.m !== 'squat_rack'); }
    if (eqKind === 'SM' && ['barbell', 'barbell2'].includes(base.hold)) {
      const z = base.a.bar && !base.a.bar.fr ? base.a.bar.c[2] : -0.12;
      pat.hold = 'smith'; pat.eq = (base.eq || []).filter((e) => e.m !== 'squat_rack').concat([{ m: 'smith', p: [0, 0, z] }]);
    }
    if (eqKind === 'SZ' && ['barbell', 'barbell2'].includes(base.hold)) pat.hold = 'ezbar';
  }
  if (pat.cable && pat.cable.each && pat.cable.from2) pat.cable = Object.assign({}, pat.cable);
  const DEF = { r: [0, 0, 0], sp: [0, 0, 0], hd: 0, el: 0 };
  pat._A = Object.assign({}, DEF, pat.a); pat._B = Object.assign({}, pat._A, pat.b || {});
  if (pat.crank) pat.dyn = bikeDyn;
  pat.key = key; pat.eqKind = eqKind;
  return pat;
}

/* Ergometer: Füße auf den Pedalen, Kurbel dreht kontinuierlich */
function bikeDyn(P, t) {
  const a = t * 2 * Math.PI; const c = [0, 0.3, 0.0], r = 0.17;
  const ped = (ph, x) => [x, c[1] - r * Math.cos(a + ph) + 0.03, c[2] + r * Math.sin(a + ph)];
  P.foot = { L: { p: ped(0, 0.14), f: [0.05, -0.15, 1], piv: 'ball' }, R: { p: ped(Math.PI, -0.14), f: [-0.05, -0.15, 1], piv: 'ball' } };
}

export const PROP_OF = {};
