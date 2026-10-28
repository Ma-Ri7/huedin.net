/**
 * tools/extract.js — FAZA B (migrare)
 *
 * Extrage conținutul arhivei legacy (backup/legacy-index.html) într-un catalog
 * static reproductibil:
 *   data/photos.json           — 257 fotografii cu metadate păstrate integral
 *   data/locations.json        — locațiile documentate (coordonate doar verificate)
 *   data/legacy-inventory.json — snapshot brut pentru raportul de reconciliere
 *
 * Sursa este backup/legacy-index.html (snapshot imutabil), NU index.html nou.
 * Nu inventează ani, locații sau titluri. Nu șterge și nu redenumește fișiere.
 */
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { slugify, parseYear, normalizeText } from '../assets/js/search-core.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const LEGACY = join(ROOT, 'backup', 'legacy-index.html');

// Baza de active (imagine/vendor/css) folosită de noul site.
// Implicit: `assets` (active copiate la rădăcină, originalul rămâne în `Original/`).
// Se poate suprascrie cu: ASSET_BASE=Original/assets node tools/extract.js
const ASSET_BASE = (process.env.ASSET_BASE || 'assets').replace(/\/+$/, '');

/** Rescrie o cale legacy `assets/...` către baza de active configurată. */
function assetPath(legacyPath) {
  if (!legacyPath) return null;
  return legacyPath.replace(/^assets\//, ASSET_BASE + '/');
}


if (!existsSync(LEGACY)) {
  console.error('EROARE: lipsește backup/legacy-index.html (sursa arhivei).');
  process.exit(1);
}
const html = readFileSync(LEGACY, 'utf8');

const clean = (s) => String(s || '')
  .replace(/<[^>]*>/g, ' ')
  .replace(/&nbsp;/g, ' ')
  .replace(/&amp;/g, '&')
  .replace(/&quot;/g, '"')
  .replace(/&#39;/g, "'")
  .replace(/&lt;/g, '<')
  .replace(/&gt;/g, '>')
  .replace(/\s+/g, ' ')
  .trim();

const slice = (from, to) => {
  const a = html.indexOf(from);
  if (a === -1) throw new Error('Nu am găsit marcajul: ' + from);
  const b = html.indexOf(to, a);
  if (b === -1) throw new Error('Nu am găsit marcajul final: ' + to);
  return html.slice(a, b);
};

/* ------------------------------------------------------------------ *
 * 1. Locații documentate (doar nume apărute explicit în textul sursă).
 *    Coordonate DOAR pentru Huedin, preluate din embed-ul Google Maps
 *    existent pe pagina originală (nu sunt inventate).
 * ------------------------------------------------------------------ */
const PLACES = [
  { id: 'calata', name: 'Călata', patterns: ['călata', 'calata'] },
  { id: 'morlaca', name: 'Morlaca', patterns: ['morlaca'] },
  { id: 'bratca', name: 'Bratca', patterns: ['bratca'] },
  { id: 'stana', name: 'Stana', patterns: ['stana'] },
  { id: 'bicalatu', name: 'Bicălatu', patterns: ['bicălatu', 'bicalatu'] },
  { id: 'izvorul-crisului', name: 'Izvorul Crișului', patterns: ['izvorul crișului', 'izvorul crisului'] },
  { id: 'margau', name: 'Mărgău', patterns: ['mărgău', 'margau'] },
  { id: 'rachitele', name: 'Răchițele', patterns: ['răchițele', 'rachitele'] },
  { id: 'huedin', name: 'Huedin', patterns: ['huedin'] }
];

const LEGACY_COORDS = {
  latitude: 46.86326641627756,
  longitude: 23.016986552462303,
  coordinateSource: 'Embed Google Maps existent în secțiunea Contact a site-ului original'
};

/** Locurile menționate explicit în textul fotografiei (fără presupuneri). */
function detectLocations(text) {
  const n = normalizeText(text);
  const found = [];
  for (const p of PLACES) {
    if (p.patterns.some((pat) => n.includes(normalizeText(pat)))) found.push(p.id);
  }
  return found;
}

/* ------------------------------------------------------------------ *
 * 2. Portofoliul: 257 fotografii
 * ------------------------------------------------------------------ */
const portfolioRegion = slice('portfolio-container', 'End Portfolio Section');
const blocks = portfolioRegion.split(/(?=<div class="col-lg-4 col-md-6 portfolio-item)/)
  .filter((b) => b.includes('portfolio-item'));

const FILTER_TO_PERIOD = {
  'filter-1900': '1800-1900',
  'filter-1930': '1900-1930',
  'filter-1960': '1930-1960',
  'filter-1990': '1960-1990'
};

const slugCounts = new Map();
function uniqueSlug(title) {
  const base = slugify(title);
  const n = (slugCounts.get(base) || 0) + 1;
  slugCounts.set(base, n);
  return n === 1 ? base : base + '-' + n;
}

const photos = blocks.map((b, index) => {
  const mFilter = b.match(/portfolio-item (filter-\d+)/);
  const legacyFilter = mFilter ? mFilter[1] : null;

  const mImg = b.match(/<img src="([^"]*)"[^>]*alt="([^"]*)"/);
  const image = mImg ? assetPath(mImg[1]) : null;
  const alt = mImg ? clean(mImg[2]) : '';

  const mTitle = b.match(/<h4>([\s\S]*?)<\/h4>/);
  const title = mTitle ? clean(mTitle[1]) : '';

  const mYear = b.match(/<p>([\s\S]*?)<\/p>/);
  const yearText = mYear ? clean(mYear[1]) : '';

  const mLightbox = b.match(/<a href="([^"]*)" data-gallery/);
  const lightbox = mLightbox ? assetPath(mLightbox[1]) : null;

  const parsed = parseYear(yearText);
  const places = detectLocations([title, alt, yearText].join(' '));
  const locationId = places.length ? places[0] : null;
  const locationNote = places.length > 1
    ? 'Textul original menționează mai multe locuri: ' + places.join(', ')
    : null;
  const periodId = FILTER_TO_PERIOD[legacyFilter] || null;

  const periodLabel = parsed.eraId
    ? parsed.eraLabel
    : (parsed.precision === 'decade' || parsed.precision === 'range' || parsed.precision === 'approx'
      ? parsed.yearLabel
      : null);

  const id = 'p' + String(index + 1).padStart(3, '0');
  const slug = uniqueSlug(title);

  // Originalul alb-negru, dacă există pe disc lângă varianta colorizată.
  const candidates = [];
  if (image) {
    const dot = image.lastIndexOf('.');
    const stem = dot > -1 ? image.slice(0, dot) : image;
    candidates.push(stem + '.jpg', stem + '.jpeg', stem + '.png');
  }
  const originalImage = candidates.find((c) => c !== image && existsSync(join(ROOT, c))) || null;

  return {
    id,
    legacyIndex: index,
    slug,
    title,
    alt,
    image,
    originalImage,
    lightboxImage: lightbox,
    lightboxBroken: Boolean(lightbox && !existsSync(join(ROOT, lightbox))),
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
    periodLabel,
    legacyFilter,
    locationId,
    locationName: locationId ? (PLACES.find((p) => p.id === locationId) || {}).name : null,
    locationNote,
    description: '',
    source: '',
    credits: '',
    tags: [],
    // Coordonate proprii fotografiei (opționale). Se completează manual
    // (tools/set-coords.js sau tools/coords-editor.html), niciodată automat.
    latitude: null,
    longitude: null,
    coordinateSource: null,
    coordinateCertainty: null,
    origin: 'legacy'
  };
});

console.log('Fotografii extrase:', photos.length);
const broken = photos.filter((p) => p.lightboxBroken);
console.log('Referințe lightbox rupte:', broken.map((p) => p.id + ' ' + p.title + ' -> ' + p.lightboxImage));
const unknownYear = photos.filter((p) => p.precision === 'unknown' || p.precision === 'text');
console.log('Ani neinterpretați:', unknownYear.length, unknownYear.map((p) => p.yearText));

/* ------------------------------------------------------------------ *
 * 2b. Fotografii adăugate manual (nu există în arhiva legacy).
 *     Sunt PĂSTRATE la fiecare rulare — nu se pierd la re-extracție.
 * ------------------------------------------------------------------ */
const PHOTOS_FILE = join(ROOT, 'data', 'photos.json');

// Câmpuri care se completează manual și trebuie PĂSTRATE la re-extracție.
const EDITABLE_FIELDS = [
  'latitude', 'longitude', 'coordinateSource', 'coordinateCertainty',
  'description', 'source', 'credits', 'tags'
];

let manual = [];
if (existsSync(PHOTOS_FILE)) {
  try {
    const previous = JSON.parse(readFileSync(PHOTOS_FILE, 'utf8'));
    const previousById = new Map((previous.photos || []).map((p) => [p.id, p]));
    const legacyIds = new Set(photos.map((p) => p.id));

    // 1. coordonatele și metadatele completate manual se păstrează pe fotografiile legacy
    let preserved = 0;
    for (const p of photos) {
      const prev = previousById.get(p.id);
      if (!prev) continue;
      for (const f of EDITABLE_FIELDS) {
        if (prev[f] !== undefined && prev[f] !== null && prev[f] !== '') {
          p[f] = prev[f];
          if (f === 'latitude') preserved++;
        }
      }
    }
    if (preserved) console.log('Coordonate proprii păstrate pentru', preserved, 'fotografii.');

    // 2. fotografiile adăugate manual rămân în catalog
    manual = (previous.photos || []).filter((p) => p.origin === 'manual' && !legacyIds.has(p.id));
  } catch (e) {
    console.warn('data/photos.json nu a putut fi citit (' + e.message + '); se regenerează integral.');
  }
}
if (manual.length) {
  console.log('Fotografii adăugate manual păstrate:', manual.length, '->', manual.map((p) => p.id).join(', '));
}

// Slug-urile legacy rămân identice (nu se recalculează); doar cele manuale se dedublează.
const usedSlugs = new Set(photos.map((p) => p.slug));
for (const p of manual) {
  const base = slugify(p.title || 'fotografie');
  let candidate = base;
  let n = 1;
  while (usedSlugs.has(candidate)) {
    n++;
    candidate = base + '-' + n;
  }
  p.slug = candidate;
  usedSlugs.add(candidate);
}

const allPhotos = photos.concat(manual);

/* --- locații: completăm photoIds pe baza atribuirii documentate --- */
const locations = PLACES.map((p) => ({
  id: p.id,
  name: p.name,
  latitude: p.id === 'huedin' ? LEGACY_COORDS.latitude : null,
  longitude: p.id === 'huedin' ? LEGACY_COORDS.longitude : null,
  coordinateSource: p.id === 'huedin' ? LEGACY_COORDS.coordinateSource : null,
  certainty: 'locality',
  description: p.id === 'huedin'
    ? 'Orașul Huedin. Coordonatele indică localitatea, nu punctul exact al fotografiei.'
    : 'Localitate menționată în descrierile originale. Coordonate neconfirmate — pinul nu este afișat pe hartă.',
  photoIds: allPhotos.filter((ph) => ph.locationId === p.id).map((ph) => ph.id)
}));

mkdirSync(join(ROOT, 'data'), { recursive: true });
writeFileSync(PHOTOS_FILE, JSON.stringify({
  generatedFrom: 'backup/legacy-index.html',
  count: allPhotos.length,
  legacyCount: photos.length,
  manualCount: manual.length,
  photos: allPhotos
}, null, 1) + '\n');
writeFileSync(join(ROOT, 'data', 'locations.json'), JSON.stringify({ locations }, null, 1) + '\n');
console.log('Total în catalog:', allPhotos.length, '(legacy:', photos.length + ', adăugate manual:', manual.length + ')');
console.log('Locații:', locations.map((l) => l.id + '(' + l.photoIds.length + ')').join(', '));

writeFileSync(join(ROOT, 'data', 'legacy-inventory.json'), JSON.stringify({
  source: 'backup/legacy-index.html',
  sourceBytes: Buffer.byteLength(html),
  photoCount: photos.length,
  items: photos.map((p) => ({
    legacyIndex: p.legacyIndex,
    title: p.title,
    yearText: p.yearText,
    image: p.image,
    alt: p.alt
  }))
}, null, 1) + '\n');

/* ------------------------------------------------------------------ *
 * 3. Textele originale ale site-ului (păstrate verbatim)
 * ------------------------------------------------------------------ */
const headerRegion = slice('<header id="header">', 'End Header');
const aboutRegion = slice('id="about"', 'End About Section');
const servicesRegion = slice('id="services"', 'End Services Section');
const contactRegion = slice('id="contact"', 'End Contact Section');

const socials = [...headerRegion.matchAll(/<a href="([^"]+)" class="([a-z]+)"><i class="bi bi-([a-z]+)"><\/i><\/a>/g)]
  .map((m) => ({ url: m[1], network: m[2], icon: m[3] }));

const aboutParagraphs = [...aboutRegion.matchAll(/<p>([\s\S]*?)<\/p>/g)]
  .map((m) => clean(m[1])).filter(Boolean);

const disclaimerItems = [...aboutRegion.matchAll(/<li><i[^>]*><\/i>\s*<span>([\s\S]*?)<\/span><\/li>/g)]
  .map((m) => clean(m[1])).filter(Boolean);

const countBoxes = [...servicesRegion.matchAll(/data-purecounter-end="([^"]+)"[^>]*><\/span>\s*<p>([\s\S]*?)<\/p>/g)]
  .map((m) => ({ value: m[1], label: clean(m[2]) }));

const usefulLinks = [...servicesRegion.matchAll(/<h4><a href="([^"]+)">([\s\S]*?)<\/a><\/h4>\s*<p>([\s\S]*?)<\/p>/g)]
  .map((m) => ({ url: m[1], title: clean(m[2]), description: clean(m[3]) }));

const infoBoxes = [...contactRegion.matchAll(/<h3>([\s\S]*?)<\/h3>\s*(?:<div class="social-links">([\s\S]*?)<\/div>|<p>([\s\S]*?)<\/p>)/g)]
  .map((m) => ({ label: clean(m[1]), value: clean(m[3] || '') }));

const mForm = contactRegion.match(/<form action="([^"]+)"/);
const mH1 = headerRegion.match(/<h1><a href="([^"]+)">([\s\S]*?)<\/a><\/h1>/);
const mH2 = headerRegion.match(/<h2>([\s\S]*?)<\/h2>/);
const mCredits = html.match(/<div class="credits">([\s\S]*?)<\/div>/);
const creditsText = mCredits ? clean(mCredits[1]) : '';

const siteContent = {
  siteName: mH1 ? clean(mH1[2]) : 'Huedin.net',
  siteUrl: mH1 ? mH1[1] : 'https://huedin.net',
  taglineHtml: mH2 ? mH2[1].trim() : '',
  tagline: mH2 ? clean(mH2[1]) : '',
  title: (html.match(/<title>([\s\S]*?)<\/title>/) || [, ''])[1].trim(),
  metaDescription: (html.match(/<meta content="([^"]*)" name="description">/) || [, ''])[1],
  metaKeywords: (html.match(/<meta content="([^"]*)" name="keywords">/) || [, ''])[1],
  socials,
  aboutHeading: clean((aboutRegion.match(/<h3>([\s\S]*?)<\/h3>/) || [, ''])[1]),
  aboutParagraphs,
  disclaimerTitle: clean((aboutRegion.match(/<h3>Disclaimer[\s\S]*?<\/h3>/) || [''])[0]),
  disclaimerItems,
  counts: countBoxes,
  usefulLinks,
  infoBoxes,
  formAction: mForm ? mForm[1] : '',
  email: (contactRegion.match(/href="mailto:([^"]+)"/) || [, ''])[1],
  phone: (contactRegion.match(/href="tel:([^"]+)"/) || [, ''])[1],
  phoneDisplay: clean((contactRegion.match(/<a href="tel:[^"]+">([^<]+)<\/a>/) || [, ''])[1]),
  creditsText
};

writeFileSync(join(ROOT, 'data', 'site-content.json'), JSON.stringify(siteContent, null, 1) + '\n');
console.log('Texte extrase: paragrafe Despre =', aboutParagraphs.length,
  '| disclaimer =', disclaimerItems.length,
  '| statistici =', countBoxes.length,
  '| linkuri utile =', usefulLinks.length,
  '| social =', socials.length);


