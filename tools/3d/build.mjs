// Baut die 3D-Dateien der App nach /3d:
//   iron3d.js  – Viewer + three.js als ein ES-Modul
//   body.glb   – komprimiertes Modell (aus body.raw.glb, erzeugt von tools/blender/build_model.py)
// Aufruf: cd tools/3d && npm i && node build.mjs
import { build } from 'esbuild';
import { execFileSync } from 'child_process';
import fs from 'fs';
import { fileURLToPath } from 'url';
const SH = { shell: process.platform === 'win32' };
const OUT = fileURLToPath(new URL('../../3d/', import.meta.url));
fs.mkdirSync(OUT, { recursive: true });
// Übungs-Animationen (aus tools/blender/build_anims.py → tools/3d/anim.raw/glb/): Keyframes ausdünnen, komprimieren
if (fs.existsSync('anim.raw/glb')) {
  const { NodeIO } = await import('@gltf-transform/core');
  const { EXTMeshoptCompression, ALL_EXTENSIONS } = await import('@gltf-transform/extensions');
  const { resample, prune } = await import('@gltf-transform/functions');
  const { MeshoptEncoder, MeshoptDecoder } = await import('meshoptimizer');
  await MeshoptEncoder.ready; await MeshoptDecoder.ready;
  const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ 'meshopt.encoder': MeshoptEncoder, 'meshopt.decoder': MeshoptDecoder });
  fs.mkdirSync(OUT + 'anim', { recursive: true });
  const raw = fs.readdirSync('anim.raw/glb').filter((f) => f.endsWith('.glb'));
  for (const f of fs.readdirSync(OUT + 'anim')) if (!raw.includes(f)) fs.rmSync(OUT + 'anim/' + f);
  let tot = 0;
  for (const f of raw) {
    const doc = await io.read('anim.raw/glb/' + f);
    await doc.transform(resample({ tolerance: 1e-4 }), prune());
    doc.createExtension(EXTMeshoptCompression).setRequired(true).setEncoderOptions({ method: EXTMeshoptCompression.EncoderMethod.QUANTIZE });
    await io.write(OUT + 'anim/' + f, doc); tot += fs.statSync(OUT + 'anim/' + f).size;
  }
  console.log('Animationen', raw.length, (tot / 1024).toFixed(0), 'KB');
}
const CLIPS = fs.existsSync(OUT + 'anim') ? fs.readdirSync(OUT + 'anim').filter((f) => f.endsWith('.glb')).map((f) => f.slice(0, -4)).sort() : [];
await build({ entryPoints: ['iron3d.src.js'], bundle: true, format: 'esm', minify: true, target: 'es2020', outfile: OUT + 'iron3d.js', legalComments: 'eof',
  define: { __IRON_CLIPS__: JSON.stringify(CLIPS) } });
console.log('iron3d.js', (fs.statSync(OUT + 'iron3d.js').size / 1024).toFixed(0), 'KB');
// Geräte (aus tools/blender/build_equipment.py → tools/3d/eq.raw/)
if (fs.existsSync('eq.raw')) {
  fs.mkdirSync(OUT + 'eq', { recursive: true }); let tot = 0;
  for (const f of fs.readdirSync('eq.raw').filter((f) => f.endsWith('.glb'))) {
    execFileSync('npx', ['gltf-transform', 'meshopt', 'eq.raw/' + f, OUT + 'eq/' + f, '--level', 'medium'], { stdio: 'ignore', ...SH });
    tot += fs.statSync(OUT + 'eq/' + f).size;
  }
  console.log('Geräte', (tot / 1024).toFixed(0), 'KB');
}
if (fs.existsSync('body.raw.glb')) {
  execFileSync('npx', ['gltf-transform', 'meshopt', 'body.raw.glb', OUT + 'body.glb', '--level', 'medium'], { stdio: 'inherit', ...SH });
  console.log('body.glb', (fs.statSync(OUT + 'body.glb').size / 1024).toFixed(0), 'KB');
}
