/**
 * Huedinul Istoric — nucleu de funcții pure (fără DOM, fără dependențe).
 * Folosit atât de site (assets/js/archive.js) cât și de scripturile de
 * validare/testare (tools/*.js), ca sursă unică de adevăr.
 *
 * Reguli de integritate a datelor:
 *  - nicio informație istorică nu este inventată;
 *  - textul original al anului/perioadei este păstrat verbatim (yearText);
 *  - un an exact se atribuie DOAR când sursa afirmă un an exact;
 *  - perioadele aproximative rămân aproximative (yearLabel / eraId).
 */

const DIACRITICS = {
  ă: 'a', â: 'a', î: 'i', ș: 's', ş: 's', ț: 't', ţ: 't',
  Ă: 'a', Â: 'a', Î: 'i', Ș: 's', Ş: 's', Ț: 't', Ţ: 't',
  á: 'a', à: 'a', ä: 'a', é: 'e', è: 'e', ë: 'e', í: 'i', ì: 'i', ï: 'i',
  ó: 'o', ò: 'o', ö: 'o', ú: 'u', ù: 'u', ü: 'u', ç: 'c', ñ: 'n'
};

/** Normalizează un text pentru căutare: fără diacritice, minuscule, spații unice. */
export function normalizeText(value) {
  if (value === null || value === undefined) return '';
  let s = String(value);
  s = s.replace(/[ăâîșşțţĂÂÎȘŞȚŢáàäéèëíìïóòöúùüçñ]/g, (c) => DIACRITICS[c] || c);
  s = s.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  return s.toLowerCase().replace(/\s+/g, ' ').trim();
}

/** Variantă tolerantă la diacriticele greșite (comma-below vs cedilla). */
export function foldDiacritics(value) {
  return normalizeText(value)
    .replace(/ş/g, 's').replace(/ţ/g, 't')
    .replace(/[^a-z0-9\s'-]/g, ' ');
}

/** Transformă un titlu în slug ASCII (fără diacritice, doar [a-z0-9-]). */
export function slugify(value) {
  const raw = value === null || value === undefined ? '' : value;
  const base = foldDiacritics(raw)
    .replace(/['’`]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .replace(/-{2,}/g, '-');
  return base || 'fotografie';
}

/** Escape HTML pentru inserare sigură în template-uri. */
export function escapeHtml(value) {
  return String(value === null || value === undefined ? '' : value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/** Escape pentru valoarea unui atribut HTML. */
export function escapeAttr(value) {
  return escapeHtml(value).replace(/\n/g, ' ');
}

const PREFIX_RE = /^[A-Za-zĂÂÎȘȚăâîșț]+:\s*/;
const RANGE_RE = /(\d{4})\s*[-–—]\s*(\d{4})/;
const YEAR_RE = /(\d{4})/;
const DECADE_RE = /anii?\s*['’`]?\s*(\d{2,4})/;
const APPROX_RE = /aprox|circa|cca\.?/i;

/**
 * Interpretează textul original al anului/perioadei.
 * Nu inventează niciodată precizie: un an exact apare doar dacă sursa îl afirmă.
 */
export function parseYear(rawText) {
  const raw = String(rawText === null || rawText === undefined ? '' : rawText).trim();
  const out = {
    yearText: raw,
    year: null,
    yearStart: null,
    yearEnd: null,
    yearApprox: false,
    yearLabel: 'Necunoscut',
    eraId: null,
    eraLabel: null,
    precision: 'unknown'
  };
  if (!raw) return out;

  const value = raw.replace(PREFIX_RE, '').replace(/\s+/g, ' ').trim();
  if (!value || /^[-–—?]+$/.test(value)) return out;

  const lower = value.toLowerCase();

  if (/interbelic/.test(lower)) {
    out.eraId = 'interbelic';
    out.eraLabel = 'perioada interbelică';
    out.yearLabel = 'perioada interbelică';
    out.precision = 'era';
    return out;
  }

  const mRange = value.match(RANGE_RE);
  if (mRange) {
    const a = parseInt(mRange[1], 10);
    const b = parseInt(mRange[2], 10);
    out.yearStart = Math.min(a, b);
    out.yearEnd = Math.max(a, b);
    out.yearApprox = APPROX_RE.test(value);
    out.yearLabel = out.yearStart + '–' + out.yearEnd;
    out.precision = 'range';
    return out;
  }

  const mDecade = lower.match(DECADE_RE);
  if (mDecade) {
    const digits = mDecade[1];
    const n = parseInt(digits, 10);
    const base = digits.length === 4 ? Math.floor(n / 10) * 10 : 1900 + n;
    out.yearStart = base;
    out.yearEnd = base + 9;
    out.yearLabel = "anii '" + String(base).slice(2);
    out.precision = 'decade';
    return out;
  }

  const mYear = value.match(YEAR_RE);
  if (mYear) {
    const y = parseInt(mYear[1], 10);
    if (APPROX_RE.test(value)) {
      out.yearStart = y;
      out.yearEnd = y;
      out.yearApprox = true;
      out.yearLabel = 'aprox. ' + y;
      out.precision = 'approx';
      return out;
    }
    out.year = y;
    out.yearStart = y;
    out.yearEnd = y;
    out.yearLabel = String(y);
    out.precision = 'year';
    return out;
  }

  out.yearLabel = value;
  out.precision = 'text';
  return out;
}

/** Anul „reprezentativ" pentru sortare (fără a pretinde precizie inexistentă). */
export function sortYear(photo) {
  if (photo.year !== null && photo.year !== undefined) return photo.year;
  if (photo.yearStart !== null && photo.yearStart !== undefined) return photo.yearStart;
  return null;
}


/**
 * Potrivirea unei fotografii cu un set de filtre (folosită de arhivă și de teste).
 * Toate filtrele sunt combinate cu AND; un filtru gol este ignorat.
 */
export function matchesFilters(photo, filters) {
  const f = filters || {};

  if (f.q) {
    const needle = normalizeText(f.q);
    if (needle) {
      const haystack = normalizeText([
        photo.title, photo.alt, photo.description, photo.source, photo.credits,
        photo.yearText, photo.yearLabel, photo.periodLabel, photo.locationName,
        photo.locationNote, (photo.tags || []).join(' ')
      ].filter(Boolean).join(' '));
      if (!haystack.includes(needle)) return false;
    }
  }

  if (f.period && photo.periodId !== f.period) return false;
  if (f.era && photo.eraId !== f.era) return false;

  if (f.location) {
    if (f.location === '__unknown__') {
      if (photo.locationId) return false;
    } else if (photo.locationId !== f.location) {
      return false;
    }
  }

  if (f.year !== '' && f.year !== null && f.year !== undefined) {
    const y = parseInt(f.year, 10);
    if (!Number.isNaN(y)) {
      const start = photo.yearStart === null || photo.yearStart === undefined ? photo.year : photo.yearStart;
      const end = photo.yearEnd === null || photo.yearEnd === undefined ? photo.year : photo.yearEnd;
      if (start === null || end === null) return false;
      if (!(y >= start && y <= end)) return false;
    }
  }

  if (f.yearFrom !== '' && f.yearFrom !== null && f.yearFrom !== undefined) {
    const y = parseInt(f.yearFrom, 10);
    if (!Number.isNaN(y)) {
      const end = photo.yearEnd === null || photo.yearEnd === undefined ? photo.year : photo.yearEnd;
      if (end === null || end === undefined || end < y) return false;
    }
  }

  if (f.yearTo !== '' && f.yearTo !== null && f.yearTo !== undefined) {
    const y = parseInt(f.yearTo, 10);
    if (!Number.isNaN(y)) {
      const start = photo.yearStart === null || photo.yearStart === undefined ? photo.year : photo.yearStart;
      if (start === null || start === undefined || start > y) return false;
    }
  }

  return true;
}

/** Filtrează o colecție (wrapper comod pentru teste și UI). */
export function filterPhotos(photos, filters) {
  return photos.filter((p) => matchesFilters(p, filters));
}

/** Sortează după an (necunoscute la final), apoi după ordinea din arhiva legacy. */
export function sortPhotos(photos, mode) {
  const m = mode || 'archive';
  const copy = photos.slice();
  if (m === 'year-asc' || m === 'year-desc') {
    const dir = m === 'year-desc' ? -1 : 1;
    copy.sort((a, b) => {
      const ya = sortYear(a);
      const yb = sortYear(b);
      if (ya === null && yb === null) return a.legacyIndex - b.legacyIndex;
      if (ya === null) return 1;
      if (yb === null) return -1;
      if (ya !== yb) return (ya - yb) * dir;
      return a.legacyIndex - b.legacyIndex;
    });
    return copy;
  }
  if (m === 'title') {
    copy.sort((a, b) => normalizeText(a.title).localeCompare(normalizeText(b.title), 'ro')
      || a.legacyIndex - b.legacyIndex);
    return copy;
  }
  copy.sort((a, b) => a.legacyIndex - b.legacyIndex);
  return copy;
}


const QUERY_KEYS = ['q', 'period', 'era', 'location', 'year', 'yearFrom', 'yearTo', 'sort', 'page'];

/** Construiește query string-ul pentru starea filtrelor (URL partajabil). */
export function buildQuery(filters) {
  const f = filters || {};
  const params = new URLSearchParams();
  for (const k of QUERY_KEYS) {
    const v = f[k];
    if (v === undefined || v === null || v === '') continue;
    if (k === 'sort' && v === 'archive') continue;
    if (k === 'page' && String(v) === '1') continue;
    params.set(k, String(v));
  }
  const s = params.toString();
  return s ? '?' + s : '';
}

/** Citește filtrele din query string. */
export function parseQuery(search) {
  const params = new URLSearchParams(search || '');
  const get = (k) => {
    const v = params.get(k);
    return v === null ? '' : v;
  };
  return {
    q: get('q'),
    period: get('period'),
    era: get('era'),
    location: get('location'),
    year: get('year'),
    yearFrom: get('yearFrom'),
    yearTo: get('yearTo'),
    sort: get('sort') || 'archive',
    page: parseInt(get('page'), 10) || 1
  };
}

/** Determină dacă un set de filtre este „activ" (pentru butonul de resetare). */
export function hasActiveFilters(filters) {
  const f = filters || {};
  return Boolean(f.q || f.period || f.era || f.location
    || f.year || f.yearFrom || f.yearTo);
}

