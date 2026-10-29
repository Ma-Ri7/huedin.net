/**
 * tools/test.js — suită de teste automate (fără framework, zero dependențe).
 *
 *  A. Funcții pure (căutare, diacritice, parsing ani, filtre, URL)
 *  B. Integritatea catalogului
 *  C. Integritatea paginilor HTML generate (structură, linkuri, imagini)
 *  D. Sitemap / robots
 *  E. Verificarea linkurilor interne
 *  F. Ștergere reversibilă (coș de reciclare)
 *
 * Iese cu cod 1 dacă vreun test eșuează.
 */
import { readFileSync, existsSync, readdirSync } from 'node:fs';
import { join, dirname, resolve, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  normalizeText, slugify, parseYear, matchesFilters, filterPhotos,
  buildQuery, parseQuery, sortPhotos, hasActiveFilters, escapeHtml
} from '../assets/js/search-core.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => JSON.parse(readFileSync(join(ROOT, p), 'utf8'));

let pass = 0;
const failures = [];
const group = (name) => console.log('\n' + name);

function t(name, fn) {
  try {
    fn();
    pass++;
  } catch (e) {
    failures.push(name + ' :: ' + e.message);
    console.log('  X ' + name + ' — ' + e.message);
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

const photosData = read('data/photos.json');
const photos = photosData.photos;
const locations = read('data/locations.json').locations;
const legacy = read('data/legacy-inventory.json');
const legacyDerived = photos.filter((p) => (p.origin || 'legacy') === 'legacy');
const added = photos.filter((p) => p.origin === 'manual');

/* ================================ A ================================ */
group('A. Funcții pure');

t('normalizeText elimină diacriticele și majusculele', () => {
  eq(normalizeText('Piața Centrală Ș Ț Î Â'), 'piata centrala s t i a');
});

t('normalizeText tratează diacriticele greșite (cedilla)', () => {
  eq(normalizeText('ş ţ Ş Ţ'), 's t s t');
});

t('slugify produce slug ASCII', () => {
  eq(slugify('Piața centrală'), 'piata-centrala');
  eq(slugify('Întreprinderea "Unirea"'), 'intreprinderea-unirea');
  eq(slugify('  ---  '), 'fotografie');
});

t('parseYear: an exact', () => {
  const r = parseYear('Anul: 1908');
  eq([r.year, r.yearStart, r.yearEnd, r.precision], [1908, 1908, 1908, 'year']);
});

t('parseYear: aproximativ rămâne aproximativ (fără an exact)', () => {
  const r = parseYear('Anul: aprox.1900');
  eq([r.year, r.yearStart, r.yearEnd, r.yearApprox, r.precision], [null, 1900, 1900, true, 'approx']);
});

t('parseYear: deceniu', () => {
  eq(parseYear("Perioada:  anii '40").yearLabel, "anii '40");
  eq([parseYear("Anii '80").yearStart, parseYear("Anii '80").yearEnd], [1980, 1989]);
});

t('parseYear: interval', () => {
  const r = parseYear('Anul: între 1965-1972');
  eq([r.year, r.yearStart, r.yearEnd, r.precision], [null, 1965, 1972, 'range']);
});

t('parseYear: perioadă denumită (interbelică) nu devine an', () => {
  const r = parseYear('Perioadal: interbelică');
  eq([r.year, r.yearStart, r.eraId, r.precision], [null, null, 'interbelic', 'era']);
});

t('parseYear: necunoscut păstrează textul original', () => {
  const r = parseYear('Anul: -');
  eq([r.year, r.yearLabel, r.precision], [null, 'Necunoscut', 'unknown']);
  eq(parseYear('Anul: -').yearText, 'Anul: -');
});

t('parseYear: text nerecunoscut este păstrat, nu inventat', () => {
  const r = parseYear('Perioada: înaintea Primului Război Mondial');
  eq(r.year, null);
  eq(r.yearLabel, 'înaintea Primului Război Mondial');
});

t('parseYear: toate textele din catalog sunt clasificate fără eroare', () => {
  const bad = [];
  for (const p of photos) {
    const r = parseYear(p.yearText);
    if (r.yearText !== p.yearText) bad.push(p.id);
    if (r.year !== null && r.precision !== 'year') bad.push(p.id);
  }
  eq(bad, []);
});

t('escapeHtml neutralizează caracterele periculoase', () => {
  eq(escapeHtml('<b>&"\'</b>'), '&lt;b&gt;&amp;&quot;&#39;&lt;/b&gt;');
});

/* ---- filtre ---- */
const fixture = [
  { id: 'a', title: 'Piața centrală', alt: 'Piața centrală Huedin 1985', yearText: 'Anul: 1985',
    year: 1985, yearStart: 1985, yearEnd: 1985, yearLabel: '1985', periodId: '1960-1990',
    eraId: null, locationId: 'huedin', locationName: 'Huedin', legacyIndex: 0, tags: [] },
  { id: 'b', title: 'Biserica Reformată', alt: 'Biserica Reformată din Huedin in perioada intebelica',
    yearText: 'Perioada: interbelică', year: null, yearStart: null, yearEnd: null,
    yearLabel: 'perioada interbelică', periodId: '1900-1930', eraId: 'interbelic',
    locationId: 'huedin', locationName: 'Huedin', legacyIndex: 1, tags: [] },
  { id: 'c', title: 'Călata -1918', alt: 'Călata -1918', yearText: 'Anul: 1918', year: 1918,
    yearStart: 1918, yearEnd: 1918, yearLabel: '1918', periodId: '1900-1930', eraId: null,
    locationId: 'calata', locationName: 'Călata', legacyIndex: 2, tags: [] }
];

t('căutare text fără diacritice găsește text cu diacritice', () => {
  eq(filterPhotos(fixture, { q: 'piata' }).map((p) => p.id), ['a']);
  eq(filterPhotos(fixture, { q: 'PIAȚA' }).map((p) => p.id), ['a']);
  eq(filterPhotos(fixture, { q: 'calata' }).map((p) => p.id), ['c']);
});

t('căutare fără diacritice găsește text cu diacritice', () => {
  eq(filterPhotos(fixture, { q: 'biserica reformata' }).map((p) => p.id), ['b']);
});

t('filtru an exact', () => {
  eq(filterPhotos(fixture, { year: '1985' }).map((p) => p.id), ['a']);
  eq(filterPhotos(fixture, { year: '1900' }).map((p) => p.id), []);
});

t('filtru interval de ani', () => {
  eq(filterPhotos(fixture, { yearFrom: '1918', yearTo: '1920' }).map((p) => p.id), ['c']);
  eq(filterPhotos(fixture, { yearFrom: '1900' }).map((p) => p.id), ['a', 'c']);
});

t('filtru perioadă și eră', () => {
  eq(filterPhotos(fixture, { period: '1900-1930' }).map((p) => p.id), ['b', 'c']);
  eq(filterPhotos(fixture, { era: 'interbelic' }).map((p) => p.id), ['b']);
});

t('filtru localitate, inclusiv „nedocumentată”', () => {
  eq(filterPhotos(fixture, { location: 'calata' }).map((p) => p.id), ['c']);
  eq(filterPhotos(fixture, { location: '__unknown__' }).length, 0);
});

t('combinarea filtrelor (AND) și resetarea', () => {
  eq(filterPhotos(fixture, { q: 'huedin', period: '1900-1930' }).map((p) => p.id), ['b']);
  eq(filterPhotos(fixture, { q: 'huedin', period: '1960-1990' }).map((p) => p.id), ['a']);
  eq(filterPhotos(fixture, {}).length, 3);
  ok(hasActiveFilters({ q: 'x' }) && !hasActiveFilters({}), 'hasActiveFilters');
});

t('sortare după an (necunoscutele la final)', () => {
  const sorted = sortPhotos(fixture, 'year-asc').map((p) => p.id);
  eq(sorted[0], 'c');
  eq(sorted[sorted.length - 1], 'b');
});

t('URL-urile cu filtre sunt reversibile', () => {
  const f = { q: 'piața', period: '1960-1990', era: '', location: 'huedin', year: '1985', yearFrom: '', yearTo: '', sort: 'archive', page: 1 };
  const qs = buildQuery(f);
  const parsed = parseQuery(qs);
  eq(parsed.q, 'piața');
  eq(parsed.period, '1960-1990');
  eq(parsed.location, 'huedin');
  eq(parsed.year, '1985');
  eq(buildQuery({ sort: 'archive', page: 1 }), '');
});

/* ================================ B ================================ */
group('B. Integritatea catalogului');

t('catalogul conține toate fotografiile legacy', () => eq(legacyDerived.length, legacy.photoCount));
t('fotografiile legacy păstrează ordinea și indexul original',
  () => eq(legacyDerived.every((p, i) => p.legacyIndex === i), true));
t('catalogul conține cel puțin arhiva legacy', () => ok(photos.length >= legacy.photoCount,
  `catalog=${photos.length}, legacy=${legacy.photoCount}`));
t('fotografiile adăugate manual au origine marcată corect',
  () => eq(added.every((p) => p.origin === 'manual' && p.legacyIndex > legacy.photoCount), true));
t('ID-urile sunt unice', () => eq(new Set(photos.map((p) => p.id)).size, photos.length));
t('slug-urile sunt unice', () => eq(new Set(photos.map((p) => p.slug)).size, photos.length));

t('toate fișierele foto există pe disc', () => {
  const missing = photos.filter((p) => !existsSync(join(ROOT, p.image)));
  eq(missing.map((p) => p.image), []);
});

t('fiecare fotografie are titlu, an-text și descriere', () => {
  const bad = photos.filter((p) => !p.title || !p.yearText || !p.alt).map((p) => p.id);
  eq(bad, []);
});

t('legăturile fotografie ↔ locație sunt consistente', () => {
  const locIds = new Set(locations.map((l) => l.id));
  const bad = photos.filter((p) => p.locationId && !locIds.has(p.locationId)).map((p) => p.id);
  eq(bad, []);
  const mismatch = locations.filter((l) => {
    const actual = photos.filter((p) => p.locationId === l.id).length;
    return actual !== l.photoIds.length;
  }).map((l) => l.id);
  eq(mismatch, []);
});

t('doar locațiile cu sursă documentată au coordonate', () => {
  const bad = locations.filter((l) => typeof l.latitude === 'number' && !l.coordinateSource).map((l) => l.id);
  eq(bad, []);
});

t('coordonatele proprii ale fotografiilor sunt valide și au sursă', () => {
  const bad = [];
  for (const p of photos) {
    const hasLat = typeof p.latitude === 'number';
    const hasLng = typeof p.longitude === 'number';
    if (hasLat !== hasLng) { bad.push(p.id + ': lat/lng incomplete'); continue; }
    if (!hasLat) continue;
    if (p.latitude < -90 || p.latitude > 90) bad.push(p.id + ': latitudine în afara intervalului');
    if (p.longitude < -180 || p.longitude > 180) bad.push(p.id + ': longitudine în afara intervalului');
    if (!p.coordinateSource) bad.push(p.id + ': fără sursă');
    if (!['exact', 'approximate'].includes(p.coordinateCertainty)) bad.push(p.id + ': precizie invalidă');
  }
  eq(bad, []);
});

t('fotografiile cu coordonate proprii au pin pe hartă (pagina generată)', () => {
  // Pagina hărții trebuie să raporteze numărul real de fotografii cu coordonate proprii.
  const stats = read('data/site-stats.json');
  const own = photos.filter((p) => typeof p.latitude === 'number').length;
  eq(stats.withOwnCoordinates, own);
  const html = readFileSync(join(ROOT, 'harta.html'), 'utf8');
  ok(html.includes(String(own)), 'harta.html nu conține numărul de fotografii cu coordonate');
});

t('imaginea de header este configurată și există pe disc', () => {
  const cfg = read('data/site-config.json');
  ok(cfg && cfg.hero && cfg.hero.image, 'data/site-config.json nu are hero.image');
  ok(cfg.hero.image.startsWith('assets/img/'), 'imaginea de header nu este în assets/img/');
  ok(existsSync(join(ROOT, cfg.hero.image)), 'imaginea de header lipsește: ' + cfg.hero.image);
});

t('index.html folosește imaginea de header configurată (nu revine la cea veche)', () => {
  const cfg = read('data/site-config.json');
  const html = readFileSync(join(ROOT, 'index.html'), 'utf8');
  const m = /<div class="hero__media">\s*<img src="([^"]+)"/.exec(html);
  ok(m, 'index.html nu are imaginea de header în .hero__media');
  eq(m[1], cfg.hero.image);
});

t('paginile publice nu conțin referințe către unelte interne sau comenzi de dezvoltare', () => {
  const publicFiles = ['index.html', 'arhiva.html', 'harta.html', 'despre.html', '404.html',
    'robots.txt', 'sitemap.xml',
    'assets/js/site.js', 'assets/js/data.js', 'assets/js/archive.js',
    'assets/js/photo.js', 'assets/js/map.js', 'assets/js/search-core.js',
    'assets/css/site.css'];

  const forbidden = [
    /tools\/coords-editor/i,
    /tools\/add-photo/i,
    /tools\/set-hero/i,
    /tools\/local-guard/i,
    /npm run/i,
    /server static/i,
    /\.gitignore/i
  ];

  const found = [];
  for (const f of publicFiles) {
    const text = readFileSync(join(ROOT, f), 'utf8');
    for (const re of forbidden) {
      const m = text.match(re);
      if (m) found.push(f + ' conține „' + m[0] + '”');
    }
  }
  eq(found, []);
});

t('paginile foto nu conțin referințe interne', () => {
  const sample = photos.slice(0, 25).map((p) => 'foto/' + p.slug + '.html');
  const found = [];
  for (const f of sample) {
    const text = readFileSync(join(ROOT, f), 'utf8');
    if (/tools\/|npm run/i.test(text)) found.push(f);
  }
  eq(found, []);
});

t('uneltele de dezvoltare sunt excluse de la publicare (GitHub Pages)', () => {
  const cfg = readFileSync(join(ROOT, '_config.yml'), 'utf8');
  for (const dir of ['tools', 'docs', 'backup', 'node_modules']) {
    ok(new RegExp('^\\s*-\\s*' + dir + '\\s*$', 'm').test(cfg), '_config.yml nu exclude „' + dir + '”');
  }
  ok(!existsSync(join(ROOT, '.nojekyll')),
    '.nojekyll există — ar dezactiva excluderile din _config.yml');
});

t('robots.txt blochează directoarele interne', () => {
  const robots = readFileSync(join(ROOT, 'robots.txt'), 'utf8');
  for (const dir of ['/tools/', '/docs/', '/backup/', '/node_modules/']) {
    ok(robots.includes('Disallow: ' + dir), 'robots.txt nu blochează ' + dir);
  }
});

t('mesajele publice ale hărții nu conțin referințe către unelte', () => {
  const mapJs = readFileSync(join(ROOT, 'assets/js/map.js'), 'utf8');
  ok(!/tools\//i.test(mapJs), 'assets/js/map.js conține referințe la tools/');
  ok(!/coords-editor/i.test(mapJs), 'assets/js/map.js menționează coords-editor');
  const fallback = read('data/site-stats.json');
  ok(fallback.photos > 0);
});


/* ================================ C ================================ */
group('C. Paginile HTML generate');

const pageFiles = ['index.html', 'arhiva.html', 'harta.html', 'despre.html', '404.html']
  .concat(photos.map((p) => 'foto/' + p.slug + '.html'));

t('toate paginile generate există', () => {
  const missing = pageFiles.filter((f) => !existsSync(join(ROOT, f)));
  eq(missing, []);
});

t('paginile au structura HTML obligatorie', () => {
  const bad = [];
  for (const f of pageFiles) {
    const html = readFileSync(join(ROOT, f), 'utf8');
    if (!html.startsWith('<!DOCTYPE html>')) bad.push(f + ': doctype');
    if (!html.includes('<html lang="ro">')) bad.push(f + ': lang');
    if (!/<title>[^<]+<\/title>/.test(html)) bad.push(f + ': title');
    if (!html.includes('name="description"')) bad.push(f + ': description');
    if (!html.includes('rel="canonical"')) bad.push(f + ': canonical');
    if (!html.includes('name="viewport"')) bad.push(f + ': viewport');
    if (!html.includes('<main id="main">')) bad.push(f + ': main');
    if (!html.includes('id="site-nav"')) bad.push(f + ': nav');
    const h1 = (html.match(/<h1[\s>]/g) || []).length;
    if (h1 !== 1) bad.push(f + ': h1=' + h1);
    if (/undefined|\[object Object\]|NaN/.test(html)) bad.push(f + ': placeholder scurs');
  }
  eq(bad, []);
});

t('paginile de fotografii conțin titlul, anul și imaginea', () => {
  const bad = [];
  for (const p of photos.slice(0, 40)) {
    const html = readFileSync(join(ROOT, 'foto', p.slug + '.html'), 'utf8');
    if (!html.includes(escapeHtml(p.title))) bad.push(p.id + ': titlu');
    if (!html.includes(escapeHtml(p.yearLabel))) bad.push(p.id + ': an');
    if (!html.includes(p.slug)) bad.push(p.id + ': slug');
  }
  eq(bad, []);
});

/* ================================ D ================================ */
group('D. Sitemap și robots');

t('sitemap.xml este XML valid și complet', () => {
  const xml = readFileSync(join(ROOT, 'sitemap.xml'), 'utf8');
  ok(xml.startsWith('<?xml'), 'declarație XML');
  ok(xml.includes('<urlset'), 'urlset');
  const locs = (xml.match(/<loc>/g) || []).length;
  eq(locs, 4 + photos.length);
});

t('robots.txt indică sitemap-ul și blochează directoarele interne', () => {
  const robots = readFileSync(join(ROOT, 'robots.txt'), 'utf8');
  ok(robots.includes('Sitemap: https://huedin.net/sitemap.xml'), 'sitemap');
  ok(robots.includes('Disallow: /tools/'), 'tools');
  ok(robots.includes('Disallow: /docs/'), 'docs');
  ok(robots.includes('Disallow: /backup/'), 'backup');
});

/* ================================ E ================================ */
group('E. Linkuri interne și resurse');

const external = /^(https?:|mailto:|tel:|data:|javascript:|#|\/\/)/i;

function checkLinks(files) {
  const broken = [];
  for (const f of files) {
    const html = readFileSync(join(ROOT, f), 'utf8');
    const dir = dirname(join(ROOT, f));
    const attrs = html.match(/(?:href|src)="([^"]+)"/g) || [];
    for (const attr of attrs) {
      const raw = attr.replace(/^[a-z]+="/i, '').replace(/"$/, '');
      if (!raw || external.test(raw)) continue;
      const clean = raw.split('#')[0].split('?')[0];
      if (!clean) continue;
      // Căile care încep cu „/” sunt relative la rădăcina site-ului (necesar pentru 404.html).
      const target = clean.startsWith('/') ? join(ROOT, clean) : resolve(dir, clean);
      if (!existsSync(target)) broken.push(f + ' -> ' + raw);
    }
  }
  return broken;
}

t('linkurile și resursele paginilor principale există', () => {
  eq(checkLinks(['index.html', 'arhiva.html', 'harta.html', 'despre.html', '404.html']), []);
});

t('linkurile și resursele paginilor de fotografii există', () => {
  eq(checkLinks(photos.map((p) => 'foto/' + p.slug + '.html')), []);
});

t('resursele aplicației există (CSS, JS, date, Leaflet)', () => {
  const required = [
    'assets/css/site.css',
    'assets/js/site.js', 'assets/js/data.js', 'assets/js/archive.js',
    'assets/js/photo.js', 'assets/js/map.js', 'assets/js/search-core.js',
    'assets/vendor/leaflet/leaflet.js', 'assets/vendor/leaflet/leaflet.css',
    'data/photos.json', 'data/locations.json', 'data/periods.json',
    'data/media.json', 'data/site-content.json'
  ];
  const missing = required.filter((f) => !existsSync(join(ROOT, f)));
  eq(missing, []);
});

t('modulele JS se încarcă fără eroare de sintaxă (import real)', () => {
  ok(typeof normalizeText === 'function');
  ok(typeof matchesFilters === 'function');
});

t('miniaturile și preview-urile există pentru toate fotografiile', () => {
  const media = read('data/media.json');
  const missing = [];
  for (const p of photos) {
    const v = media.variants[p.id];
    if (!v) { missing.push(p.id + ': lipsă'); continue; }
    if (!existsSync(join(ROOT, v.thumb.path))) missing.push(p.id + ': thumb');
    if (!existsSync(join(ROOT, v.preview.path))) missing.push(p.id + ': preview');
  }
  eq(missing, []);
});

t('revenirea la site-ul original este posibilă (snapshot + activele legacy)', () => {
  // Pagina legacy trebuie să existe ca snapshot și toate activele pe care le referă
  // să fie prezente, altfel revenirea ar produce un site incomplet.
  const legacy = join(ROOT, 'backup', 'legacy-index.html');
  ok(existsSync(legacy), 'lipsește backup/legacy-index.html (snapshot-ul de revenire)');

  const html = readFileSync(legacy, 'utf8');
  const refs = new Set();
  for (const m of html.matchAll(/(?:src|href)="(assets\/[^"]+)"/g)) refs.add(m[1]);
  ok(refs.size > 200, 'snapshot-ul legacy referă prea puține active: ' + refs.size);

  // referința ruptă cunoscută din original (nu e o pierdere de migrare)
  const knownBroken = 'assets/img/portfolio/277532475_133573735898323_1022537192671561500_nn.webp';
  const missing = [...refs].filter((r) => !existsSync(join(ROOT, r)) && r !== knownBroken);
  eq(missing, []);

  // CNAME-ul de revenire
  ok(existsSync(join(ROOT, 'backup', 'CNAME')), 'lipsește backup/CNAME');
});

t('directorul foto/ conține exact o pagină per fotografie', () => {
  const files = readdirSync(join(ROOT, 'foto')).filter((f) => f.endsWith('.html'));
  eq(files.length, photos.length);
});

/* ===================== F. Ștergere reversibilă (coș) ===================== */
group('F. Ștergere reversibilă (coș de reciclare)');

t('pagina uneltei de ștergere există și este protejată local', () => {
  const page = join(ROOT, 'tools', 'delete-photo.html');
  ok(existsSync(page), 'lipsește tools/delete-photo.html');
  const html = readFileSync(page, 'utf8');
  ok(html.includes('local-guard.js'), 'pagina nu include garda locală');
  ok(html.includes('/api/photos/delete'), 'pagina nu apelează endpoint-ul de ștergere');
  ok(html.includes('/api/photos/restore'), 'pagina nu apelează endpoint-ul de restaurare');
  ok(html.includes('noindex'), 'pagina nu este marcată noindex');
});

t('coșul de reciclare este exclus de la publicare', () => {
  const cfg = readFileSync(join(ROOT, '_config.yml'), 'utf8');
  ok(cfg.includes('data/deleted-photos.json'), '_config.yml nu exclude evidența coșului');
  ok(cfg.includes('backup'), '_config.yml nu exclude directorul backup/ (unde stă coșul)');
  const ignore = readFileSync(join(ROOT, '.gitignore'), 'utf8');
  ok(ignore.includes('backup/deleted/'), '.gitignore nu ignoră backup/deleted/');
});

t('funcțiile de ștergere/restaurare sunt exportate din bibliotecă', () => {
  const lib = readFileSync(join(ROOT, 'tools', 'lib', 'photos.js'), 'utf8');
  for (const fn of ['softDeletePhoto', 'restorePhoto', 'purgeTrash', 'loadTrash', 'deletedIds']) {
    ok(lib.includes('export function ' + fn), 'lipsește exportul ' + fn);
  }
  // ștergerea mută fișierele, nu le distruge
  ok(lib.includes('renameSync'), 'ștergerea nu mută fișierele (ar fi distructivă)');
  ok(!/rmSync\(join\(root, m\.from\)/.test(lib), 'restaurarea nu trebuie să șteargă sursa');
});

t('extract.js nu readuce în catalog fotografiile șterse', () => {
  const src = readFileSync(join(ROOT, 'tools', 'extract.js'), 'utf8');
  ok(src.includes('deletedIds'), 'extract.js nu filtrează fotografiile șterse');
  ok(/legacyPhotos/.test(src), 'extract.js nu aplică filtrarea pe fotografiile legacy');
});

t('evidența coșului (dacă există) are forma corectă', () => {
  const file = join(ROOT, 'data', 'deleted-photos.json');
  if (!existsSync(file)) return;
  const trash = JSON.parse(readFileSync(file, 'utf8'));
  ok(Array.isArray(trash.deleted), 'câmpul „deleted” trebuie să fie listă');
  for (const entry of trash.deleted) {
    ok(entry.photo && entry.photo.id, 'intrare fără fotografie în coș');
    ok(Array.isArray(entry.moved), 'intrare fără lista de fișiere mutate');
    for (const m of entry.moved) {
      ok(m.from && m.to, 'fișier mutat fără „from”/„to”');
      ok(m.to.startsWith('backup/deleted/'), 'fișierul mutat nu este în backup/deleted/: ' + m.to);
    }
    // o fotografie aflată în coș NU trebuie să mai existe în catalog
    ok(!photos.some((p) => p.id === entry.photo.id),
      'fotografia ' + entry.photo.id + ' este și în coș, și în catalog');
  }
});

/* ================================ Rezumat ================================ */
console.log('\n' + '='.repeat(72));
console.log(`TESTE: ${pass} trecute, ${failures.length} eșuate`);
if (failures.length) {
  console.log('='.repeat(72));
  failures.forEach((f) => console.log('  X ' + f));
}
console.log('='.repeat(72));
process.exit(failures.length ? 1 : 0);

