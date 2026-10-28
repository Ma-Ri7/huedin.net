/**
 * tools/validate.js — validarea catalogului și a site-ului generat.
 *
 * Verifică: ID-uri și slug-uri unice, existența fișierelor foto, referințe valide
 * către locații, ani/intervale valide, câmpuri obligatorii, legături foto↔locație,
 * duplicate suspecte, metadate incomplete și existența paginilor generate.
 *
 * Cod de ieșire 1 la erori (blochează publicarea), 0 altfel.
 */
import { readFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => JSON.parse(readFileSync(join(ROOT, p), 'utf8'));

const errors = [];
const warnings = [];
const info = [];
const err = (m) => errors.push(m);
const warn = (m) => warnings.push(m);

const photosData = read('data/photos.json');
const locationsData = read('data/locations.json');
const periodsData = read('data/periods.json');
const mediaData = read('data/media.json');
const photos = photosData.photos;
const locations = locationsData.locations;

/* 1. Câmpuri obligatorii + unicitate ID/slug */
const ids = new Set();
const slugs = new Set();
for (const p of photos) {
  for (const field of ['id', 'slug', 'title', 'image']) {
    if (!p[field]) err(`Fotografia #${p.legacyIndex} nu are câmpul obligatoriu „${field}”.`);
  }
  if (ids.has(p.id)) err(`ID duplicat: ${p.id}`);
  ids.add(p.id);
  if (slugs.has(p.slug)) err(`Slug duplicat: ${p.slug}`);
  slugs.add(p.slug);
  if (p.slug && !/^[a-z0-9-]+$/.test(p.slug)) err(`Slug invalid (caractere nepermise): ${p.slug}`);
}

/* 2. Fișiere imagine + variante */
let missingImages = 0;
let missingThumbs = 0;
for (const p of photos) {
  if (!p.image || !existsSync(join(ROOT, p.image))) {
    err(`Fișier imagine lipsă pentru ${p.id}: ${p.image}`);
    missingImages++;
  }
  if (p.originalImage && !existsSync(join(ROOT, p.originalImage))) {
    err(`Original alb-negru lipsă pentru ${p.id}: ${p.originalImage}`);
  }
  const v = mediaData.variants[p.id];
  if (!v) {
    warn(`Nu există miniaturi generate pentru ${p.id} (rulați „npm run thumbs”).`);
    missingThumbs++;
  } else {
    if (!existsSync(join(ROOT, v.thumb.path))) err(`Miniatură lipsă pentru ${p.id}: ${v.thumb.path}`);
    if (!existsSync(join(ROOT, v.preview.path))) err(`Preview lipsă pentru ${p.id}: ${v.preview.path}`);
  }
  if (p.lightboxBroken) {
    warn(`Referință legacy ruptă păstrată în catalog (${p.id}): ${p.lightboxImage}`);
  }
}

/* 3. Locații */
const locById = new Map(locations.map((l) => [l.id, l]));
const locIds = new Set();
for (const l of locations) {
  if (locIds.has(l.id)) err(`ID de locație duplicat: ${l.id}`);
  locIds.add(l.id);
  if (!l.name) err(`Locația ${l.id} nu are nume.`);
  const hasLat = typeof l.latitude === 'number';
  const hasLng = typeof l.longitude === 'number';
  if (hasLat !== hasLng) err(`Locația ${l.id} are o singură coordonată (lat/lng incomplete).`);
  if (hasLat && (l.latitude < -90 || l.latitude > 90)) err(`Latitudine invalidă pentru ${l.id}: ${l.latitude}`);
  if (hasLng && (l.longitude < -180 || l.longitude > 180)) err(`Longitudine invalidă pentru ${l.id}: ${l.longitude}`);
  if (hasLat && !l.coordinateSource) warn(`Locația ${l.id} are coordonate fără sursă documentată.`);
}

/* 4. Legături fotografie ↔ locație (în ambele sensuri) */
for (const p of photos) {
  if (p.locationId && !locById.has(p.locationId)) {
    err(`Fotografia ${p.id} referă o locație inexistentă: ${p.locationId}`);
  }
}

/* 4b. Coordonate proprii fotografiei */
const CERTAINTIES = ['exact', 'approximate'];
let ownCoords = 0;
let noSource = 0;
for (const p of photos) {
  const hasLat = typeof p.latitude === 'number';
  const hasLng = typeof p.longitude === 'number';
  if (hasLat !== hasLng) {
    err(`Fotografia ${p.id} are o singură coordonată (lat/lng incomplete).`);
    continue;
  }
  if (!hasLat) {
    if (p.coordinateSource || p.coordinateCertainty) {
      warn(`Fotografia ${p.id} are sursă/precizie de coordonate, dar fără latitudine/longitudine.`);
    }
    continue;
  }
  ownCoords++;
  if (Number.isNaN(p.latitude) || p.latitude < -90 || p.latitude > 90) {
    err(`Latitudine invalidă pentru ${p.id}: ${p.latitude}`);
  }
  if (Number.isNaN(p.longitude) || p.longitude < -180 || p.longitude > 180) {
    err(`Longitudine invalidă pentru ${p.id}: ${p.longitude}`);
  }
  if (!p.coordinateSource) {
    err(`Fotografia ${p.id} are coordonate fără sursă (coordinateSource).`);
    noSource++;
  }
  if (!p.coordinateCertainty) {
    warn(`Fotografia ${p.id} are coordonate fără precizie declarată (coordinateCertainty).`);
  } else if (!CERTAINTIES.includes(p.coordinateCertainty)) {
    err(`Precizie necunoscută la ${p.id}: ${p.coordinateCertainty} (acceptat: ${CERTAINTIES.join(', ')})`);
  }
}
info.push(`${ownCoords} fotografii au coordonate proprii (pin la poziția fotografiei); `
  + `${photos.filter((p) => typeof p.latitude !== 'number' && p.locationId).length} au doar localitate; `
  + `${photos.filter((p) => typeof p.latitude !== 'number' && !p.locationId).length} nu au nicio coordonată.`);

for (const l of locations) {
  for (const id of l.photoIds) {
    const p = photos.find((x) => x.id === id);
    if (!p) { err(`Locația ${l.id} referă o fotografie inexistentă: ${id}`); continue; }
    if (p.locationId !== l.id) err(`Inconsistență: ${id} apare la locația ${l.id}, dar are locationId=${p.locationId}`);
  }
  const actual = photos.filter((p) => p.locationId === l.id).map((p) => p.id);
  if (actual.length !== l.photoIds.length) {
    err(`Locația ${l.id}: photoIds are ${l.photoIds.length} intrări, dar ${actual.length} fotografii o referă.`);
  }
}

/* 5. Ani și intervale */
for (const p of photos) {
  const vals = [p.year, p.yearStart, p.yearEnd].filter((v) => v !== null && v !== undefined);
  for (const v of vals) {
    if (!Number.isInteger(v) || v < 1800 || v > 2030) err(`An implauzibil pentru ${p.id}: ${v} (${p.yearText})`);
  }
  if (p.yearStart !== null && p.yearEnd !== null && p.yearStart > p.yearEnd) {
    err(`Interval inversat pentru ${p.id}: ${p.yearStart}–${p.yearEnd}`);
  }
  if (p.year !== null && p.precision !== 'year') {
    err(`Fotografia ${p.id} are an exact (${p.year}) dar precision=${p.precision}`);
  }
  if (p.year === null && p.precision === 'year') {
    err(`Fotografia ${p.id} are precision=year fără an exact.`);
  }
  if (!p.yearText) warn(`Fotografia ${p.id} nu are text original pentru an.`);
}

/* 6. Perioade */
const periodIds = new Set(periodsData.periods.map((x) => x.id));
for (const p of photos) {
  if (p.periodId && !periodIds.has(p.periodId)) err(`Perioadă inexistentă la ${p.id}: ${p.periodId}`);
  if (!p.periodId) warn(`Fotografia ${p.id} nu are perioadă atribuită.`);
}

/* 7. Duplicate suspecte (același titlu + același an + aceeași locație) */
const keys = new Map();
for (const p of photos) {
  const k = [p.title.toLowerCase(), p.yearLabel, p.locationId].join('|');
  if (!keys.has(k)) keys.set(k, []);
  keys.get(k).push(p.id);
}
const suspicious = [...keys.values()].filter((g) => g.length > 1);
info.push(`${suspicious.length} grupuri cu titlu+an+locație identice (posibile serii — NU se elimină): `
  + suspicious.slice(0, 8).map((g) => g.join('/')).join(', ') + (suspicious.length > 8 ? '…' : ''));

/* 8. Pagini generate */
let missingPages = 0;
for (const p of photos) {
  const target = join(ROOT, 'foto', p.slug + '.html');
  if (!existsSync(target)) { err(`Pagina fotografiei lipsește: foto/${p.slug}.html`); missingPages++; }
}
for (const f of ['index.html', 'arhiva.html', 'harta.html', 'despre.html', '404.html', 'sitemap.xml', 'robots.txt']) {
  if (!existsSync(join(ROOT, f))) err(`Fișier generat lipsă: ${f}`);
}

/* 8b. Imaginea de header (data/site-config.json) */
const siteConfig = read('data/site-config.json');
if (siteConfig && siteConfig.hero && siteConfig.hero.image) {
  const heroImage = siteConfig.hero.image;
  if (!heroImage.startsWith('assets/img/')) {
    err(`Imaginea de header trebuie să fie în assets/img/ (${heroImage}).`);
  } else if (!existsSync(join(ROOT, heroImage))) {
    err(`Imaginea de header nu există pe disc: ${heroImage}`);
  }
  if (siteConfig.hero.photoSlug && !photos.some((p) => p.slug === siteConfig.hero.photoSlug)) {
    err(`Imaginea de header referă o fotografie inexistentă: ${siteConfig.hero.photoSlug}`);
  }
  const html = existsSync(join(ROOT, 'index.html')) ? readFileSync(join(ROOT, 'index.html'), 'utf8') : '';
  if (html && !html.includes(heroImage)) {
    warn(`index.html nu conține imaginea de header configurată (${heroImage}) — rulează „npm run build”.`);
  }
} else {
  info.push('Imaginea de header nu este configurată explicit (se folosește prima fotografie). '
    + 'Poți seta una cu `npm run hero` sau din tools/set-hero.html.');
}

/* 9. Metadate incomplete care necesită verificare */
const needCheck = photos.filter((p) => p.precision === 'unknown' || p.precision === 'text');
info.push(`${needCheck.length} fotografii fără datare interpretabilă (păstrate cu textul original): `
  + needCheck.map((p) => `${p.id} „${p.yearText}”`).join('; '));
info.push(`${photos.filter((p) => !p.locationId).length} fotografii fără localitate identificată în descriere.`);

/* Raport */
const line = '-'.repeat(72);
console.log(line);
console.log('VALIDARE CATALOG — Huedinul Istoric');
console.log(line);
console.log(`Fotografii: ${photos.length} | Locații: ${locations.length} | Perioade: ${periodsData.periods.length}`);
console.log(`Imagini lipsă: ${missingImages} | Miniaturi lipsă: ${missingThumbs} | Pagini lipsă: ${missingPages}`);
console.log(line);
if (info.length) { console.log('INFORMAȚII:'); info.forEach((m) => console.log('  · ' + m)); }
if (warnings.length) { console.log(`AVERTISMENTE (${warnings.length}):`); warnings.forEach((m) => console.log('  ! ' + m)); }
if (errors.length) { console.log(`ERORI (${errors.length}):`); errors.forEach((m) => console.log('  X ' + m)); }
console.log(line);
console.log(errors.length ? 'REZULTAT: EȘUAT' : 'REZULTAT: OK');
process.exit(errors.length ? 1 : 0);

