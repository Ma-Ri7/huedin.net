/**
 * tools/add-photo.js — adaugă o fotografie nouă în catalog, din linia de comandă.
 *
 * Pentru varianta vizuală (cu upload de imagine și poziționare pe hartă):
 *   npm run serve
 *   -> http://localhost:8000/tools/add-photo.html
 *
 * Exemplu:
 *   node tools/add-photo.js \
 *     --image "poza-noua.webp" \
 *     --title "Piața centrală" \
 *     --year "Anul: 1942" \
 *     --period 1930-1960 \
 *     --location huedin \
 *     --alt "Piața centrală a Huedinului, 1942"
 *
 * Argumente:
 *   --image       (obligatoriu) nume de fișier sau cale către imaginea colorizată
 *   --title       (obligatoriu) titlul original
 *   --year        textul anului/perioadei (ex. "Anul: 1942", "anii '40", "aprox. 1900")
 *   --alt         descrierea (text alternativ); implicit = titlul
 *   --period      perioada din filtre (1800-1900, 1900-1930, 1930-1960, 1960-1990)
 *   --legacy-filter  alternativă la --period (ex. filter-1960)
 *   --location    id de locație existent în data/locations.json (ex. huedin)
 *   --lat / --lng coordonatele proprii ale fotografiei (opțional)
 *   --coordinate-source  sursa coordonatelor (implicit: poziționare manuală)
 *   --certainty   exact | approximate (implicit: approximate)
 *   --original    calea originalului alb-negru (altfel se detectează automat)
 *   --description / --source / --credits / --tags   metadate suplimentare
 *   --dry-run     afișează înregistrarea fără a scrie fișiere
 */
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join, dirname, extname, isAbsolute } from 'node:path';
import { fileURLToPath } from 'node:url';
import { homedir } from 'node:os';
import { buildEntry, appendPhoto } from './lib/photos.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const PHOTOS_FILE = join(ROOT, 'data', 'photos.json');
const LOCATIONS_FILE = join(ROOT, 'data', 'locations.json');
const PERIODS_FILE = join(ROOT, 'data', 'periods.json');

/** Rezolvă o cale dată de utilizator: relativă la proiect, absolută sau `~`. */
function userPath(value) {
  let p = String(value);
  if (p === '~') p = homedir();
  else if (p.startsWith('~/')) p = join(homedir(), p.slice(2));
  return isAbsolute(p) ? p : join(ROOT, p);
}

/* ------------------------------ argumente ------------------------------ */
const args = {};
const argv = process.argv.slice(2);
for (let i = 0; i < argv.length; i++) {
  const a = argv[i];
  if (!a.startsWith('--')) continue;
  const key = a.slice(2);
  if (key === 'dry-run' || key === 'help') { args[key] = true; continue; }
  const next = argv[i + 1];
  if (next === undefined || next.startsWith('--')) { args[key] = true; continue; }
  args[key] = next;
  i++;
}

function fail(msg) {
  console.error('\nEROARE: ' + msg + '\n');
  process.exit(1);
}

if (args.help || argv.length === 0) {
  console.log(readFileSync(fileURLToPath(import.meta.url), 'utf8')
    .split('*/')[0].replace(/^\/\*\*?/, '').replace(/^ ?\* ?/gm, '').trim());
  process.exit(0);
}

if (!args.image) fail('lipsește argumentul obligatoriu --image');
if (!args.title) fail('lipsește argumentul obligatoriu --title');

/* ------------------------------ imagine ------------------------------ */
function resolveImage(value) {
  const candidates = [userPath(value), join(ROOT, 'assets', 'img', 'portfolio', value)];
  for (const c of candidates) {
    if (existsSync(c) && !c.endsWith('/')) {
      const rel = c.startsWith(ROOT + '/') ? c.slice(ROOT.length + 1) : c;
      if (extname(rel)) return rel;
    }
  }
  return null;
}

const image = resolveImage(args.image);
if (!image) {
  fail('imaginea „' + args.image + '” nu a fost găsită.\n'
    + '  Copiați mai întâi fișierul în assets/img/portfolio/ sau dați calea completă.\n'
    + '  Pentru upload direct din browser: npm run serve -> tools/add-photo.html');
}
if (!image.startsWith('assets/img/portfolio/')) {
  console.warn('AVERTISMENT: imaginea nu este în assets/img/portfolio/ (' + image + ').');
}

let originalImage = null;
if (args.original) {
  originalImage = resolveImage(args.original);
  if (!originalImage) fail('originalul „' + args.original + '” nu a fost găsit.');
} else {
  const dot = image.lastIndexOf('.');
  const stem = dot > -1 ? image.slice(0, dot) : image;
  originalImage = [stem + '.jpg', stem + '.jpeg', stem + '.png']
    .find((c) => c !== image && existsSync(join(ROOT, c))) || null;
}

/* ------------------------------ catalog ------------------------------ */
const data = JSON.parse(readFileSync(PHOTOS_FILE, 'utf8'));
const locationsData = JSON.parse(readFileSync(LOCATIONS_FILE, 'utf8'));
const periods = JSON.parse(readFileSync(PERIODS_FILE, 'utf8')).periods;

if (data.photos.some((p) => p.image === image)) {
  fail('există deja o fotografie cu această imagine (' + image + ').');
}

let entry;
try {
  entry = buildEntry({
    photos: data.photos,
    locations: locationsData.locations,
    periods,
    input: {
      title: args.title,
      image,
      originalImage,
      year: args.year,
      alt: args.alt,
      period: args.period,
      legacyFilter: args['legacy-filter'],
      locationId: args.location,
      latitude: args.lat,
      longitude: args.lng,
      certainty: args.certainty,
      coordinateSource: args['coordinate-source'],
      description: args.description,
      source: args.source,
      credits: args.credits,
      tags: args.tags
    }
  });
} catch (e) {
  fail(e.message);
}

if (!entry.periodId) {
  console.warn('AVERTISMENT: nu ați indicat --period; fotografia nu va apărea în filtrul „Perioadă”.');
  console.warn('  Valori acceptate: ' + periods.map((p) => p.id).join(', '));
}
if (!entry.locationId) {
  console.warn('AVERTISMENT: nu ați indicat --location; fotografia nu va avea localitate.');
}

console.log('\nFotografie nouă:');
console.log('  id:            ' + entry.id);
console.log('  titlu:         ' + entry.title);
console.log('  slug (URL):    foto/' + entry.slug + '.html');
console.log('  imagine:       ' + entry.image);
console.log('  original A/N:  ' + (entry.originalImage || '— (nu există)'));
console.log('  an/perioadă:   ' + entry.yearLabel + '   (text original: „' + entry.yearText + '”)');
console.log('  perioadă:      ' + (entry.periodId || '— nespecificată'));
console.log('  localitate:    ' + (entry.locationName || '— nespecificată'));
console.log('  coordonate:    ' + (entry.latitude !== null
  ? entry.latitude + ', ' + entry.longitude + ' (' + entry.coordinateCertainty + ')'
  : '— nespecificate'));

if (args['dry-run']) {
  console.log('\n(--dry-run: nu s-a scris nimic)\n');
  process.exit(0);
}

appendPhoto(data, locationsData, entry);
writeFileSync(PHOTOS_FILE, JSON.stringify(data, null, 1) + '\n');
writeFileSync(LOCATIONS_FILE, JSON.stringify(locationsData, null, 1) + '\n');

console.log('\nCatalog actualizat: data/photos.json (' + data.photos.length + ' fotografii).');
console.log('\nPașii următori:');
console.log('  npm run thumbs     # generează miniatură + preview');
console.log('  npm run build      # generează pagina foto/' + entry.slug + '.html');
console.log('  npm run validate && npm run test');

