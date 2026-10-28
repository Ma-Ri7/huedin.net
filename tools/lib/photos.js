/**
 * tools/lib/photos.js — logica de creare a unei fotografii noi, partajată
 * între linia de comandă (tools/add-photo.js) și serverul de dezvoltare
 * (tools/serve.js, folosit de pagina tools/add-photo.html).
 */
import { existsSync } from 'node:fs';
import { join, extname } from 'node:path';
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

