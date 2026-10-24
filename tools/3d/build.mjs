// Baut die 3D-Dateien der App nach /3d:
//   iron3d.js  – Viewer + three.js als ein ES-Modul
//   body.glb   – komprimiertes Modell (aus body.raw.glb, erzeugt von tools/blender/build_model.py)
// Aufruf: cd tools/3d && npm i && node build.mjs
import { build } from 'esbuild';
import { execFileSync } from 'child_process';
import fs from 'fs';
const OUT = new URL('../../3d/', import.meta.url).pathname;
fs.mkdirSync(OUT, { recursive: true });
await build({ entryPoints: ['iron3d.src.js'], bundle: true, format: 'esm', minify: true, target: 'es2020', outfile: OUT + 'iron3d.js', legalComments: 'eof' });
console.log('iron3d.js', (fs.statSync(OUT + 'iron3d.js').size / 1024).toFixed(0), 'KB');
// Geräte (aus tools/blender/build_equipment.py → tools/3d/eq.raw/)
if (fs.existsSync('eq.raw')) {
  fs.mkdirSync(OUT + 'eq', { recursive: true }); let tot = 0;
  for (const f of fs.readdirSync('eq.raw').filter((f) => f.endsWith('.glb'))) {
    execFileSync('npx', ['gltf-transform', 'meshopt', 'eq.raw/' + f, OUT + 'eq/' + f, '--level', 'medium'], { stdio: 'ignore' });
    tot += fs.statSync(OUT + 'eq/' + f).size;
  }
  console.log('Geräte', (tot / 1024).toFixed(0), 'KB');
}
if (fs.existsSync('body.raw.glb')) {
  execFileSync('npx', ['gltf-transform', 'meshopt', 'body.raw.glb', OUT + 'body.glb', '--level', 'medium'], { stdio: 'inherit' });
  console.log('body.glb', (fs.statSync(OUT + 'body.glb').size / 1024).toFixed(0), 'KB');
}
