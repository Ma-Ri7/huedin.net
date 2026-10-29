/**
 * tools/test-trash.js — test funcțional pentru ștergerea reversibilă (coș).
 *
 * Rulează într-un SANDBOX (copie temporară a proiectului), deci NU atinge
 * niciodată datele reale. Verifică:
 *   1. ștergerea mută fișierele în coș (nu le distruge);
 *   2. fotografia dispare din catalog, din locație și din media.json;
 *   3. coșul păstrează metadatele complete;
 *   4. restaurarea readuce totul identic (fișiere bit-cu-bit);
 *   5. o fotografie legacy ștearsă NU reapare după re-extracție (integrare reală);
 *   6. golirea coșului șterge definitiv fișierele;
 *   7. operațiunile invalide sunt refuzate.
 *
 * Rulare:  node tools/test-trash.js     (sau: npm run test-trash)
 */
import { mkdtempSync, mkdirSync, copyFileSync, writeFileSync, readFileSync, existsSync, rmSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { softDeletePhoto, restorePhoto, purgeTrash, loadTrash, deletedIds } from './lib/photos.js';

const PROJECT = join(dirname(fileURLToPath(import.meta.url)), '..');
const SANDBOX = mkdtempSync(join(tmpdir(), 'huedin-trash-'));

let pass = 0;
const failures = [];

function t(name, fn) {
  try {
    fn();
    pass++;
    console.log('  ✓ ' + name);
  } catch (e) {
    failures.push(name + ' :: ' + e.message);
    console.log('  ✗ ' + name + ' — ' + e.message);
  }
}

function eq(actual, expected, msg) {
  const a = JSON.stringify(actual);
  const b = JSON.stringify(expected);
  if (a !== b) throw new Error((msg || '') + ' așteptat ' + b + ', primit ' + a);
}

function ok(value, msg) {
  if (!value) throw new Error(msg || 'condiție falsă');
}

const readJson = (rel) => JSON.parse(readFileSync(join(SANDBOX, rel), 'utf8'));
const hash = (rel) => createHash('sha256').update(readFileSync(join(SANDBOX, rel))).digest('hex');
const exists = (rel) => existsSync(join(SANDBOX, rel));

/* ---------------------- construirea sandbox-ului ---------------------- */
console.log('\n' + '='.repeat(72));
console.log('TEST ȘTERGERE REVERSIBILĂ — sandbox: ' + SANDBOX);
console.log('='.repeat(72));

mkdirSync(join(SANDBOX, 'data'), { recursive: true });
mkdirSync(join(SANDBOX, 'backup'), { recursive: true });
mkdirSync(join(SANDBOX, 'tools', 'lib'), { recursive: true });
mkdirSync(join(SANDBOX, 'assets', 'js'), { recursive: true });

for (const rel of ['backup/legacy-index.html', 'data/photos.json', 'data/locations.json', 'data/media.json']) {
  copyFileSync(join(PROJECT, rel), join(SANDBOX, rel));
}
copyFileSync(join(PROJECT, 'tools', 'extract.js'), join(SANDBOX, 'tools', 'extract.js'));
copyFileSync(join(PROJECT, 'tools', 'lib', 'photos.js'), join(SANDBOX, 'tools', 'lib', 'photos.js'));
copyFileSync(join(PROJECT, 'assets', 'js', 'search-core.js'), join(SANDBOX, 'assets', 'js', 'search-core.js'));

// alegem o fotografie legacy din catalogul real
const catalog0 = readJson('data/photos.json');
const target = catalog0.photos.find((p) => p.origin !== 'manual' && p.image);
ok(target, 'nu am găsit nicio fotografie legacy în catalog');

// materializăm pe disc fișierele ei (în proiect imaginile există deja)
mkdirSync(join(SANDBOX, 'assets', 'img', 'portfolio'), { recursive: true });
mkdirSync(join(SANDBOX, 'assets', 'img', 'thumbs'), { recursive: true });
mkdirSync(join(SANDBOX, 'assets', 'img', 'previews'), { recursive: true });
mkdirSync(join(SANDBOX, 'foto'), { recursive: true });
writeFileSync(join(SANDBOX, target.image), 'IMAGINE-ORIGINALA-' + target.id);
writeFileSync(join(SANDBOX, 'assets/img/thumbs/' + target.id + '.webp'), 'THUMB-' + target.id);
writeFileSync(join(SANDBOX, 'assets/img/previews/' + target.id + '.webp'), 'PREVIEW-' + target.id);
writeFileSync(join(SANDBOX, 'foto/' + target.slug + '.html'), '<html>pagina ' + target.id + '</html>');

const originalHash = {
  image: hash(target.image),
  thumb: hash('assets/img/thumbs/' + target.id + '.webp'),
  preview: hash('assets/img/previews/' + target.id + '.webp'),
  page: hash('foto/' + target.slug + '.html')
};
const countBefore = catalog0.photos.length;

console.log('\nFotografia de test: ' + target.id + ' — „' + target.title + '”');

/* ------------------------------ 1. ștergere ------------------------------ */
let deletedFiles = 0;

t('ștergerea scoate fotografia din catalog', () => {
  softDeletePhoto(SANDBOX, target.id);
  const after = readJson('data/photos.json');
  eq(after.photos.length, countBefore - 1);
  eq(after.count, countBefore - 1);
  ok(!after.photos.some((p) => p.id === target.id), 'fotografia este încă în catalog');
});

t('ștergerea mută toate fișierele în coș (nu le distruge)', () => {
  ok(!exists(target.image), 'imaginea a rămas la locul ei');
  ok(!exists('assets/img/thumbs/' + target.id + '.webp'), 'miniătura a rămas');
  ok(!exists('assets/img/previews/' + target.id + '.webp'), 'preview-ul a rămas');
  ok(!exists('foto/' + target.slug + '.html'), 'pagina a rămas');

  const trash = loadTrash(SANDBOX);
  eq(trash.deleted.length, 1);
  deletedFiles = trash.deleted[0].moved.length;
  eq(deletedFiles, 4, 'număr de fișiere mutate');
  for (const m of trash.deleted[0].moved) ok(exists(m.to), 'fișierul nu e în coș: ' + m.to);
});

t('ștergerea curăță locația și media.json', () => {
  const locs = readJson('data/locations.json').locations;
  for (const l of locs) ok(!l.photoIds.includes(target.id), 'id încă în locația ' + l.id);
  ok(!readJson('data/media.json').variants[target.id], 'varianta media a rămas');
});

t('coșul păstrează metadatele complete (pentru restaurare identică)', () => {
  const entry = loadTrash(SANDBOX).deleted[0];
  eq(entry.photo.id, target.id);
  eq(entry.photo.title, target.title);
  eq(entry.photo.image, target.image);
  ok(entry.media, 'varianta media nu a fost păstrată');
  ok(entry.deletedAt && !isNaN(Date.parse(entry.deletedAt)), 'lipsește data ștergerii');
});

t('deletedIds() raportează fotografia ștearsă', () => {
  const ids = deletedIds(SANDBOX);
  ok(ids.has(target.id), 'id-ul șters nu apare în deletedIds()');
  eq(ids.size, 1);
});

/* -------------------- 5. integrare: re-extracția reală -------------------- */
t('o fotografie legacy ștearsă NU reapare după re-extracție', () => {
  execFileSync(process.execPath, [join(SANDBOX, 'tools', 'extract.js')],
    { cwd: SANDBOX, stdio: 'pipe', maxBuffer: 1024 * 1024 * 32 });
  const after = readJson('data/photos.json');
  ok(!after.photos.some((p) => p.id === target.id),
    'fotografia ștearsă a fost readusă de extract.js (ștergerea nu ar fi permanentă)');
  eq(after.photos.length, countBefore - 1, 'numărul de fotografii după re-extracție');
});


/* ----------------------------- 4. restaurare ----------------------------- */
t('restaurarea readuce fișierele identic (bit-cu-bit)', () => {
  restorePhoto(SANDBOX, target.id);
  ok(exists(target.image), 'imaginea nu a revenit');
  ok(exists('assets/img/thumbs/' + target.id + '.webp'), 'miniătura nu a revenit');
  ok(exists('assets/img/previews/' + target.id + '.webp'), 'preview-ul nu a revenit');
  ok(exists('foto/' + target.slug + '.html'), 'pagina nu a revenit');

  eq(hash(target.image), originalHash.image, 'imagine');
  eq(hash('assets/img/thumbs/' + target.id + '.webp'), originalHash.thumb, 'miniatură');
  eq(hash('assets/img/previews/' + target.id + '.webp'), originalHash.preview, 'preview');
  eq(hash('foto/' + target.slug + '.html'), originalHash.page, 'pagină');
});

t('restaurarea readuce fotografia în catalog, locație și media.json', () => {
  const after = readJson('data/photos.json');
  eq(after.photos.length, countBefore);
  eq(after.count, countBefore);
  const back = after.photos.find((p) => p.id === target.id);
  ok(back, 'fotografia nu a revenit în catalog');
  eq(back.title, target.title);
  eq(back.latitude, target.latitude);
  eq(back.longitude, target.longitude);

  if (target.locationId) {
    const loc = readJson('data/locations.json').locations.find((l) => l.id === target.locationId);
    ok(loc.photoIds.includes(target.id), 'id-ul nu a revenit în locație');
  }
  ok(readJson('data/media.json').variants[target.id], 'varianta media nu a revenit');
});

t('coșul este gol după restaurare', () => {
  eq(loadTrash(SANDBOX).deleted.length, 0);
  eq(deletedIds(SANDBOX).size, 0);
});

/* --------------------- 6. golirea definitivă a coșului --------------------- */
t('golirea coșului șterge definitiv fișierele', () => {
  softDeletePhoto(SANDBOX, target.id);
  const trashed = loadTrash(SANDBOX).deleted[0].moved.map((m) => m.to);
  const n = purgeTrash(SANDBOX);
  eq(n, 1, 'număr de intrări golite');
  for (const rel of trashed) ok(!exists(rel), 'fișierul a supraviețuit golirii: ' + rel);
  eq(loadTrash(SANDBOX).deleted.length, 0);
});

/* ------------------------- 7. operațiuni invalide ------------------------- */
t('ștergerea unui id inexistent este refuzată', () => {
  let err = null;
  try { softDeletePhoto(SANDBOX, 'p999999'); } catch (e) { err = e; }
  ok(err, 'ștergerea unui id inexistent nu a fost refuzată');
});

t('restaurarea unei fotografii care nu e în coș este refuzată', () => {
  let err = null;
  try { restorePhoto(SANDBOX, 'p999999'); } catch (e) { err = e; }
  ok(err, 'restaurarea unui id inexistent nu a fost refuzată');
});

/* ------------------------------- curățenie ------------------------------- */
rmSync(SANDBOX, { recursive: true, force: true });

console.log('\n' + '='.repeat(72));
console.log('TESTE COȘ: ' + pass + ' trecute, ' + failures.length + ' eșuate');
if (failures.length) {
  console.log('='.repeat(72));
  failures.forEach((f) => console.log('  X ' + f));
}
console.log('='.repeat(72));
process.exit(failures.length ? 1 : 0);

