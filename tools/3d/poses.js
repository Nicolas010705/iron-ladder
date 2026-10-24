/* Iron Ladder – Bewegungsmuster für die 3D-Figur.
 *
 * Koordinaten (Meter, Welt): y oben, z = Blickrichtung der Figur, x = linke Körperseite.
 * Jede Übung hat Pose a (Start) und b (Umkehrpunkt); die Figur pendelt dazwischen.
 *
 * Pose-Felder
 *  r  [pitch, yaw, roll]  Körper (Becken); pitch + = nach vorn kippen
 *  sp [beugen, seitneigen, drehen]  Wirbelsäule; hd = Kopf nicken
 *  p  [x,y,z] Beckenposition (nur bei gnd:'none' / 'contact')
 *  ua/fa  Oberarm/Unterarm-Richtung, th/sh Oberschenkel/Unterschenkel, ft Fuß
 *         [x,y,z, Bezug] Bezug: 'c' Brustkorb (Standard Arme), 'p' Becken (Standard Beine), 'w' Welt
 *         Werte gelten für links; rechts wird gespiegelt, außer es gibt uaR/faR/…
 *  pr Unterarm-Pronation (Grad), el Schultern hochziehen (Grad), g Griff 0..1
 * Muster-Felder
 *  gnd  'feet' Füße stehen fest | 'feetY' nur Bodenhöhe | 'hands' Hände fest an hang
 *       'knees' Knie fest | 'footL'/'footR' ein Fuß fest | 'none' Becken an p | 'contact' tiefster Kontakt auf Boden
 *  view Kamera: 'side' | 'front' | 'tq' | 'back'
 *  props statische Geräte; hold Halteposition
 */
const STAND = { ua: [0.1, -1, 0.02, 'w'], fa: [0.06, -1, 0.12, 'w'], th: [0.05, -1, 0.02, 'w'], sh: [0.03, -1, -0.02, 'w'] };
const HANG = { ua: [0.1, -1, 0.02, 'w'], fa: [0.04, -1, 0.06, 'w'] };
const S = (o) => Object.assign({}, STAND, o);

export const PATTERNS = {
  bench: {
    gnd: 'none', view: 'high', props: [['bench', 0, 0.42, -0.25, 1.2, 0.3]],
    a: { r: [-90, 0, 0], p: [0, 0.54, 0.12], ua: [0.32, 0.12, 0.95], fa: [0.02, 0.05, 1], th: [0.35, -0.12, 0.95, 'w'], sh: [0.05, -1, 0.05, 'w'], pr: 70, hd: -5 },
    b: { ua: [0.85, -0.35, -0.38], fa: [0.04, 0.12, 1], pr: 70 },
  },
  incline: {
    gnd: 'none', view: 'high', props: [['ibench', 0, 0.45, 0, 45]],
    a: { r: [-48, 0, 0], p: [0, 0.6, 0.05], ua: [0.3, 0.22, 0.93], fa: [0.03, 0.15, 1], th: [0.3, -0.05, 0.95, 'w'], sh: [0.05, -1, 0.1, 'w'], pr: 70 },
    b: { ua: [0.82, -0.3, -0.45], fa: [0.03, 0.25, 1], pr: 70 },
  },
  ohp: {
    gnd: 'feet', view: 'side',
    a: S({ ua: [0.7, -0.45, 0.55], fa: [0.02, 1, 0.12], pr: 70 }),
    b: { ua: [0.28, 1, 0.08], fa: [0.04, 1, 0.02], pr: 70 },
  },
  pushup: {
    gnd: 'contact', contact: ['hands', 'feet'], anchorXZ: 'hands', view: 'side', g: 0.1,
    a: { r: [66, 0, 0], ua: [0.18, -1, 0.02, 'w'], fa: [0.02, -1, 0.04, 'w'], th: [0.05, -1, 0], sh: [0.02, -1, 0], ft: [0, -1, 0.35, 'w'], pr: 60 },
    b: { r: [84, 0, 0], ua: [0.5, -0.12, -0.85, 'w'], fa: [0.02, -1, 0.06, 'w'], pr: 60 },
  },
  dip: {
    gnd: 'hands', hang: [0, 1.25, 0.05], view: 'side', props: [['dipbars', 1.25]],
    a: { r: [8, 0, 0], ua: [0.12, -1, -0.03, 'w'], fa: [0.02, -1, 0.05, 'w'], th: [0.05, -1, 0.25], sh: [0, -0.5, -0.86], pr: 0 },
    b: { r: [22, 0, 0], ua: [0.2, -0.25, -0.95, 'w'], fa: [0.03, -1, 0.12, 'w'] },
  },
  fly: {
    gnd: 'feet', view: 'front', cable: { each: true, anchors: [[1.15, 1.95, 0.25], [-1.15, 1.95, 0.25]] },
    a: S({ r: [12, 0, 0], ua: [0.95, 0.12, 0.25], fa: [0.82, 0.05, 0.55], pr: 20 }),
    b: { ua: [0.32, -0.3, 0.9], fa: [-0.45, -0.15, 0.88], pr: 20 },
  },
  'fly@KH': {
    gnd: 'none', view: 'high', props: [['bench', 0, 0.42, -0.25, 1.2, 0.3]],
    a: { r: [-90, 0, 0], p: [0, 0.54, 0.12], ua: [0.3, 0.05, 0.95], fa: [-0.2, 0, 1], th: [0.35, -0.12, 0.95, 'w'], sh: [0.05, -1, 0.05, 'w'], pr: 0 },
    b: { ua: [0.95, -0.15, 0.2], fa: [0.85, 0, 0.5], pr: 0 },
  },
  row: {
    gnd: 'feet', view: 'side',
    a: S({ r: [55, 0, 0], th: [0.08, -1, 0.3, 'w'], sh: [0.03, -1, -0.12, 'w'], ua: [0.12, -1, 0.04, 'w'], fa: [0.02, -1, 0.05, 'w'], pr: 70, hd: -20 }),
    b: { ua: [0.28, 0.15, -1, 'w'], fa: [0.02, -1, 0.15, 'w'], pr: 70 },
  },
  cablerow: {
    gnd: 'none', view: 'side', props: [['seat', 0, 0.36, 0.05, 0.5, 0.35], ['block', 0, 0.2, 0.98, 0.35, 0.4, 0.08]],
    cable: { anchors: [[0, 0.45, 1.25]] },
    a: { r: [18, 0, 0], p: [0, 0.47, 0], ua: [0.12, -0.05, 1, 'w'], fa: [0.03, 0, 1, 'w'], th: [0.14, 0.12, 1, 'w'], sh: [0.02, -0.3, 1, 'w'], ft: [0, 0.5, 0.6, 'w'], pr: 10 },
    b: { r: [-6, 0, 0], ua: [0.22, -0.35, -0.9, 'w'], fa: [0.02, -0.05, 1, 'w'] },
  },
  pulldown: {
    gnd: 'none', view: 'side', props: [['seat', 0, 0.45, 0.02, 0.45, 0.4], ['pad', 0, 0.68, 0.32]],
    cable: { anchors: [[0, 2.45, 0.08]], bar: 1.2 },
    a: { r: [-12, 0, 0], p: [0, 0.56, 0], ua: [0.4, 1, 0.08, 'w'], fa: [0.1, 1, 0.02, 'w'], th: [0.15, 0, 1, 'w'], sh: [0.02, -1, 0.05, 'w'], pr: 75 },
    b: { r: [-18, 0, 0], ua: [0.95, -0.3, -0.18, 'w'], fa: [0.08, 1, 0.12, 'w'] },
  },
  pullup: {
    gnd: 'hands', hang: [0, 2.2, 0], view: 'tq', props: [['pullbar', 2.2]],
    a: { r: [-3, 0, 0], ua: [0.33, 1, 0.02, 'w'], fa: [0.08, 1, 0.02, 'w'], th: [0.04, -1, 0.12], sh: [0, -1, -0.5], pr: 80, ft: [0, -0.6, 0.5, 'w'] },
    b: { r: [-12, 0, 0], ua: [0.55, -0.83, -0.12, 'w'], fa: [0.1, 1, 0.12, 'w'] },
  },
  curl: {
    gnd: 'feet', view: 'side',
    a: S({ ua: [0.1, -1, 0.02, 'w'], fa: [0.08, -1, 0.1, 'w'], pr: -25 }),
    b: { ua: [0.08, -1, 0.15, 'w'], fa: [0.08, 0.75, 0.62, 'w'], pr: -25 },
  },
  pushdown: {
    gnd: 'feet', view: 'tq', cable: { anchors: [[0, 2.05, 0.42]], bar: 0.36 },
    a: S({ r: [14, 0, 0], ua: [0.1, -1, 0.08, 'w'], fa: [0.04, 0.35, 1, 'w'], pr: 75 }),
    b: { ua: [0.1, -1, 0.04, 'w'], fa: [0.03, -1, 0.18, 'w'], pr: 75 },
  },
  ohext: {
    gnd: 'feet', view: 'side', hold1: true,
    a: S({ ua: [0.12, 1, -0.05, 'w'], fa: [-0.22, -0.55, -0.8, 'w'], pr: 15 }),
    b: { ua: [0.1, 1, 0.02, 'w'], fa: [-0.12, 1, 0.08, 'w'], pr: 15 },
  },
  lateral: {
    gnd: 'feet', view: 'front',
    a: S({ r: [6, 0, 0], ua: [0.18, -1, 0.1], fa: [0.15, -1, 0.25], pr: 75 }),
    b: { ua: [1, -0.04, 0.12], fa: [1, 0.06, 0.25], pr: 75 },
  },
  frontraise: {
    gnd: 'feet', view: 'side',
    a: S({ ua: [0.1, -1, 0.1, 'w'], fa: [0.06, -1, 0.15, 'w'], pr: 80 }),
    b: { ua: [0.12, 0.08, 1, 'w'], fa: [0.08, 0.12, 1, 'w'], pr: 80 },
  },
  facepull: {
    gnd: 'feet', view: 'tq', cable: { anchors: [[0, 1.62, 1.25]] },
    a: S({ r: [-6, 0, 0], ua: [0.15, 0.2, 1, 'w'], fa: [0.05, 0.18, 1, 'w'], pr: 0 }),
    b: { ua: [0.95, 0.2, -0.25, 'w'], fa: [-0.15, 0.72, 0.68, 'w'], pr: 0 },
  },
  shrug: {
    gnd: 'feet', view: 'front',
    a: S({ ua: [0.14, -1, 0.02, 'w'], fa: [0.04, -1, 0.04, 'w'], pr: 70 }),
    b: { el: 24 },
  },
  squat: {
    gnd: 'feet', view: 'side',
    a: S({ th: [0.12, -1, 0.02, 'w'], ua: [0.42, -0.9, -0.22], fa: [0.12, 1, -0.2], pr: 75, ft: 'flatout' }),
    b: { r: [42, 0, 0], th: [0.32, -0.08, 0.95, 'w'], sh: [0.1, -1, -0.42, 'w'], hd: -30 },
  },
  lunge: {
    gnd: 'feet', view: 'side',
    a: S({ thL: [0.06, -1, 0.35, 'w'], shL: [0, -1, -0.05, 'w'], thR: [-0.06, -1, -0.3, 'w'], shR: [0, -0.75, -0.66, 'w'], ftR: [0, -0.85, 0.5, 'w'], ua: [0.14, -1, 0.02, 'w'], fa: [0.04, -1, 0.05, 'w'], pr: 10 }),
    b: { thL: [0.06, -0.12, 1, 'w'], shL: [0, -1, -0.06, 'w'], thR: [-0.06, -0.78, -0.62, 'w'], shR: [0, -0.18, -1, 'w'], ftR: [0, -0.92, 0.35, 'w'] },
  },
  deadlift: {
    gnd: 'feet', view: 'side',
    a: S({ r: [58, 0, 0], th: [0.14, -0.55, 0.85, 'w'], sh: [0.05, -1, -0.22, 'w'], ua: [0.14, -1, 0.0, 'w'], fa: [0.03, -1, 0.02, 'w'], pr: 70, hd: -25 }),
    b: S({ r: [0, 0, 0], ua: [0.14, -1, 0.02, 'w'], fa: [0.03, -1, 0.04, 'w'], pr: 70 }),
  },
  rdl: {
    gnd: 'feet', view: 'side',
    a: S({ ua: [0.14, -1, 0.04, 'w'], fa: [0.03, -1, 0.05, 'w'], pr: 70 }),
    b: { r: [68, 0, 0], th: [0.06, -1, 0.18, 'w'], sh: [0.03, -1, -0.04, 'w'], ua: [0.14, -1, 0.0, 'w'], fa: [0.02, -1, 0.02, 'w'], hd: -25 },
  },
  hipthrust: {
    gnd: 'feet', view: 'side', props: [['bench', 0, 0.42, -0.86, 0.42, 0.42]], barAt: 'hips',
    a: { r: [-66, 0, 0], th: [0.15, 0.38, 0.92, 'w'], sh: [0.02, -1, 0.08, 'w'], ua: [0.3, -0.45, 0.85, 'w'], fa: [0.05, -0.4, 0.9, 'w'], pr: 70, hd: 25 },
    b: { r: [-88, 0, 0], th: [0.15, 0.02, 1, 'w'], sh: [0.02, -1, -0.08, 'w'], ua: [0.3, 0.12, 0.95, 'w'], fa: [0.0, 0.1, 1, 'w'], hd: 35 },
  },
  legpress: {
    gnd: 'none', view: 'side', props: [['ibench', 0, 0.38, -0.1, 55]], sled: true,
    a: { r: [-55, 0, 0], p: [0, 0.5, 0], th: [0.25, 0.85, 0.5, 'w'], sh: [0.05, 0.2, 1, 'w'], ft: [0, 0.75, -0.25, 'w'], ua: [0.35, -0.85, 0.35], fa: [0.1, -0.2, 1], g: 1 },
    b: { th: [0.18, 0.55, 0.82, 'w'], sh: [0.12, 0.6, 0.8, 'w'], ft: [0, 0.82, -0.35, 'w'] },
  },
  legext: {
    gnd: 'none', view: 'side', props: [['seat', 0, 0.45, 0.06, 0.5, 0.4], ['back', 0, 0.45, -0.18, 75]], roller: 'shin',
    a: { r: [-12, 0, 0], p: [0, 0.57, 0], th: [0.14, 0, 1, 'w'], sh: [0.03, -1, 0.05, 'w'], ft: 'rel', ua: [0.25, -1, 0.1], fa: [0.05, -0.3, 1], g: 1 },
    b: { sh: [0.03, 0.15, 1, 'w'] },
  },
  legcurl: {
    gnd: 'none', view: 'side', props: [['bench', 0, 0.48, 0.1, 1.15, 0.32]], roller: 'heel',
    a: { r: [90, 0, 0], p: [0, 0.62, -0.25], th: [0.05, -1, 0], sh: [0.02, -1, 0], ft: 'rel', ua: [0.35, -0.2, 0.95, 'w'], fa: [-0.1, -0.5, 0.85, 'w'], g: 1, hd: 20 },
    b: { sh: [0.02, 0.85, -0.5, 'w'] },
  },
  calf: {
    gnd: 'feet', view: 'side', props: [['block', 0, 0.04, 0.07, 0.5, 0.18, 0.08]], toes: true,
    a: S({ ft: [0, 0.1, 1, 'w'], ua: [0.14, -1, 0.02, 'w'], fa: [0.04, -1, 0.05, 'w'] }),
    b: { ft: [0, -0.9, 0.45, 'w'] },
  },
  crunch: {
    gnd: 'none', view: 'side', g: 0.2,
    a: { r: [-90, 0, 0], p: [0, 0.12, 0], th: [0.14, 0.72, 0.68, 'w'], sh: [0.03, -1, 0.45, 'w'], ua: [0.9, 0.35, 0.2], fa: [-0.55, 0.8, -0.2], hd: 10 },
    b: { sp: [38, 0, 0], hd: 25 },
  },
  plank: {
    gnd: 'contact', contact: ['elbows', 'feet'], anchorXZ: 'elbows', view: 'side', hold: true, g: 0.4,
    a: { r: [79, 0, 0], ua: [0.15, -1, 0.04, 'w'], fa: [-0.05, 0, 1, 'w'], th: [0.05, -1, 0], sh: [0.02, -1, 0], ft: [0, -1, 0.35, 'w'], pr: 60, hd: 5 },
  },
  hangleg: {
    gnd: 'hands', hang: [0, 2.2, 0], view: 'tq', props: [['pullbar', 2.2]],
    a: { r: [-3, 0, 0], ua: [0.33, 1, 0.02, 'w'], fa: [0.08, 1, 0.02, 'w'], th: [0.04, -1, 0.05], sh: [0.01, -1, -0.04], pr: 80, ft: 'rel' },
    b: { r: [-12, 0, 0], th: [0.04, 0.1, 1], sh: [0.01, 0.0, 1], sp: [12, 0, 0] },
  },
  twist: {
    gnd: 'none', view: 'tq', g: 0.8,
    a: { r: [-38, 0, 0], p: [0, 0.13, 0], th: [0.16, 0.6, 0.8, 'w'], sh: [0.02, -0.55, 0.85, 'w'], ua: [0.35, -0.55, 0.75], fa: [-0.75, 0.1, 0.65], sp: [10, 0, 32] },
    b: { sp: [10, 0, -32] },
  },
  carry: {
    gnd: 'feet', view: 'front', oneDB: 'L',
    a: S({ sp: [0, 18, 0], ua: [0.12, -1, 0.02], fa: [0.04, -1, 0.05], pr: 0 }),
    b: { sp: [0, -14, 0] },
  },
  run: {
    gnd: 'feetY', view: 'side', g: 0.5,
    a: { r: [8, 0, 0], thL: [0.05, -0.75, 0.66], shL: [0, -1, 0.05, 'w'], thR: [-0.05, -0.92, -0.38], shR: [0, -0.35, -0.94, 'w'],
      uaL: [0.12, -0.85, -0.5], faL: [0.04, 0.35, 0.94], uaR: [-0.12, -0.85, 0.48], faR: [-0.04, 0.7, 0.72], ft: 'rel' },
    b: { thR: [-0.05, -0.75, 0.66], shR: [0, -1, 0.05, 'w'], thL: [0.05, -0.92, -0.38], shL: [0, -0.35, -0.94, 'w'],
      uaR: [-0.12, -0.85, -0.5], faR: [-0.04, 0.35, 0.94], uaL: [0.12, -0.85, 0.48], faL: [0.04, 0.7, 0.72] },
  },
  bike: {
    gnd: 'none', view: 'side', props: [['bike']], g: 1,
    a: { r: [30, 0, 0], p: [0, 0.9, -0.12], thL: [0.12, -0.35, 0.94, 'w'], shL: [0.02, -1, -0.12, 'w'], thR: [-0.12, -0.95, 0.32, 'w'], shR: [-0.02, -1, -0.05, 'w'],
      ua: [0.2, -0.75, 0.62, 'w'], fa: [0.03, -0.35, 0.94, 'w'], ft: 'rel', pr: 80 },
    b: { thR: [-0.12, -0.35, 0.94, 'w'], shR: [-0.02, -1, -0.12, 'w'], thL: [0.12, -0.95, 0.32, 'w'], shL: [0.02, -1, -0.05, 'w'] },
  },
  stretch: {
    gnd: 'contact', contact: ['feet', 'knees'], view: 'side', hold: true,
    a: { r: [-4, 0, 0], thL: [0.08, -0.08, 1, 'w'], shL: [0, -1, -0.02, 'w'], thR: [-0.06, -1, -0.5, 'w'], shR: [0, -0.05, -1, 'w'], ftR: [0, -0.2, -1, 'w'], ua: [0.15, -1, 0.15, 'w'], fa: [0.1, -0.4, 0.9, 'w'], g: 0.2 },
  },
  quad: {
    gnd: 'contact', contact: ['hands', 'knees'], view: 'side', hold: true, g: 0.1,
    a: { r: [90, 0, 0], th: [0.1, -1, 0.0, 'w'], sh: [0, -0.04, -1, 'w'], ft: [0, -0.3, -1, 'w'], ua: [0.15, -1, 0.02, 'w'], fa: [0.02, -1, 0.04, 'w'], pr: 60, hd: 5 },
  },
  deepsquat: {
    gnd: 'feet', view: 'tq', hold: true, g: 0.2,
    a: { r: [28, 0, 0], th: [0.42, 0.05, 0.9, 'w'], sh: [0.12, -1, -0.5, 'w'], ua: [0.4, -0.55, 0.75], fa: [-0.55, 0.45, 0.72], ft: 'flatout', hd: -15 },
  },
  swing: {
    gnd: 'feet', view: 'side',
    a: S({ r: [60, 0, 0], th: [0.12, -1, 0.3, 'w'], sh: [0.05, -1, -0.1, 'w'], ua: [0.04, -0.8, -0.6, 'w'], fa: [0.0, -0.75, -0.66, 'w'], pr: 80, hd: -20 }),
    b: S({ r: [-4, 0, 0], ua: [0.05, 0.02, 1, 'w'], fa: [0.0, 0.05, 1, 'w'], pr: 80 }),
  },
  kickback: {
    gnd: 'footR', view: 'side', cable: { ankle: 'L', anchors: [[0.12, 0.12, 0.9]] },
    a: S({ r: [22, 0, 0], thL: [0.06, -1, 0.18, 'w'], shL: [0, -1, -0.05, 'w'], ua: [0.12, -0.5, 0.86, 'w'], fa: [0.02, -0.3, 1, 'w'] }),
    b: { thL: [0.06, -0.45, -0.89, 'w'], shL: [0, -0.62, -0.78, 'w'] },
  },
  abduct: {
    gnd: 'none', view: 'front', props: [['seat', 0, 0.45, 0.08, 0.5, 0.45], ['back', 0, 0.45, -0.17, 78]],
    a: { r: [-10, 0, 0], p: [0, 0.57, 0], th: [0.06, 0, 1, 'w'], sh: [0.02, -1, 0.04, 'w'], ua: [0.35, -1, 0.15], fa: [0.08, -0.4, 1], g: 1 },
    b: { th: [0.55, 0, 0.83, 'w'], sh: [0.1, -1, 0.04, 'w'] },
  },
  abwheel: {
    gnd: 'knees', view: 'side', wheel: true, g: 1,
    a: { r: [68, 0, 0], th: [0.08, -1, -0.05, 'w'], sh: [0, -0.06, -1, 'w'], ft: [0, -0.3, -1, 'w'], ua: [0.12, -1, 0.12, 'w'], fa: [0.02, -1, 0.06, 'w'], pr: 70, hd: 5 },
    b: { r: [72, 0, 0], th: [0.08, -0.35, -0.94, 'w'], ua: [0.12, 1, 0.85], fa: [0.04, 1, 0.85] },
  },
  hyperext: {
    gnd: 'none', view: 'side', props: [['hyper']],
    a: { r: [128, 0, 0], p: [0, 0.98, 0], th: [0.05, -0.68, -0.73, 'w'], sh: [0.02, -0.68, -0.73, 'w'], ft: 'rel', ua: [0.5, -0.55, 0.65], fa: [-0.8, 0.35, 0.45], g: 0.6, hd: -10 },
    b: { r: [42, 0, 0], hd: 0 },
  },
  goodmorning: {
    gnd: 'feet', view: 'side',
    a: S({ ua: [0.42, -0.9, -0.22], fa: [0.12, 1, -0.2], pr: 75 }),
    b: { r: [70, 0, 0], th: [0.06, -1, 0.2, 'w'], sh: [0.03, -1, -0.05, 'w'], hd: -30 },
  },
  clean: {
    gnd: 'feet', view: 'side',
    a: S({ r: [58, 0, 0], th: [0.14, -0.55, 0.85, 'w'], sh: [0.05, -1, -0.22, 'w'], ua: [0.14, -1, 0.0, 'w'], fa: [0.03, -1, 0.02, 'w'], pr: 70, hd: -25 }),
    b: { r: [6, 0, 0], th: [0.12, -0.85, 0.5, 'w'], sh: [0.04, -1, -0.3, 'w'], ua: [0.35, 0.1, 0.94], fa: [-0.2, 0.45, -0.7], pr: 60 },
  },
  stepup: {
    gnd: 'footL', footY: 0.45, view: 'side', props: [['block', 0.05, 0.225, 0.3, 0.5, 0.45, 0.45]],
    a: S({ r: [14, 0, 0], thL: [0.08, -0.25, 0.97, 'w'], shL: [0, -1, -0.05, 'w'], thR: [-0.06, -1, -0.15, 'w'], shR: [0, -1, -0.04, 'w'], ua: [0.14, -1, 0.02, 'w'], fa: [0.04, -1, 0.05, 'w'] }),
    b: { r: [2, 0, 0], thL: [0.06, -1, 0.02, 'w'], shL: [0, -1, -0.03, 'w'], thR: [-0.06, -0.55, 0.83, 'w'], shR: [0, -1, -0.1, 'w'] },
  },
  nordic: {
    gnd: 'knees', view: 'side', props: [['block', 0, 0.04, -0.05, 0.5, 0.65, 0.08], ['ankbar']], g: 0.2,
    a: { r: [0, 0, 0], th: [0.08, -1, 0.02, 'w'], sh: [0, -0.04, -1, 'w'], ft: [0, -0.4, -1, 'w'], ua: [0.25, -1, 0.15], fa: [0.15, -0.3, 1] },
    b: { r: [62, 0, 0], th: [0.08, -0.48, 0.88, 'w'], ua: [0.25, -0.2, 1], fa: [0.1, -0.2, 1] },
  },
  pullover: {
    gnd: 'none', view: 'side', props: [['bench', 0, 0.42, -0.25, 1.2, 0.3]], oneDB: 'mid',
    a: { r: [-90, 0, 0], p: [0, 0.54, 0.12], ua: [0.2, 0.92, -0.25], fa: [-0.05, 0.95, -0.15], th: [0.35, -0.12, 0.95, 'w'], sh: [0.05, -1, 0.05, 'w'], pr: 20 },
    b: { ua: [0.2, 0.15, 0.95], fa: [-0.15, 0.1, 1] },
  },
};

/* Standard-Equipment, wenn die Übung keins vorgibt */
export const PROP_OF = { LH: 'bar', SM: 'smith', SZ: 'ez', KH: 'db', KT: 'kb', KB: 'cable', MA: 'machine', KG: '', BD: '', CA: '' };

/* Varianten je Equipment: '<muster>@<equipment>' erbt vom Muster und überschreibt Teile */
const BACK_BAR = { ua: [0.42, -0.9, -0.22], fa: [0.12, 1, -0.2], pr: 75 };
const GOBLET = { ua: [0.3, -0.85, 0.45], fa: [-0.55, 0.8, 0.25], pr: 10 };
const ARMS_FWD = { ua: [0.2, -0.35, 1], fa: [0.05, -0.1, 1], pr: 30, g: 0.2 };
function variant(base, a, b, extra) {
  const P = PATTERNS[base];
  return Object.assign({}, P, extra || {}, { a: Object.assign({}, P.a, a), b: Object.assign({}, P.b || {}, b || {}) });
}
Object.assign(PATTERNS, {
  'calf@SM': variant('calf', BACK_BAR), 'calf@MA': variant('calf', BACK_BAR),
  'lunge@SM': variant('lunge', BACK_BAR),
  'squat@KH': variant('squat', GOBLET, {}, { oneDB: 'mid' }), 'squat@MA': variant('squat', BACK_BAR), 'squat@KG': variant('squat', ARMS_FWD, {}),
});
