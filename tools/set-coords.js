/**
 * tools/set-coords.js — completează coordonatele proprii ale fotografiilor.
 *
 * Coordonatele NU sunt niciodată generate automat: se preiau din fișierul
 * dumneavoastră (CSV/JSON) sau din argumente, împreună cu sursa lor.
 *
 * Comenzi:
 *   node tools/set-coords.js --export [data/coordinates.csv]
 *       scrie un șablon CSV cu toate fotografiile (id, titlu, an, lat, lng, certainty, source)
 *
 *   node tools/set-coords.js --import data/coordinates.csv
 *       aplică coordonatele din CSV sau JSON (id, latitude, longitude, certainty, source)
 *
 *   node tools/set-coords.js --set --id p012 --lat 46.86 --lng 23.01 --source "Google Maps, 2024"
 *       completează o singură fotografie
 *
 *   node tools/set-coords.js --clear --id p012      șterge coordonatele unei fotografii
 *   node tools/set-coords.js --list-missing         listează fotografiile fără coordonate
 *   node tools/set-coords.js --stats                sumar
 *
 * Opțiuni: --certainty exact|approximate (implicit approximate), --dry-run,
 *          --allow-no-source (permite coordonate fără sursă — nerecomandat)
 *
 * Pentru poziționare vizuală pe hartă: npm run serve, apoi
 * http://localhost:8000/tools/coords-editor.html (butonul „Salvează în catalog”
 * scrie direct în data/photos.json, fără import manual).
 */
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join, dirname, extname, isAbsolute } from 'node:path';
import { fileURLToPath } from 'node:url';
import { homedir } from 'node:os';
import { hasOwnCoords, applyOne, applyRecords, csvToRecords, toCsv, coordsSummary }
  from './lib/coords.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const PHOTOS_FILE = join(ROOT, 'data', 'photos.json');

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
  if (['dry-run', 'allow-no-source', 'list-missing', 'stats', 'help'].includes(key)) {
    args[key] = true;
    continue;
  }
  const next = argv[i + 1];
  if (next === undefined || next.startsWith('--')) { args[key] = true; continue; }
  args[key] = next;
  i++;
}

function usage() {
  console.log(readFileSync(fileURLToPath(import.meta.url), 'utf8')
    .split('*/')[0].replace(/^\/\*\*?/, '').replace(/^ ?\* ?/gm, '').trim());
}

function fail(msg) {
  console.error('\nEROARE: ' + msg + '\n');
  process.exit(1);
}

if (args.help || argv.length === 0) { usage(); process.exit(0); }

/* ------------------------------ date ------------------------------ */
const data = JSON.parse(readFileSync(PHOTOS_FILE, 'utf8'));
const photos = data.photos;
const byId = new Map(photos.map((p) => [p.id, p]));
const bySlug = new Map(photos.map((p) => [p.slug, p]));

function save() {
  data.count = photos.length;
  writeFileSync(PHOTOS_FILE, JSON.stringify(data, null, 1) + '\n');
}

/* ------------------------------ --export ------------------------------ */
if (args.export !== undefined) {
  const target = typeof args.export === 'string' ? args.export : 'data/coordinates.csv';
  const rows = [['id', 'titlu', 'an', 'latitude', 'longitude', 'certainty', 'source']];
  for (const p of photos) {
    const own = hasOwnCoords(p);
    rows.push([
      p.id, p.title, p.yearLabel,
      own ? p.latitude : '',
      own ? p.longitude : '',
      own ? p.coordinateCertainty : '',
      own ? p.coordinateSource : ''
    ]);
  }
  const out = userPath(target);
  writeFileSync(out, toCsv(rows));
  console.log('Șablon scris în ' + out + ' (' + photos.length + ' fotografii).');
  console.log('Completați coloanele latitude/longitude/certainty/source, apoi rulați:');
  console.log('  node tools/set-coords.js --import ' + target);
  process.exit(0);
}

/* ------------------------------ --import ------------------------------ */
if (args.import !== undefined) {
  const file = typeof args.import === 'string' ? args.import : 'data/coordinates.csv';
  const abs = userPath(file);
  if (!existsSync(abs)) {
    fail('fișierul „' + file + '” nu există.\n'
      + '  Cale căutată: ' + abs + '\n'
      + '  Indicați calea completă (ex. ~/Downloads/coordinates.json) sau puneți fișierul în proiect.');
  }

  let records;
  if (extname(abs).toLowerCase() === '.json') {
    const parsed = JSON.parse(readFileSync(abs, 'utf8'));
    records = Array.isArray(parsed)
      ? parsed
      : Object.entries(parsed).map(([id, v]) => Object.assign({ id }, v));
  } else {
    try {
      records = csvToRecords(readFileSync(abs, 'utf8'));
    } catch (e) {
      fail(e.message);
    }
  }

  const result = applyRecords(photos, records, { allowNoSource: Boolean(args['allow-no-source']) });
  console.log('Coordonate aplicate:', result.updated, 'din', records.length, 'înregistrări.');
  if (result.problems.length) {
    console.log('Probleme (' + result.problems.length + '):');
    result.problems.slice(0, 20).forEach((m) => console.log('  ! ' + m));
    if (result.problems.length > 20) console.log('  … și încă ' + (result.problems.length - 20));
  }
  if (args['dry-run']) { console.log('(--dry-run: nu s-a scris nimic)'); process.exit(result.problems.length ? 1 : 0); }
  save();
  console.log('data/photos.json actualizat. Rulați: npm run build && npm run validate && npm run test');
  process.exit(result.problems.length ? 1 : 0);
}

/* ------------------------------ --set / --clear ------------------------------ */
if (args.set || args.clear) {
  const photo = args.id ? byId.get(String(args.id)) : (args.slug ? bySlug.get(String(args.slug)) : null);
  if (!photo) fail('indicați o fotografie existentă cu --id p012 sau --slug nume-slug.');

  if (args.clear) {
    applyOne(photo, { latitude: null, longitude: null }, {});
    if (args['dry-run']) { console.log('(--dry-run) ar șterge coordonatele pentru', photo.id); process.exit(0); }
    save();
    console.log('Coordonate șterse pentru ' + photo.id + ' „' + photo.title + '”.');
    process.exit(0);
  }

  try {
    applyOne(photo, {
      latitude: args.lat,
      longitude: args.lng,
      certainty: args.certainty,
      source: args.source
    }, { allowNoSource: Boolean(args['allow-no-source']) });
  } catch (e) {
    fail(e.message);
  }
  console.log(photo.id + ' „' + photo.title + '” -> ' + photo.latitude + ', ' + photo.longitude
    + '  (' + photo.coordinateCertainty + '; sursa: ' + photo.coordinateSource + ')');
  if (args['dry-run']) { console.log('(--dry-run: nu s-a scris nimic)'); process.exit(0); }
  save();
  console.log('data/photos.json actualizat. Rulați: npm run build');
  process.exit(0);
}

/* ------------------------------ --list-missing ------------------------------ */
if (args['list-missing']) {
  const missing = photos.filter((p) => !hasOwnCoords(p));
  console.log('Fotografii fără coordonate proprii: ' + missing.length + ' din ' + photos.length);
  console.log('');
  for (const p of missing) {
    console.log('  ' + p.id + '  ' + p.title + '  (' + p.yearLabel + ')'
      + (p.locationId ? '  [localitate: ' + p.locationId + ']' : ''));
  }
  process.exit(0);
}

/* ------------------------------ --stats ------------------------------ */
const s = coordsSummary(photos);
console.log('COORDONATE — Huedinul Istoric');
console.log('-'.repeat(60));
console.log('Total fotografii:                 ' + s.total);
console.log('Cu coordonate proprii:            ' + s.withOwn);
console.log('Fără coordonate proprii:          ' + s.withoutOwn);
console.log('  din care cu localitate (pin de localitate): ' + s.withLocalityOnly);
console.log('  din care fără nicio locație:    ' + s.withoutAnything);
console.log('Precizie: ' + (Object.keys(s.byCertainty).length
  ? Object.entries(s.byCertainty).map(([k, v]) => k + '=' + v).join(', ')
  : '—'));
if (s.withoutSource) console.log('ATENȚIE: ' + s.withoutSource + ' fotografii au coordonate fără sursă.');
console.log('-'.repeat(60));
if (s.withoutOwn > 0) {
  console.log('Sugestie: rulați `npm run serve`, deschideți tools/coords-editor.html');
  console.log('și folosiți butonul „Salvează în catalog” (scrie direct în data/photos.json).');
  console.log('Alternativ: `node tools/set-coords.js --export` pentru șablon CSV.');
}

