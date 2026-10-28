/**
 * tools/lib/coords.js — logică partajată pentru coordonatele fotografiilor.
 * Folosită de tools/set-coords.js (linia de comandă) și de tools/serve.js
 * (endpoint-ul folosit de editorul vizual).
 */
import { slugify } from '../../assets/js/search-core.js';

export const CERTAINTIES = ['exact', 'approximate'];

/** Fotografia are coordonate proprii valide? */
export function hasOwnCoords(photo) {
  return typeof photo.latitude === 'number' && typeof photo.longitude === 'number';
}

/* ------------------------------- CSV ------------------------------- */
export function parseCsv(text) {
  const firstLine = text.split(/\r?\n/)[0] || '';
  const delimiter = (firstLine.match(/;/g) || []).length > (firstLine.match(/,/g) || []).length ? ';' : ',';

  const rows = [];
  let row = [];
  let field = '';
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"' && text[i + 1] === '"') { field += '"'; i++; }
      else if (c === '"') inQuotes = false;
      else field += c;
      continue;
    }
    if (c === '"') { inQuotes = true; continue; }
    if (c === delimiter) { row.push(field); field = ''; continue; }
    if (c === '\n') { row.push(field); rows.push(row); row = []; field = ''; continue; }
    if (c === '\r') continue;
    field += c;
  }
  if (field !== '' || row.length) { row.push(field); rows.push(row); }

  return rows.filter((r) => r.some((c) => c.trim() !== ''));
}

function csvEscape(value) {
  const s = value === null || value === undefined ? '' : String(value);
  return /[",;\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
}

export function toCsv(rows) {
  return rows.map((r) => r.map(csvEscape).join(',')).join('\n') + '\n';
}

/** Transformă un fișier CSV (cu antet) în înregistrări de coordonate. */
export function csvToRecords(text) {
  const rows = parseCsv(text);
  if (!rows.length) return [];
  const header = rows[0].map((h) => slugify(h));
  const idx = (name) => header.indexOf(name);
  const iId = idx('id');
  const iSlug = idx('slug');
  const iLat = header.findIndex((h) => h.startsWith('lat'));
  const iLng = header.findIndex((h) => h.startsWith('lon') || h.startsWith('lng'));
  const iCert = idx('certainty');
  const iSrc = idx('source') >= 0 ? idx('source') : idx('sursa');

  if (iId < 0 && iSlug < 0) throw new Error('CSV-ul trebuie să aibă o coloană „id” sau „slug”.');
  if (iLat < 0 || iLng < 0) throw new Error('CSV-ul trebuie să aibă coloanele „latitude” și „longitude”.');

  return rows.slice(1).map((r) => ({
    id: iId >= 0 ? (r[iId] || '').trim() : '',
    slug: iSlug >= 0 ? (r[iSlug] || '').trim() : '',
    latitude: iLat >= 0 ? (r[iLat] || '').trim() : '',
    longitude: iLng >= 0 ? (r[iLng] || '').trim() : '',
    certainty: iCert >= 0 ? (r[iCert] || '').trim() : '',
    source: iSrc >= 0 ? (r[iSrc] || '').trim() : ''
  }));
}

/* --------------------------- aplicare coordonate --------------------------- */
/**
 * Aplică coordonatele pe o singură fotografie.
 * @param {object} photo  fotografia din catalog (se modifică în loc)
 * @param {object} rec    { latitude, longitude, certainty, source }
 * @param {object} [opts] { allowNoSource }
 * @returns {'setat'|'șters'}
 */
export function applyOne(photo, rec, opts) {
  const options = opts || {};
  const latRaw = rec.latitude;
  const lngRaw = rec.longitude;

  const empty = (latRaw === '' || latRaw === null || latRaw === undefined)
    && (lngRaw === '' || lngRaw === null || lngRaw === undefined);

  if (empty) {
    photo.latitude = null;
    photo.longitude = null;
    photo.coordinateSource = null;
    photo.coordinateCertainty = null;
    return 'șters';
  }

  const lat = Number(String(latRaw).replace(',', '.'));
  const lng = Number(String(lngRaw).replace(',', '.'));
  if (!Number.isFinite(lat) || lat < -90 || lat > 90) {
    throw new Error(`${photo.id}: latitudine invalidă „${latRaw}”`);
  }
  if (!Number.isFinite(lng) || lng < -180 || lng > 180) {
    throw new Error(`${photo.id}: longitudine invalidă „${lngRaw}”`);
  }

  const certainty = String(rec.certainty || 'approximate').trim().toLowerCase();
  if (!CERTAINTIES.includes(certainty)) {
    throw new Error(`${photo.id}: precizia trebuie să fie „exact” sau „approximate” `
      + `(primit „${rec.certainty}”)`);
  }

  const source = String(rec.source || '').trim();
  if (!source && !options.allowNoSource) {
    throw new Error(`${photo.id}: lipsește sursa coordonatelor. Completați câmpul „source” `
      + 'sau folosiți --allow-no-source (nerecomandat).');
  }

  photo.latitude = lat;
  photo.longitude = lng;
  photo.coordinateSource = source || 'Sursă nespecificată';
  photo.coordinateCertainty = certainty;
  return 'setat';
}

/**
 * Aplică o listă de înregistrări pe catalog.
 * @returns {{updated:number, cleared:number, problems:string[]}}
 */
export function applyRecords(photos, records, opts) {
  const byId = new Map(photos.map((p) => [p.id, p]));
  const bySlug = new Map(photos.map((p) => [p.slug, p]));
  const result = { updated: 0, cleared: 0, problems: [] };

  for (const rec of records) {
    if (!rec) continue;
    const id = rec.id ? String(rec.id).trim() : '';
    const slug = rec.slug ? String(rec.slug).trim() : '';
    const photo = (id && byId.get(id)) || (slug && bySlug.get(slug));
    if (!photo) {
      result.problems.push('fotografie inexistentă: ' + (id || slug || '(fără id)'));
      continue;
    }
    try {
      const state = applyOne(photo, rec, opts);
      if (state === 'setat') result.updated++;
      else result.cleared++;
    } catch (e) {
      result.problems.push(e.message);
    }
  }
  return result;
}

/** Sumar al coordonatelor din catalog. */
export function coordsSummary(photos) {
  const own = photos.filter(hasOwnCoords);
  const byCertainty = {};
  for (const p of own) {
    const k = p.coordinateCertainty || 'nespecificată';
    byCertainty[k] = (byCertainty[k] || 0) + 1;
  }
  return {
    total: photos.length,
    withOwn: own.length,
    withoutOwn: photos.length - own.length,
    withLocalityOnly: photos.filter((p) => !hasOwnCoords(p) && p.locationId).length,
    withoutAnything: photos.filter((p) => !hasOwnCoords(p) && !p.locationId).length,
    byCertainty,
    withoutSource: own.filter((p) => !p.coordinateSource).length
  };
}

