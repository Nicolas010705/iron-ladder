/* Iron-Ladder-Tests: startet index.html in Chromium (Playwright), Supabase wird im Speicher nachgebaut.
   Aufruf: python3 build.py && node tests/run.mjs */
import { createRequire } from 'node:module';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const require = createRequire(import.meta.url);
const { chromium } = require('playwright');
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SB_URL = JSON.parse(fs.readFileSync(path.join(ROOT, 'supabase.json'), 'utf8')).url;

const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.json': 'application/json', '.webmanifest': 'application/json', '.woff2': 'font/woff2', '.svg': 'image/svg+xml', '.png': 'image/png', '.glb': 'model/gltf-binary', '.webp': 'image/webp' };
const server = http.createServer((req, res) => {
  let p = decodeURIComponent(new URL(req.url, 'http://x').pathname); if (p === '/') p = '/index.html';
  const f = path.join(ROOT, p);
  if (!f.startsWith(ROOT) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { res.writeHead(404); return res.end(); }
  res.writeHead(200, { 'Content-Type': TYPES[path.extname(f)] || 'application/octet-stream' }); fs.createReadStream(f).pipe(res);
});
await new Promise(r => server.listen(0, r));
const BASE = `http://localhost:${server.address().port}/`;

/* ---- Supabase im Speicher ---- */
function fakeSupabase() {
  const db = { profiles: [], workouts: [], food_days: [] };
  const keys = { profiles: ['user_id'], workouts: ['user_id', 'id'], food_days: ['user_id', 'day'] };
  const log = [];
  async function handle(route) {
    const req = route.request(); const u = new URL(req.url()); const m = req.method();
    const json = (b, s = 200) => route.fulfill({ status: s, contentType: 'application/json', body: b === null ? '' : JSON.stringify(b) });
    const tok = (req.headers()['authorization'] || '').replace('Bearer ', '');
    const me = tok.startsWith('tok-') ? tok.slice(4) : null;
    if (u.pathname === '/auth/v1/token') {
      const b = JSON.parse(req.postData() || '{}'); const email = b.email || 'x@y';
      const id = 'u-' + email.split('@')[0];
      return json({ access_token: 'tok-' + id, refresh_token: 'r-' + id, expires_in: 3600, user: { id, email } });
    }
    if (u.pathname === '/auth/v1/logout') return json(null, 204);
    if (u.pathname === '/auth/v1/user') return json({ id: me, email: me + '@test' });
    const t = u.pathname.replace('/rest/v1/', '');
    if (!db[t] || !me) return json({ message: 'nope' }, 401);
    const filt = r => { for (const [k, v] of u.searchParams) { if (['select', 'on_conflict'].includes(k)) continue;
      if (v.startsWith('eq.') && String(r[k]) !== v.slice(3)) return false;
      if (v.startsWith('in.(') && !v.slice(4, -1).split(',').map(decodeURIComponent).includes(String(r[k]))) return false; } return r.user_id === me; };
    log.push(m + ' ' + t + u.search);
    if (m === 'GET') return json(db[t].filter(filt));
    if (m === 'DELETE') { db[t] = db[t].filter(r => !filt(r)); return json(null, 204); }
    if (m === 'POST') { for (const row of JSON.parse(req.postData())) {
        if (row.user_id !== me) return json({ message: 'rls' }, 403);
        const i = db[t].findIndex(r => keys[t].every(k => r[k] === row[k])); if (i >= 0) db[t][i] = row; else db[t].push(row); }
      return json(null, 201); }
    return json(null, 405);
  }
  return { db, log, handle };
}

const browser = await chromium.launch();
let failed = 0;
async function test(name, fn) {
  const ctx = await browser.newContext({ serviceWorkers: 'block' });
  const sb = fakeSupabase(); await ctx.route(SB_URL + '/**', sb.handle);
  await ctx.route(/fonts\.g/, r => r.abort());
  const page = await ctx.newPage(); const errs = []; page.on('pageerror', e => errs.push(e.message));
  try { await fn(page, sb); if (errs.length) throw new Error('Seitenfehler: ' + errs.join('; ')); console.log('ok   ', name); }
  catch (e) { failed++; console.log('FAIL ', name, '\n     ', e.message); }
  await ctx.close();
}
const eq = (a, b, msg) => { if (JSON.stringify(a) !== JSON.stringify(b)) throw new Error(`${msg}: erwartet ${JSON.stringify(b)}, war ${JSON.stringify(a)}`); };
const ok = (c, msg) => { if (!c) throw new Error(msg); };
const idle = page => page.waitForFunction(() => !SB.busy);

/* Lokale Daten anlegen, ohne die Oberfläche durchzuklicken */
async function seed(page, local, owner) {
  await page.goto(BASE);
  await page.evaluate(([local, owner]) => {
    localStorage.clear();
    localStorage.setItem('ironladder.v1', JSON.stringify(local));
    if (owner) localStorage.setItem('ironladder.v1.owner', JSON.stringify(owner));
  }, [local, owner]);
  await page.reload();
}
const profile = (extra = {}) => ({ name: 'T', goal: 'muscle', days: 3, split: 'ppl', sex: 'm', age: 30, height: 180, weight: 80, activity: 1.55, rot: 0, customEx: [], customFoods: [], weights: {}, created: '2026-10-01', targets: { kcal: 2900, p: 176, c: 380, f: 72, tdee: 2700 }, _ts: 1, ...extra });
async function login(page, email) {
  await page.evaluate(e => sbLogin(e, 'passwort123', false), email); await idle(page);
}

await test('calcTargets: plausible Kalorien und Makros', async page => {
  await page.goto(BASE);
  const t = await page.evaluate(() => calcTargets({ weight: 80, height: 180, age: 30, sex: 'm', activity: 1.55, goal: 'muscle' }));
  ok(t.kcal > 2400 && t.kcal < 3400, 'kcal ' + t.kcal); ok(t.p >= 120 && t.p <= 200, 'Protein ' + t.p);
  ok(Math.abs(t.p * 4 + t.c * 4 + t.f * 9 - t.kcal) < 15, 'Makros ergeben die Kalorien');
});

await test('Erste Anmeldung übernimmt lokale Daten ins Konto', async (page, sb) => {
  await seed(page, { profile: profile(), workouts: [{ id: 'w1', date: '2026-11-01', items: [] }], food: { '2026-11-01': [{ id: 'f', kcal: 100 }] } });
  await login(page, 'anna@test');
  eq(sb.db.workouts.map(r => r.id), ['w1'], 'Training hochgeladen');
  eq(sb.db.food_days.map(r => r.day), ['2026-11-01'], 'Tag hochgeladen');
  eq(await page.evaluate(() => ownerGet().id), 'u-anna', 'Besitzer gesetzt');
});

await test('Kontowechsel lädt keine fremden Daten hoch, ohne zu fragen', async (page, sb) => {
  await seed(page, { profile: profile({ name: 'Anna' }), workouts: [{ id: 'wA', date: '2026-11-01', items: [] }], food: {} }, { id: 'u-anna', email: 'anna@test' });
  await login(page, 'ben@test');
  eq(sb.db.workouts.length + sb.db.profiles.length, 0, 'nichts hochgeladen');
  ok(await page.evaluate(() => !!SB.switchAsk), 'Frage wird gestellt');
  ok(await page.locator('[data-act="sbSwitch"][data-v="drop"]').isVisible(), 'Knopf „Vom Gerät entfernen“ sichtbar');
  await page.click('[data-act="sbSwitch"][data-v="drop"]'); await page.waitForFunction(() => !SB.switchAsk); await idle(page);
  eq(sb.db.workouts.length, 0, 'auch danach nichts von Anna im Konto von Ben');
  eq(await page.evaluate(() => [S.profile, S.workouts.length]), [null, 0], 'lokal geleert');
  eq(await page.evaluate(() => ownerGet().id), 'u-ben', 'Besitzer jetzt Ben');
});

await test('Kontowechsel mit „Übernehmen“ lädt die Daten hoch', async (page, sb) => {
  await seed(page, { profile: profile(), workouts: [{ id: 'wA', date: '2026-11-01', items: [] }], food: {} }, { id: 'u-anna', email: 'anna@test' });
  await login(page, 'ben@test');
  await page.click('[data-act="sbSwitch"][data-v="keep"]'); await page.waitForFunction(() => !SB.switchAsk); await idle(page);
  eq(sb.db.workouts.map(r => r.user_id + '/' + r.id), ['u-ben/wA'], 'Training im Konto von Ben');
});

await test('Geleerter Ernährungstag kommt nicht zurück', async (page, sb) => {
  await seed(page, { profile: profile(), workouts: [], food: { '2026-11-02': [{ id: 'a', kcal: 300 }] } });
  await login(page, 'anna@test');
  eq(sb.db.food_days[0].entries.length, 1, 'Tag in der Cloud');
  await page.evaluate(() => { S.food['2026-11-02'] = []; saveDay('2026-11-02'); });
  await page.waitForFunction(() => true); await page.waitForTimeout(200);
  eq(sb.db.food_days.map(r => r.entries.length), [0], 'leere Liste in der Cloud statt Löschung');
  /* zweites Gerät hatte den alten Stand mit Eintrag */
  const p2 = await page.context().newPage();
  await p2.goto(BASE);
  await p2.evaluate(() => { localStorage.clear(); });
  await p2.evaluate(P => {
    localStorage.setItem('ironladder.v1', JSON.stringify({ profile: P, workouts: [], food: { '2026-11-02': [{ id: 'a', kcal: 300 }] } }));
    localStorage.setItem('ironladder.v1.owner', JSON.stringify({ id: 'u-anna', email: 'anna@test' }));
    localStorage.setItem('ironladder.v1.sb', JSON.stringify({ sess: { access: 'tok-u-anna', refresh: 'r', exp: Date.now() + 3600e3, user: { id: 'u-anna', email: 'anna@test' } }, dayTs: { '2026-11-02': 1 } }));
  }, profile());
  await p2.reload(); await p2.waitForFunction(() => SB.on && !SB.busy);
  eq(await p2.evaluate(() => S.food['2026-11-02']), [], 'Gerät 2 übernimmt den leeren Tag');
  eq(sb.db.food_days.map(r => r.entries.length), [0], 'Cloud bleibt leer');
});

await test('Backup laden ersetzt Trainings und Tage auch im Konto', async (page, sb) => {
  await seed(page, { profile: profile(), workouts: [{ id: 'alt', date: '2026-10-01', items: [] }, { id: 'beide', date: '2026-10-02', items: [] }], food: { '2026-10-01': [{ id: 'x', kcal: 1 }] } });
  await login(page, 'anna@test');
  eq(sb.db.workouts.map(r => r.id).sort(), ['alt', 'beide'], 'vorher');
  const backup = { app: 'iron-ladder', v: 1, profile: profile({ name: 'Backup', delW: ['beide'] }), workouts: [{ id: 'beide', date: '2026-10-02', items: [] }, { id: 'neu', date: '2026-10-03', items: [] }], food: {} };
  await page.evaluate(b => importData(JSON.stringify(b)), backup); await page.waitForTimeout(100); await idle(page);
  eq(sb.db.workouts.map(r => r.id).sort(), ['beide', 'neu'], 'Trainings im Konto = Backup');
  eq(sb.db.food_days.map(r => r.entries.length), [0], 'Tag aus dem alten Stand geleert');
  eq(sb.db.profiles[0].data.name, 'Backup', 'Profil aus dem Backup');
});

await test('Fehlgeschlagene Speicherung wird automatisch wiederholt', async (page, sb) => {
  await seed(page, { profile: profile(), workouts: [], food: {} });
  await login(page, 'anna@test');
  let fail = 2; await page.context().route(SB_URL + '/rest/v1/workouts**', r => fail-- > 0 ? r.fulfill({ status: 503, body: 'down' }) : r.fallback());
  await page.evaluate(() => { const w = { id: 'wR', date: '2026-11-03', items: [] }; S.workouts.push(w); saveWorkout(w); });
  await page.waitForFunction(() => SB.dirty); ok(true);
  await page.waitForFunction(() => !SB.dirty && !SB.busy, null, { timeout: 30000 });
  eq(sb.db.workouts.map(r => r.id), ['wR'], 'nach Wiederholung in der Cloud');
});

await test('Fotos gehören zum Konto', async page => {
  await seed(page, { profile: profile(), workouts: [], food: {} }, { id: 'u-anna', email: 'anna@test' });
  const n = await page.evaluate(async () => {
    await phPut({ id: 'p1', date: '2026-11-01', ts: 1, data: 'data:,', uid: 'u-anna' });
    await phPut({ id: 'p2', date: '2026-11-01', ts: 2, data: 'data:,', uid: 'u-ben' });
    return (await phAll()).map(p => p.id);
  });
  eq(n, ['p1'], 'nur eigene Fotos');
});

await test('Bildschirmsperre während des Trainings', async page => {
  await seed(page, { profile: profile(), workouts: [], food: {} });
  await page.evaluate(() => { window.__wl = 0; Object.defineProperty(navigator, 'wakeLock', { value: { request: async () => { __wl++; return { release: async () => { __wl--; }, addEventListener() {} }; } } }); });
  await page.click('[data-act="startFree"]').catch(() => page.evaluate(() => newDraft('Test', [], null)));
  await page.waitForFunction(() => window.__wl === 1, null, { timeout: 3000 });
  await page.evaluate(() => { S.draft = null; render(); });
  await page.waitForFunction(() => window.__wl === 0, null, { timeout: 3000 });
});

/* ---- Trainingsablauf ---- */
async function startBench(page, width = 390) {
  await page.setViewportSize({ width, height: 800 });
  await seed(page, { profile: profile({ tourDone: true }), workouts: [], food: {} });
  await page.evaluate(() => newDraft('Test', ['bankdruecken', 'langhantelrudern'], null));
}

await test('Hantelsatz ohne Gewicht lässt sich nicht abhaken', async page => {
  await startBench(page);
  await page.click('[data-act="toggleSet"][data-v="0.0"]');
  eq(await page.evaluate(() => S.draft.items[0].sets[0].done), false, 'Satz bleibt offen');
  ok(/Gewicht/.test(await page.locator('.toast').innerText()), 'Hinweis auf fehlendes Gewicht');
  await page.fill('[data-set="0.0.w"]', '60');
  await page.click('[data-act="toggleSet"][data-v="0.0"]');
  eq(await page.evaluate(() => { const s = S.draft.items[0].sets[0]; return [s.done, num(s.w), num(s.rir)]; }), [true, 60, 2], 'mit Gewicht abgehakt, RIR-Vorschlag übernommen');
});

await test('Leere Sätze zählen beim Speichern nicht als Ziel', async page => {
  await startBench(page);
  await page.evaluate(() => { const it = S.draft.items[0]; it.sets.forEach((s) => { s.w = 0; s.r = 8; s.done = true; }); const r = S.draft.items[1].sets[0]; r.w = 50; r.r = 8; r.done = true; finishWorkout({ feel: 3, rpe: 7, tags: [] }); });
  const w = await page.evaluate(() => S.workouts[S.workouts.length - 1]);
  eq(w.items.map((i) => i.ex), ['langhantelrudern'], 'nur das Training mit Gewicht gespeichert');
  eq(w.goals.total, 1, 'nur eine Übung bewertet');
});

for (const width of [320, 360, 390]) {
  await test(`Satz-Tabelle passt auf ${width} px`, async page => {
    await startBench(page, width);
    await page.fill('[data-set="0.0.w"]', '60');
    await page.click('[data-act="toggleSet"][data-v="0.0"]');
    const r = await page.evaluate(() => ({ wide: [...document.querySelectorAll('.sets, .sets *')].filter((e) => e.getBoundingClientRect().right > innerWidth + 0.5).length, shifted: [...document.querySelectorAll('*')].filter((e) => e.scrollLeft > 0).length, doc: document.scrollingElement.scrollWidth - innerWidth }));
    eq(r, { wide: 0, shifted: 0, doc: 0 }, 'nichts ragt über den Rand, nichts verrutscht');
  });
}

await test('Pausenleiste verdeckt die letzten Knöpfe nicht', async page => {
  await startBench(page);
  await page.fill('[data-set="0.0.w"]', '60');
  await page.click('[data-act="toggleSet"][data-v="0.0"]');
  await page.waitForSelector('#rest');
  await page.evaluate(() => window.scrollTo(0, 1e6)); await page.waitForTimeout(100);
  const hidden = await page.evaluate(() => { const bar = document.getElementById('rest').getBoundingClientRect(); const cards = document.querySelectorAll('.ex-card'); const btns = [...cards[cards.length - 1].querySelectorAll('.row .btn')];
    return btns.filter((b) => { const r = b.getBoundingClientRect(); return r.bottom > bar.top && r.top < bar.bottom; }).map((b) => b.textContent.trim()); });
  eq(hidden, [], 'Knöpfe der letzten Übung liegen über der Pausenleiste');
});

await test('Rundgang legt sich nicht über ein gerade gestartetes Training', async page => {
  await page.setViewportSize({ width: 390, height: 800 });
  await page.goto(BASE); await page.evaluate(() => localStorage.clear()); await page.reload();
  // Onboarding abschließen und sofort ein Training starten (schneller als der 0,7-s-Timer des Rundgangs)
  await page.evaluate(() => { for (let i = 0; i < 8 && document.querySelector('[data-act="obNext"]'); i++) document.querySelector('[data-act="obNext"]').click(); document.querySelector('[data-act="startPlan"]').click(); });
  await page.waitForTimeout(1200);
  eq(await page.evaluate(() => !!TOUR), false, 'kein Rundgang während des Trainings');
  await page.evaluate(() => { S.draft = null; draftSave(); });
  await page.click('[data-act="tab"][data-v="home"]');
  await page.waitForFunction(() => !!TOUR, null, { timeout: 3000 });
});

await browser.close(); server.close();
console.log(failed ? `\n${failed} Test(s) fehlgeschlagen` : '\nAlle Tests bestanden');
process.exit(failed ? 1 : 0);
