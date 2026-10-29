/**
 * tools/lib/photos.js — logica de creare a unei fotografii noi, partajată
 * între linia de comandă (tools/add-photo.js) și serverul de dezvoltare
 * (tools/serve.js, folosit de pagina tools/add-photo.html).
 */
import { existsSync, renameSync, mkdirSync, rmSync, readFileSync as readFs, writeFileSync as writeFs } from 'node:fs';
import { join, extname, dirname as dirOf } from 'node:path';
import { slugify, parseYear } from '../../assets/js/search-core.js';

export const FILTER_TO_PERIOD = {
  'filter-1900': '1800-1900',
  'filter-1930': '1900-1930',
  'filter-1960': '1930-1960',
  'filter-1990': '1960-1990'
};

/** Următorul identificator liber (p258, p259, …). */
export function nextPhotoId(photos) {
  const max = photos.reduce((acc, p) => {
    const m = /^p(\d+)$/.exec(p.id);
    return m ? Math.max(acc, parseInt(m[1], 10)) : acc;
  }, 0);
  return 'p' + String(max + 1).padStart(3, '0');
}

/** Slug unic, derivat din titlu. */
export function nextSlug(photos, title) {
  const used = new Set(photos.map((p) => p.slug));
  const base = slugify(title || 'fotografie');
  let slug = base;
  let n = 1;
  while (used.has(slug)) {
    n++;
    slug = base + '-' + n;
  }
  return slug;
}

/** Nume de fișier sigur (fără diacritice/spații), unic în folder. */
export function safeFileName(title, yearLabel, originalName, photos, root) {
  const ext = (extname(originalName || '') || '.webp').toLowerCase();
  const base = slugify([title, yearLabel].filter(Boolean).join(' ')).slice(0, 60) || 'fotografie';
  const folder = join(root, 'assets', 'img', 'portfolio');
  const used = new Set(photos.map((p) => p.image.split('/').pop()));

  let name = base + ext;
  let n = 1;
  while (used.has(name) || existsSync(join(folder, name))) {
    n++;
    name = base + '-' + n + ext;
  }
  return name;
}

/**
 * Construiește înregistrarea unei fotografii noi.
 * Nu inventează date: folosește exact valorile primite.
 * @throws {Error} la date invalide
 */
export function buildEntry(options) {
  const { photos, locations, periods, input } = options;

  const title = String(input.title || '').trim();
  if (!title) throw new Error('titlul este obligatoriu');

  const image = String(input.image || '').trim();
  if (!image) throw new Error('imaginea este obligatorie');
  if (!image.startsWith('assets/img/portfolio/')) {
    throw new Error('calea imaginii trebuie să fie în assets/img/portfolio/');
  }

  const yearText = String(input.year || '').trim();
  const parsed = parseYear(yearText);

  let periodId = input.period || null;
  if (!periodId && input.legacyFilter) periodId = FILTER_TO_PERIOD[input.legacyFilter] || null;
  if (periodId && !periods.some((p) => p.id === periodId)) {
    throw new Error('perioada „' + periodId + '” nu există (acceptate: '
      + periods.map((p) => p.id).join(', ') + ')');
  }

  const locationId = input.locationId || null;
  if (locationId && !locations.some((l) => l.id === locationId)) {
    throw new Error('locația „' + locationId + '” nu există (acceptate: '
      + locations.map((l) => l.id).join(', ') + ')');
  }

  const hasLat = !(input.latitude === '' || input.latitude === undefined || input.latitude === null);
  const hasLng = !(input.longitude === '' || input.longitude === undefined || input.longitude === null);
  if (hasLat !== hasLng) {
    throw new Error('completați ambele coordonate (latitudine și longitudine) sau niciuna');
  }
  const lat = hasLat ? Number(input.latitude) : null;
  const lng = hasLng ? Number(input.longitude) : null;
  if (lat !== null) {
    if (!Number.isFinite(lat) || lat < -90 || lat > 90) {
      throw new Error('latitudine invalidă: ' + input.latitude);
    }
    if (!Number.isFinite(lng) || lng < -180 || lng > 180) {
      throw new Error('longitudine invalidă: ' + input.longitude);
    }
  }

  const certainty = lat === null ? null : String(input.certainty || 'approximate').trim().toLowerCase();
  if (certainty && !['exact', 'approximate'].includes(certainty)) {
    throw new Error('precizia trebuie să fie „exact” sau „approximate”');
  }
  const coordinateSource = lat === null ? null
    : (String(input.coordinateSource || '').trim() || 'Poziționare manuală pe harta OpenStreetMap');

  const manualCount = photos.filter((p) => p.origin === 'manual').length;

  return {
    id: nextPhotoId(photos),
    legacyIndex: 100000 + manualCount,
    slug: nextSlug(photos, title),
    title,
    alt: String(input.alt || '').trim() || title,
    image,
    originalImage: input.originalImage || null,
    lightboxImage: null,
    lightboxBroken: false,
    year: parsed.year,
    yearStart: parsed.yearStart,
    yearEnd: parsed.yearEnd,
    yearApprox: parsed.yearApprox,
    yearLabel: parsed.yearLabel,
    yearText: parsed.yearText,
    precision: parsed.precision,
    eraId: parsed.eraId,
    eraLabel: parsed.eraLabel,
    periodId,
    periodLabel: parsed.eraId
      ? parsed.eraLabel
      : (['decade', 'range', 'approx'].includes(parsed.precision) ? parsed.yearLabel : null),
    legacyFilter: input.legacyFilter || null,
    locationId,
    locationName: locationId
      ? (locations.find((l) => l.id === locationId) || {}).name
      : null,
    locationNote: null,
    latitude: lat,
    longitude: lng,
    coordinateSource,
    coordinateCertainty: certainty,
    description: String(input.description || '').trim(),
    source: String(input.source || '').trim(),
    credits: String(input.credits || '').trim(),
    tags: Array.isArray(input.tags)
      ? input.tags
      : String(input.tags || '').split(',').map((t) => t.trim()).filter(Boolean),
    origin: 'manual'
  };
}

/** Adaugă fotografia în catalog + actualizează photoIds ale locației. */
export function appendPhoto(catalog, locationsData, entry) {
  catalog.photos.push(entry);
  catalog.count = catalog.photos.length;
  catalog.manualCount = catalog.photos.filter((p) => p.origin === 'manual').length;
  catalog.legacyCount = catalog.photos.filter((p) => p.origin !== 'manual').length;

  if (entry.locationId) {
    const loc = locationsData.locations.find((l) => l.id === entry.locationId);
    if (loc && !loc.photoIds.includes(entry.id)) loc.photoIds.push(entry.id);
  }
  return entry;
}


/* ==========================================================================
 * Ștergere reversibilă (coș de reciclare)
 *
 * Fișierele NU sunt distruse: sunt mutate în `backup/deleted/`, iar metadatele
 * sunt păstrate în `data/deleted-photos.json`. Fotografia poate fi restaurată
 * identic. Este singura metodă de ștergere expusă în unelte, ca să nu existe
 * pierderi de conținut.
 * ========================================================================== */

export const TRASH_FILE = 'data/deleted-photos.json';
export const TRASH_DIR = 'backup/deleted';

function readJsonFile(root, rel) {
  return JSON.parse(readFs(join(root, rel), 'utf8'));
}

function writeJsonFile(root, rel, data) {
  writeFs(join(root, rel), JSON.stringify(data, null, 1) + '\n');
}

export function loadTrash(root) {
  try {
    return readJsonFile(root, TRASH_FILE);
  } catch (e) {
    return { note: 'Fotografii șterse (mutate în backup/deleted). Pot fi restaurate.', deleted: [] };
  }
}

export function saveTrash(root, trash) {
  writeJsonFile(root, TRASH_FILE, trash);
}

/** ID-urile șterse — folosite de extract.js ca să nu le readucă în catalog. */
export function deletedIds(root) {
  return new Set(loadTrash(root).deleted.map((d) => d.photo.id));
}

function moveToTrash(root, rel) {
  if (!rel) return null;
  const abs = join(root, rel);
  if (!existsSync(abs)) return null;
  const name = rel.split('/').pop();
  mkdirSync(join(root, TRASH_DIR), { recursive: true });
  let final = join(root, TRASH_DIR, name);
  let n = 1;
  while (existsSync(final)) {           // nu suprascriem nimic din coș
    n++;
    final = join(root, TRASH_DIR, name.replace(/(\.[^.]+)$/, '-' + n + '$1'));
  }
  renameSync(abs, final);
  return { from: rel, to: TRASH_DIR + '/' + final.split('/').pop() };
}

function recount(catalog) {
  catalog.count = catalog.photos.length;
  catalog.manualCount = catalog.photos.filter((p) => p.origin === 'manual').length;
  catalog.legacyCount = catalog.photos.filter((p) => p.origin !== 'manual').length;
  return catalog;
}

/**
 * Șterge (reversibil) o fotografie: o scoate din catalog, din locație și din
 * media.json, apoi mută toate fișierele ei în coș (`backup/deleted/`).
 * @returns {{photo:object, moved:Array<{from:string,to:string}>}}
 */
export function softDeletePhoto(root, id) {
  const catalog = readJsonFile(root, 'data/photos.json');
  const locationsData = readJsonFile(root, 'data/locations.json');
  const trash = loadTrash(root);

  const index = catalog.photos.findIndex((p) => p.id === id);
  if (index === -1) throw new Error('fotografia nu există: ' + id);
  const photo = catalog.photos[index];

  const moved = [];
  for (const rel of [
    photo.image,
    photo.originalImage,
    'assets/img/thumbs/' + photo.id + '.webp',
    'assets/img/previews/' + photo.id + '.webp',
    'foto/' + photo.slug + '.html'
  ]) {
    const m = moveToTrash(root, rel);
    if (m) moved.push(m);
  }

  catalog.photos.splice(index, 1);
  writeJsonFile(root, 'data/photos.json', recount(catalog));

  for (const loc of locationsData.locations) {
    loc.photoIds = loc.photoIds.filter((x) => x !== id);
  }
  writeJsonFile(root, 'data/locations.json', locationsData);

  let mediaVariant = null;
  try {
    const media = readJsonFile(root, 'data/media.json');
    mediaVariant = media.variants[id] || null;
    delete media.variants[id];
    writeJsonFile(root, 'data/media.json', media);
  } catch (e) { /* media.json lipsă: ignorăm */ }

  trash.deleted = trash.deleted.filter((d) => d.photo.id !== id);
  trash.deleted.push({ deletedAt: new Date().toISOString(), photo, moved, media: mediaVariant });
  saveTrash(root, trash);

  return { photo, moved };
}


/**
 * Restaurează o fotografie din coș: pune fișierele la locul lor, o readuce în
 * catalog, în locație și în media.json.
 * @returns {{photo:object, restored:string[]}}
 */
export function restorePhoto(root, id) {
  const catalog = readJsonFile(root, 'data/photos.json');
  const locationsData = readJsonFile(root, 'data/locations.json');
  const trash = loadTrash(root);

  const entry = trash.deleted.find((d) => d.photo.id === id);
  if (!entry) throw new Error('fotografia nu este în coș: ' + id);
  if (catalog.photos.some((p) => p.id === id)) {
    throw new Error('există deja o fotografie cu acest id în catalog: ' + id);
  }

  const restored = [];
  for (const m of entry.moved) {
    const from = join(root, m.to);
    const to = join(root, m.from);
    if (!existsSync(from)) continue;
    mkdirSync(dirOf(to), { recursive: true });
    renameSync(from, to);
    restored.push(m.from);
  }

  catalog.photos.push(entry.photo);
  catalog.photos.sort((a, b) => (a.legacyIndex ?? 1e9) - (b.legacyIndex ?? 1e9));
  writeJsonFile(root, 'data/photos.json', recount(catalog));

  if (entry.photo.locationId) {
    const loc = locationsData.locations.find((l) => l.id === entry.photo.locationId);
    if (loc && !loc.photoIds.includes(id)) loc.photoIds.push(id);
  }
  writeJsonFile(root, 'data/locations.json', locationsData);

  try {
    const media = readJsonFile(root, 'data/media.json');
    if (entry.media) media.variants[id] = entry.media;
    writeJsonFile(root, 'data/media.json', media);
  } catch (e) { /* media.json lipsă: îl regenerăm la build */ }

  trash.deleted = trash.deleted.filter((d) => d.photo.id !== id);
  saveTrash(root, trash);

  return { photo: entry.photo, restored };
}

/** Golește coșul — ștergere DEFINITIVĂ. Doar la cerere explicită. */
export function purgeTrash(root) {
  const trash = loadTrash(root);
  const n = trash.deleted.length;
  for (const entry of trash.deleted) {
    for (const m of entry.moved) rmSync(join(root, m.to), { force: true });
  }
  trash.deleted = [];
  saveTrash(root, trash);
  return n;
}

