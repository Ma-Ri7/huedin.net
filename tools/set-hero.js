/**
 * tools/set-hero.js — schimbă imaginea de header a paginii principale.
 *
 * Varianta vizuală (recomandată): npm run serve -> tools/set-hero.html
 *
 * Comenzi:
 *   node tools/set-hero.js --show
 *   node tools/set-hero.js --list [--grep <text>]
 *   node tools/set-hero.js --image assets/img/previews/HUEDIN-1907.webp [--title "..."] [--year "1907"] [--alt "..."]
 *   node tools/set-hero.js --photo p028            (folosește o fotografie din arhivă)
 *   node tools/set-hero.js --reset                 (revine la imaginea implicită)
 *
 * Setarea se scrie în `data/site-config.json` și NU se pierde la `npm run build`.
 */
import { readFileSync, existsSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadSiteConfig, saveSiteConfig, resolveHero, heroCaption } from './lib/site-config.js';
import { ensurePreview } from './lib/thumbs.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

const args = {};
const argv = process.argv.slice(2);
for (let i = 0; i < argv.length; i++) {
  const a = argv[i];
  if (!a.startsWith('--')) continue;
  const key = a.slice(2);
  if (['show', 'list', 'reset', 'help'].includes(key)) { args[key] = true; continue; }
  const next = argv[i + 1];
  if (next === undefined || next.startsWith('--')) { args[key] = true; continue; }
  args[key] = next;
  i++;
}

const catalog = JSON.parse(readFileSync(join(ROOT, 'data', 'photos.json'), 'utf8'));
const photos = catalog.photos;
const config = loadSiteConfig(ROOT);

function fail(msg) {
  console.error('\nEROARE: ' + msg + '\n');
  process.exit(1);
}

if (args.help || argv.length === 0) {
  console.log(readFileSync(fileURLToPath(import.meta.url), 'utf8')
    .split('*/')[0].replace(/^\/\*\*?/, '').replace(/^ ?\* ?/gm, '').trim());
  process.exit(0);
}

/* ------------------------------ --show ------------------------------ */
if (args.show) {
  const hero = resolveHero(config, photos, photos[0]);
  console.log('Imaginea de header:');
  console.log('  fișier:  ' + (hero.image || '— nesetat —'));
  console.log('  titlu:   ' + (hero.title || '—'));
  console.log('  perioadă:' + (hero.yearLabel || ' —'));
  console.log('  legendă: ' + heroCaption(hero));
  console.log('  sursă:   data/site-config.json');
  process.exit(0);
}

/* ------------------------------ --list ------------------------------ */
if (args.list) {
  const grep = args.grep ? String(args.grep).toLowerCase() : null;
  const ids = new Set(photos.map((p) => p.id));
  const previewsDir = join(ROOT, 'assets/img/previews');
  const extras = existsSync(previewsDir)
    ? readdirSync(previewsDir).filter((f) => /\.(webp|jpg|jpeg|png)$/i.test(f))
      .filter((f) => !ids.has(f.replace(/\.[^.]+$/, '')))
    : [];

  console.log('Imagini din arhivă' + (grep ? ' (filtrate)' : '') + ':');
  photos
    .filter((p) => !grep || (p.title + ' ' + p.yearLabel + ' ' + p.slug).toLowerCase().includes(grep))
    .slice(0, 200)
    .forEach((p) => console.log('  ' + p.id.padEnd(6) + p.slug.padEnd(38) + p.title + ' (' + p.yearLabel + ')'));

  if (extras.length) {
    console.log('\nAlte imagini din assets/img/previews/:');
    extras.filter((f) => !grep || f.toLowerCase().includes(grep))
      .forEach((f) => console.log('  assets/img/previews/' + f));
  }
  console.log('\nFolosește: node tools/set-hero.js --photo <slug>  sau  --image <cale>');
  process.exit(0);
}

/* ------------------------------ --reset ------------------------------ */
if (args.reset) {
  config.hero = { image: null, photoSlug: null, title: '', yearLabel: '', alt: '' };
  saveSiteConfig(ROOT, config);
  console.log('Imaginea de header a revenit la valoarea implicită (prima fotografie).');
  console.log('Rulează `npm run build` pentru a regenera paginile.');
  process.exit(0);
}

/* ------------------------------ setare ------------------------------ */
let image = args.image ? String(args.image).replace(/^\/+/, '').replace(/^\.\//, '') : null;

if (args.photo) {
  const photo = photos.find((p) => p.slug === args.photo || p.id === args.photo);
  if (!photo) fail('fotografia „' + args.photo + '” nu există. Folosește --list pentru a vedea opțiunile.');
  image = photo.image;
  if (!args.title) args.title = photo.title;
  if (!args.year) args.year = photo.yearLabel;
  if (!args.alt) args.alt = photo.alt || photo.title;
}

if (!image) fail('indică --image <cale>, --photo <slug> sau --show/--list/--reset.');

if (!/^assets\/img\//.test(image)) fail('calea trebuie să înceapă cu assets/img/ (primit: ' + image + ')');
if (!existsSync(join(ROOT, image))) fail('fișierul nu există: ' + image);

// preview pentru încărcare rapidă (dacă imaginea nu e deja un preview)
if (!image.startsWith('assets/img/previews/')) {
  try {
    const preview = await ensurePreview(image, { root: ROOT });
    if (preview) console.log('Preview generat: ' + preview.path + ' (' + preview.width + '×' + preview.height + ')');
  } catch (e) {
    console.warn('Preview-ul nu a putut fi generat (' + e.message + '); se folosește imaginea originală.');
  }
}

config.hero = {
  image,
  photoSlug: args.photo ? String(args.photo) : null,
  title: args.title !== undefined ? String(args.title) : '',
  yearLabel: args.year !== undefined ? String(args.year) : '',
  alt: args.alt !== undefined ? String(args.alt) : ''
};
saveSiteConfig(ROOT, config);

const hero = resolveHero(config, photos, photos[0]);
console.log('Imagine de header setată:');
console.log('  fișier: ' + hero.image);
console.log('  legendă: ' + heroCaption(hero));
console.log('\nRulează `npm run build` (sau `npm run serve`, care regenerează automat).');
