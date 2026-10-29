/**
 * tools/build.js — generează site-ul static complet din catalogul JSON.
 *
 * Ieșiri: index.html, arhiva.html, harta.html, despre.html, 404.html,
 *         foto/<slug>.html (257 pagini), sitemap.xml, robots.txt,
 *         data/site-stats.json
 *
 * Fără dependențe externe. Nu modifică imaginile originale și nu șterge nimic din `backup/`.
 */
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { join, dirname, basename } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import { page, icon, SITE } from './lib/layout.js';
import { loadSiteConfig, resolveHero, heroCaption } from './lib/site-config.js';
import { escapeHtml, escapeAttr, normalizeText, sortPhotos } from '../assets/js/search-core.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => JSON.parse(readFileSync(join(ROOT, p), 'utf8'));

const photosData = read('data/photos.json');
const locationsData = read('data/locations.json');
const periodsData = read('data/periods.json');
const mediaData = read('data/media.json');
const site = read('data/site-content.json');

const photos = photosData.photos;
const variants = mediaData.variants;
const byId = new Map(photos.map((p) => [p.id, p]));
const locationById = new Map(locationsData.locations.map((l) => [l.id, l]));
const periodById = new Map(periodsData.periods.map((p) => [p.id, p]));
const eraById = new Map(periodsData.eras.map((e) => [e.id, e]));

const photoHref = (p) => 'foto/' + p.slug + '.html';
const thumbPath = (p) => (variants[p.id] && variants[p.id].thumb.path) || p.image;
const previewPath = (p) => (variants[p.id] && variants[p.id].preview.path) || p.image;
const thumbSize = (p) => (variants[p.id] && variants[p.id].thumb) || { width: 600, height: 400 };
const previewSize = (p) => (variants[p.id] && variants[p.id].preview) || { width: 1200, height: 800 };

const locationName = (p) => (p.locationId && locationById.get(p.locationId) ? locationById.get(p.locationId).name : null);
const periodLabel = (p) => (p.periodId && periodById.get(p.periodId) ? periodById.get(p.periodId).label : null);

function write(relPath, contents) {
  const abs = join(ROOT, relPath);
  mkdirSync(dirname(abs), { recursive: true });
  writeFileSync(abs, contents);
}

/** Card de fotografie folosit în grile (server-side). */
function card(p, root = '') {
  const size = thumbSize(p);
  const place = locationName(p);
  return [
    '<article class="card">',
    '  <div class="card__media">',
    `    <img src="${root}${thumbPath(p)}" width="${size.width}" height="${size.height}" `
    + `alt="${escapeAttr(p.alt || p.title)}" loading="lazy" decoding="async" data-lazy>`,
    '  </div>',
    '  <div class="card__body">',
    `    <h3 class="card__title"><a href="${root}${photoHref(p)}">${escapeHtml(p.title)}</a></h3>`,
    '    <div class="card__meta">',
    `      <span class="badge">${escapeHtml(p.yearLabel)}</span>`,
    place ? `      <span>${escapeHtml(place)}</span>` : '',
    '    </div>',
    '  </div>',
    '</article>'
  ].filter(Boolean).join('\n');
}

const periodCounts = periodsData.periods.map((per) => ({
  period: per,
  count: photos.filter((p) => p.periodId === per.id).length
}));

const SCRIPTS = {
  site: '<script type="module" src="assets/js/site.js"></script>',
  archive: '<script type="module" src="assets/js/archive.js"></script>',
  map: '<script type="module" src="assets/js/map.js"></script>',
  photo: '<script type="module" src="assets/js/photo.js"></script>'
};

/** Dimensiunile unei imagini de pe disc (pentru width/height explicite). */
function imageSize(relPath) {
  try {
    const out = execFileSync('magick', ['identify', '-format', '%w %h', join(ROOT, relPath)],
      { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
    const [w, h] = out.trim().split(/\s+/).map(Number);
    if (w && h) return { width: w, height: h };
  } catch (e) { /* ImageMagick lipsește sau imaginea nu poate fi citită */ }
  return { width: 1600, height: 900 };
}

/**
 * Sursa imaginii de header + dimensiunile ei.
 * Folosește preview-ul generat dacă există (fișier mai mic), altfel imaginea originală.
 */
function heroMedia(hero) {
  if (hero.photo && variants[hero.photo.id]) {
    return { src: previewPath(hero.photo), size: previewSize(hero.photo) };
  }
  if (hero.preview && existsSync(join(ROOT, hero.preview))) {
    return { src: hero.preview, size: imageSize(hero.preview) };
  }
  if (hero.image && existsSync(join(ROOT, hero.image))) {
    return { src: hero.image, size: imageSize(hero.image) };
  }
  return { src: hero.image, size: { width: 1600, height: 900 } };
}

/* ------------------------------------------------------------------ *
 * Pagina principală
 * ------------------------------------------------------------------ */
function buildHome() {
  // Imaginea de header vine din data/site-config.json (nu se pierde la rebuild).
  const siteConfig = loadSiteConfig(ROOT);
  const fallbackHero = photos.find((p) => p.image.includes('274345181')) || photos[0];
  const hero = resolveHero(siteConfig, photos, fallbackHero);
  const media = heroMedia(hero);
  const heroSize = media.size;
  // Text introductiv: prima propoziție din textul original (verbatim, fără reformulare).
  const heroIntroRaw = (site.aboutParagraphs[0] || '').trim();
  const heroIntro = heroIntroRaw ? heroIntroRaw.split(/(?<=\.)\s/)[0] : '';

  // Selecție deterministă: cele mai timpurii 3 fotografii din fiecare perioadă.
  const featured = [];
  for (const pc of periodCounts) {
    const inPeriod = photos.filter((p) => p.periodId === pc.period.id)
      .sort((a, b) => (a.yearStart || 9999) - (b.yearStart || 9999) || a.legacyIndex - b.legacyIndex);
    featured.push(...inPeriod.slice(0, 3));
  }

  const heroHtml = [
    '<section class="hero" id="header">',
    '  <div class="hero__media">',
    `    <img src="${media.src}" width="${heroSize.width}" height="${heroSize.height}" `
    + `alt="${escapeAttr(hero.alt)}" fetchpriority="high" decoding="async">`,
    '  </div>',
    '  <div class="hero__scrim"></div>',
    '  <div class="wrap">',
    '    <div class="hero__content">',
    '      <p class="eyebrow">Arhivă fotografică · Huedin</p>',
    '      <h1 class="hero__title">Huedinul de <em>altădată</em>, readus la viață prin culoare</h1>',
    `      <p class="hero__text">${escapeHtml(heroIntro)}</p>`,
    '      <div class="hero__actions">',
    '        <a class="btn btn--gold" href="arhiva.html">Explorează arhiva</a>',
    '        <a class="btn" href="harta.html">Descoperă pe hartă</a>',
    '      </div>',
    `      <p class="hero__meta">${escapeHtml(site.tagline)}</p>`,
    '    </div>',
    '  </div>',
    '<span class="hero__cue" aria-hidden="true"></span>',
    `  <p class="hero__caption">${escapeHtml(heroCaption(hero))}</p>`,
    '</section>'
  ].join('\n');

  const periodsHtml = [
    '<section class="section section--alt" id="portfolio">',
    '  <div class="wrap">',
    '    <div class="section-head" data-reveal>',
    '      <div>',
    '        <p class="eyebrow">Colecția</p>',
    '        <h2>Perioade istorice</h2>',
    '        <p>Filtrele existente ale arhivei, păstrate exact ca în versiunea originală.</p>',
    '      </div>',
    '      <a class="btn" href="arhiva.html">Toată arhiva ' + icon('arrowRight', 16) + '</a>',
    '    </div>',
    '    <ul class="chips">',
    periodCounts.map((pc) => `      <li><a class="chip" href="arhiva.html?period=${encodeURIComponent(pc.period.id)}">`
      + `${escapeHtml(pc.period.label)} <span class="muted">(${pc.count})</span></a></li>`).join('\n'),
    '    </ul>',
    '    <div class="grid" style="margin-top:1.8rem">',
    featured.map((p) => card(p)).join('\n'),
    '    </div>',
    '  </div>',
    '</section>'
  ].join('\n');



  const aboutHtml = [
    '<section class="section" id="about">',
    '  <div class="wrap">',
    '    <div class="section-head" data-reveal>',
    '      <div>',
    '        <p class="eyebrow">Despre proiect</p>',
    `        <h2>${escapeHtml(site.aboutHeading || 'Huedinul istoric')}</h2>`,
    '      </div>',
    '      <a class="btn" href="despre.html">Detalii despre proiect ' + icon('arrowRight', 16) + '</a>',
    '    </div>',
    '    <div class="prose">',
    site.aboutParagraphs.map((p) => `      <p>${escapeHtml(p)}</p>`).join('\n'),
    '    </div>',
    '    <h3 style="margin-top:2rem">Disclaimer</h3>',
    '    <ul class="note-list">',
    site.disclaimerItems.map((i) => `      <li><span>${escapeHtml(i)}</span></li>`).join('\n'),
    '    </ul>',
    '  </div>',
    '</section>'
  ].join('\n');

  const servicesHtml = [
    '<section class="section section--alt" id="services">',
    '  <div class="wrap">',
    '    <div class="section-head" data-reveal>',
    '      <div>',
    '        <p class="eyebrow">Utile</p>',
    '        <h2>Date despre Huedin și legături utile</h2>',
    '        <p>Informațiile publice preluate din versiunea originală a site-ului.</p>',
    '      </div>',
    '    </div>',
    '    <div class="stats">',
    site.counts.map((c) => `      <div class="stat" data-reveal><div class="stat__value">${escapeHtml(c.value)}</div>`
      + `<div class="stat__label">${escapeHtml(c.label)}</div></div>`).join('\n'),
    '    </div>',
    '    <div class="link-grid" style="margin-top:1.6rem">',
    site.usefulLinks.map((l) => `      <a class="link-card" data-reveal href="${escapeAttr(l.url)}" rel="noopener" target="_blank">`
      + `<h3>${escapeHtml(l.title)}</h3><p>${escapeHtml(l.description)}</p></a>`).join('\n'),
    '    </div>',
    '  </div>',
    '</section>'
  ].join('\n');

  const email = site.email || '';
  const phone = site.phoneDisplay || '';
  const address = (site.infoBoxes.find((i) => /adres/i.test(i.label)) || {}).value || '';

  const contactHtml = [
    '<section class="section" id="contact">',
    '  <div class="wrap">',
    '    <div class="section-head" data-reveal>',
    '      <div>',
    '        <p class="eyebrow">Contact</p>',
    '        <h2>Scrieți-ne</h2>',
    '        <p>Orice sugestie, corectură sau informație suplimentară despre fotografii este binevenită.</p>',
    '      </div>',
    '    </div>',
    '    <div class="link-grid">',
    address ? `      <div class="link-card"><h3>Adresă</h3><p>${escapeHtml(address)}</p></div>` : '',
    email ? `      <a class="link-card" href="mailto:${escapeAttr(email)}"><h3>Email</h3><p>${escapeHtml(email)}</p></a>` : '',
    phone ? `      <a class="link-card" href="tel:${escapeAttr(phone.replace(/\s/g, ''))}"><h3>Telefon</h3><p>${escapeHtml(phone)}</p></a>` : '',
    '      <a class="link-card" href="harta.html"><h3>Hartă</h3><p>Locațiile documentate din arhivă.</p></a>',
    '    </div>',
    site.formAction ? [
      `    <form class="filters" style="margin-top:1.6rem" action="${escapeAttr(site.formAction)}" method="post">`,
      '      <div class="filters__row">',
      '        <div class="field field--wide"><label for="c-name">Nume</label><input id="c-name" name="firstName" type="text" required></div>',
      '        <div class="field"><label for="c-surname">Prenume</label><input id="c-surname" name="lastName" type="text" required></div>',
      '        <div class="field field--wide"><label for="c-email">Email</label><input id="c-email" name="email" type="email" required></div>',
      '      </div>',
      '      <div class="field" style="margin-top:.85rem"><label for="c-msg">Mesaj</label>'
      + '<textarea id="c-msg" name="anotherInput" rows="5" required></textarea></div>',
      '      <div class="filters__foot"><button class="btn btn--gold" type="submit">Trimite mesajul</button>'
      + '<span class="muted">Formularul este procesat de serviciul extern existent (formcarry.com).</span></div>',
      '    </form>'
    ].join('\n') : '',
    '  </div>',
    '</section>'
  ].filter(Boolean).join('\n');

  const content = [heroHtml, periodsHtml, servicesHtml, aboutHtml, contactHtml].join('\n\n');

  write('index.html', page({
    title: '',
    description: site.metaDescription || SITE.defaultDescription,
    canonical: 'index.html',
    active: 'acasa',
    root: '',
    site,
    content,
    image: media.src,
    scripts: SCRIPTS.site
  }));
}

/* ------------------------------------------------------------------ *
 * Pagina arhivei (shell static; datele se încarcă din data/*.json)
 * ------------------------------------------------------------------ */
function buildArchive() {
  const content = [
    '<section class="section section--tight">',
    '  <div class="wrap">',
    '    <p class="eyebrow">Arhivă foto</p>',
    '    <h1>Toate fotografiile</h1>',
    `    <p class="lede">Colecția completă a arhivei, cu anul sau perioada și localitatea, `
    + 'acolo unde acestea sunt documentate. Fotografiile cu metadate incomplete rămân vizibile.</p>',
    '  </div>',
    '</section>',
    '<section class="section section--tight" style="padding-top:0">',
    '  <div class="wrap">',
    '    <form class="filters" id="filters" role="search" aria-label="Căutare în arhivă">',
    '      <div class="filters__row">',
    '        <div class="field field--wide"><label for="f-q">Căutare liberă</label>'
    + '<input id="f-q" name="q" type="search" placeholder="ex: piața, biserica, 1985" autocomplete="off"></div>',
    '        <div class="field"><label for="f-period">Perioadă</label><select id="f-period" name="period"></select></div>',
    '        <div class="field"><label for="f-location">Localitate</label><select id="f-location" name="location"></select></div>',
    '      </div>',
    '      <button class="btn btn--sm btn--ghost filters__toggle" type="button" id="filters-toggle" '
    + 'aria-expanded="false" aria-controls="filters-fields" style="margin-top:.9rem">Filtre după an</button>',
    '      <div class="filters__fields" id="filters-fields">',
    '        <div class="filters__row" style="margin-top:.9rem">',
    '          <div class="field"><label for="f-year">An exact</label>'
    + '<input id="f-year" name="year" type="number" min="1800" max="2030" inputmode="numeric" placeholder="ex: 1985"></div>',
    '          <div class="field"><label for="f-from">An de la</label>'
    + '<input id="f-from" name="yearFrom" type="number" min="1800" max="2030" inputmode="numeric"></div>',
    '          <div class="field"><label for="f-to">An până la</label>'
    + '<input id="f-to" name="yearTo" type="number" min="1800" max="2030" inputmode="numeric"></div>',
    '        </div>',
    '      </div>',
    '      <div class="filters__foot">',
    '        <p class="filters__count" id="count" role="status" aria-live="polite"></p>',
    '        <label class="field" style="margin-left:auto"><span>Sortare</span>',
    '          <select id="f-sort" name="sort">',
    '            <option value="archive">Ordinea arhivei</option>',
    '            <option value="year-asc">An crescător</option>',
    '            <option value="year-desc">An descrescător</option>',
    '            <option value="title">Titlu (A–Z)</option>',
    '          </select>',
    '        </label>',
    '        <button class="btn btn--sm btn--ghost" type="button" id="reset">Resetează filtrele</button>',
    '      </div>',
    '      <div class="filters__active" id="active"></div>',
    '    </form>',
    '    <div class="grid" id="grid"></div>',
    '    <div class="empty" id="empty" hidden>',
    '      <h3>Nicio fotografie pentru filtrele alese</h3>',
    '      <p class="muted">Încercați un termen mai general sau resetați filtrele. '
    + 'Unele fotografii au anul necunoscut și nu apar la filtrarea pe an.</p>',
    '      <button class="btn btn--sm" type="button" id="reset-empty">Resetează filtrele</button>',
    '    </div>',
    '    <div class="pager" id="pager" hidden></div>',
    '  </div>',
    '</section>'
  ].join('\n');

  write('arhiva.html', page({
    title: 'Arhivă foto',
    description: 'Toate fotografiile istorice din arhivă, cu căutare după text, an, perioadă și localitate.',
    canonical: 'arhiva.html',
    active: 'arhiva',
    root: '',
    site,
    content,
    scripts: SCRIPTS.archive
  }));
}

/* ------------------------------------------------------------------ *
 * Pagina hărții
 * ------------------------------------------------------------------ */
function buildMap() {
  const hasOwn = (p) => typeof p.latitude === 'number' && typeof p.longitude === 'number';
  const ownCoords = photos.filter(hasOwn);
  const exactCount = ownCoords.filter((p) => p.coordinateCertainty === 'exact').length;
  const approxCount = ownCoords.length - exactCount;
  const localityPins = photos.filter((p) => !hasOwn(p) && p.locationId
    && typeof (locationById.get(p.locationId) || {}).latitude === 'number').length;
  const noPin = photos.length - ownCoords.length - localityPins;

  const legend = [
    '<ul class="map-legend">',
    `  <li><span class="map-legend__pin map-legend__pin--exact"></span> poziționare exactă `
    + `<span class="muted">(${exactCount})</span></li>`,
    `  <li><span class="map-legend__pin map-legend__pin--approx"></span> poziționare aproximativă `
    + `<span class="muted">(${approxCount})</span></li>`,
    `  <li><span class="map-legend__pin map-legend__pin--locality"></span> doar localitatea `
    + `<span class="muted">(${localityPins})</span></li>`,
    `  <li><span class="map-legend__pin map-legend__pin--cluster">n</span> grup de fotografii apropiate</li>`,
    '</ul>'
  ].join('\n');

  const content = [
    '<section class="section section--tight">',
    '  <div class="wrap">',
    '    <p class="eyebrow">Hartă</p>',
    '    <h1>Harta fotografiilor</h1>',
    `    <p class="lede"><strong>${ownCoords.length}</strong> fotografii au coordonate proprii și apar `
    + `pe hartă la poziția lor (${exactCount} exacte, ${approxCount} aproximative). `
    + `<strong>${localityPins}</strong> sunt afișate doar la nivel de localitate, `
    + `iar <strong>${noPin}</strong> nu au încă nicio coordonată. `
    + 'Nu sunt plasate pin-uri presupuse: fiecare coordonată are o sursă înregistrată, '
    + 'vizibilă la selectarea pin-ului.</p>',
    '  </div>',
    '</section>',
    '<section class="section section--tight" style="padding-top:0">',
    '  <div class="wrap">',
    '    <form class="filters" id="map-filters" role="search" aria-label="Filtrează pin-urile de pe hartă">',
    '      <div class="filters__row">',
    '        <div class="field"><label for="m-period">Perioadă istorică</label>'
    + '<select id="m-period" name="period"></select></div>',
    '        <div class="field"><label for="m-year">An exact</label>'
    + '<input id="m-year" name="year" type="number" min="1800" max="2030" inputmode="numeric" placeholder="ex: 1985"></div>',
    '        <div class="field"><label for="m-from">An de la</label>'
    + '<input id="m-from" name="yearFrom" type="number" min="1800" max="2030" inputmode="numeric"></div>',
    '        <div class="field"><label for="m-to">An până la</label>'
    + '<input id="m-to" name="yearTo" type="number" min="1800" max="2030" inputmode="numeric"></div>',
    '      </div>',
    '      <div class="filters__foot">',
    '        <p class="filters__count" id="m-count" role="status" aria-live="polite"></p>',
    '        <button class="btn btn--sm btn--ghost" type="button" id="m-reset" style="margin-left:auto">'
    + 'Resetează filtrele</button>',
    '      </div>',
    '      <div class="filters__active" id="m-active"></div>',
    '    </form>',
    '    <div class="map-shell">',
    '      <div id="map" role="application" aria-label="Hartă interactivă a fotografiilor"></div>',
    '      <aside class="map-panel" id="map-panel" aria-live="polite">',
    '        <p class="muted">Selectați un pin pentru a vedea fotografiile din acea zonă.</p>',
    '      </aside>',
    '    </div>',
    legend,
    '    <div class="map-fallback" id="map-fallback" hidden></div>',
    '    <noscript><p class="map-fallback">Harta necesită JavaScript. '
    + 'Lista locurilor documentate este disponibilă în arhiva foto.</p></noscript>',
    '  </div>',
    '</section>'
  ].join('\n');

  write('harta.html', page({
    title: 'Hartă',
    description: 'Hartă a locurilor documentate în arhiva fotografică Huedin. Doar localitățile cu coordonate verificate.',
    canonical: 'harta.html',
    active: 'harta',
    root: '',
    site,
    head: '<link rel="stylesheet" href="assets/vendor/leaflet/leaflet.css">\n'
      + '<script src="assets/vendor/leaflet/leaflet.js" defer></script>',
    content,
    scripts: SCRIPTS.map
  }));
}


/* ------------------------------------------------------------------ *
 * Pagina „Despre”
 * ------------------------------------------------------------------ */
function buildAbout() {
  const withYear = photos.filter((p) => p.year !== null).length;
  const withRange = photos.filter((p) => p.year === null && p.yearStart !== null).length;
  const eraOnly = photos.filter((p) => p.yearStart === null && p.eraId).length;
  const unknownYear = photos.filter((p) => p.yearStart === null && !p.eraId).length;
  const withLocation = photos.filter((p) => p.locationId).length;

  const content = [
    '<section class="section section--tight">',
    '  <div class="wrap prose">',
    '    <p class="eyebrow">Despre proiect</p>',
    `    <h1>${escapeHtml(site.aboutHeading || 'Huedinul istoric')}</h1>`,
    site.aboutParagraphs.map((p) => `    <p>${escapeHtml(p)}</p>`).join('\n'),
    '    <h2>Disclaimer</h2>',
    '    <ul class="note-list">',
    site.disclaimerItems.map((i) => `      <li><span>${escapeHtml(i)}</span></li>`).join('\n'),
    '    </ul>',
    '  </div>',
    '</section>',
    '<section class="section section--alt">',
    '  <div class="wrap">',
    '    <h2>Structura arhivei</h2>',
    `    <p class="lede">Arhiva conține <strong>${photos.length}</strong> fotografii, dintre care `
    + `<strong>${withYear}</strong> au un an exact documentat și <strong>${withRange}</strong> au doar o `
    + `perioadă sau un interval. <strong>${eraOnly}</strong> sunt datate doar prin formularea `
    + `„perioada interbelică”, iar <strong>${unknownYear}</strong> nu au nicio datare documentată. `
    + `<strong>${withLocation}</strong> fotografii au o localitate identificată în descrierile originale.</p>`,
    '    <div class="stats">',
    periodsData.periods.map((per) => {
      const c = photos.filter((p) => p.periodId === per.id).length;
      return `      <div class="stat" data-reveal><div class="stat__value">${c}</div>`
        + `<div class="stat__label">${escapeHtml(per.label)}</div></div>`;
    }).join('\n'),
    '    </div>',
    '    <h2 style="margin-top:2.4rem">Metadate și onestitate istorică</h2>',
    '    <ul class="note-list">',
    '      <li><span>Anii exacți sunt preluați verbatim din descrierile originale; nicio dată nu a fost estimată automat.</span></li>',
    '      <li><span>Formulările precum „aprox. 1900”, „anii ’40” sau „perioada interbelică” sunt păstrate ca atare.</span></li>',
    '      <li><span>Coordonatele geografice nu sunt generate automat. Harta afișează doar localitățile confirmate.</span></li>',
    '      <li><span>Nu au fost eliminate fotografii, titluri sau descrieri din versiunea originală.</span></li>',
    '    </ul>',
    '  </div>',
    '</section>',
    '<section class="section">',
    '  <div class="wrap">',
    '    <h2>Legături utile</h2>',
    '    <div class="link-grid">',
    site.usefulLinks.map((l) => `      <a class="link-card" data-reveal href="${escapeAttr(l.url)}" rel="noopener" target="_blank">`
      + `<h3>${escapeHtml(l.title)}</h3><p>${escapeHtml(l.description)}</p></a>`).join('\n'),
    '    </div>',
    '  </div>',
    '</section>'
  ].join('\n');

  write('despre.html', page({
    title: 'Despre proiect',
    description: 'Despre proiectul Huedinul Istoric: documentare, colorizare, surse și structura arhivei.',
    canonical: 'despre.html',
    active: 'despre',
    root: '',
    site,
    content,
    scripts: SCRIPTS.site
  }));
}


/* ------------------------------------------------------------------ *
 * Paginile individuale ale fotografiilor
 * ------------------------------------------------------------------ */
function relatedFor(photo) {
  const same = photos.filter((p) => p.id !== photo.id && (
    (photo.locationId && p.locationId === photo.locationId)
    || (photo.periodId && p.periodId === photo.periodId)
  ));
  same.sort((a, b) => {
    const aLoc = a.locationId === photo.locationId ? 0 : 1;
    const bLoc = b.locationId === photo.locationId ? 0 : 1;
    if (aLoc !== bLoc) return aLoc - bLoc;
    return Math.abs((a.yearStart || 0) - (photo.yearStart || 0))
      - Math.abs((b.yearStart || 0) - (photo.yearStart || 0));
  });
  return same.slice(0, 6);
}

function fact(label, value) {
  if (!value) return '';
  return `      <li><span class="k">${escapeHtml(label)}</span><span class="v">${value}</span></li>`;
}

function buildPhotoPage(photo, index) {
  const prev = photos[index - 1] || null;
  const next = photos[index + 1] || null;
  const loc = photo.locationId ? locationById.get(photo.locationId) : null;
  const per = photo.periodId ? periodById.get(photo.periodId) : null;
  const pSize = previewSize(photo);
  const related = relatedFor(photo);
  const caption = [photo.yearLabel, loc ? loc.name : ''].filter(Boolean).join(' · ');
  const hasOwnCoords = typeof photo.latitude === 'number' && typeof photo.longitude === 'number';
  const mapHref = hasOwnCoords
    ? '../harta.html?foto=' + encodeURIComponent(photo.slug)
    : (loc ? '../harta.html?loc=' + encodeURIComponent(loc.id) : null);

  const figure = [
    `  <figure class="photo__figure" data-photo-figure data-full="../${escapeAttr(photo.image)}" `
    + `data-title="${escapeAttr(photo.title)}" data-caption="${escapeAttr(caption)}" `
    + `tabindex="0" role="button" aria-label="Mărește fotografia">`,
    `    <img src="../${previewPath(photo)}" width="${pSize.width}" height="${pSize.height}" `
    + `alt="${escapeAttr(photo.alt || photo.title)}" decoding="async">`,
    `    <figcaption>${escapeHtml(photo.title)}${loc ? ' · ' + escapeHtml(loc.name) : ''}`
    + ' — apăsați pentru vizualizare mărită.</figcaption>',
    '  </figure>',
    '  <div class="photo__actions">',
    photo.originalImage
      ? `    <a class="btn btn--sm" href="../${escapeAttr(photo.originalImage)}" target="_blank" rel="noopener">Vezi originalul alb-negru</a>`
      : '',
    `    <a class="btn btn--sm" href="../${escapeAttr(photo.image)}" target="_blank" rel="noopener">Rezoluție maximă</a>`,
    mapHref ? `    <a class="btn btn--sm" href="${escapeAttr(mapHref)}">Vezi pe hartă</a>` : '',
    '  </div>'
  ].filter(Boolean).join('\n');

  const side = [
    `    <h1>${escapeHtml(photo.title)}</h1>`,
    '    <ul class="photo__facts">',
    fact('An / perioadă', escapeHtml(photo.yearLabel)),
    fact('Perioadă', per ? escapeHtml(per.label) : ''),
    fact('Localitate', loc ? escapeHtml(loc.name) : ''),
    fact('Coordonate', hasOwnCoords
      ? escapeHtml(photo.latitude.toFixed(5) + ', ' + photo.longitude.toFixed(5))
        + (photo.coordinateCertainty === 'exact' ? ' (exacte)' : ' (aproximative)')
      : ''),
    fact('Cod arhivă', escapeHtml(photo.id)),
    '    </ul>',
    hasOwnCoords && photo.coordinateSource
      ? `    <p class="photo__note">Sursa coordonatelor: ${escapeHtml(photo.coordinateSource)}.</p>`
      : '',
    !hasOwnCoords && loc && typeof loc.latitude !== 'number'
      ? '    <p class="photo__note">Localitatea este documentată, dar coordonatele exacte nu sunt confirmate.</p>'
      : '',
    photo.yearText ? `    <p class="photo__note">Text original: „${escapeHtml(photo.yearText)}”.</p>` : '',
    photo.locationNote ? `    <p class="photo__note">${escapeHtml(photo.locationNote)}</p>` : '',
    photo.alt ? `    <p class="muted">Descriere: ${escapeHtml(photo.alt)}</p>` : '',
    '    <a class="btn btn--sm btn--ghost" href="../arhiva.html">' + icon('arrowLeft', 16) + ' Înapoi la rezultate</a>'
  ].filter(Boolean).join('\n');

  const relatedHtml = related.length ? [
    '<section class="related">',
    '  <h2>Fotografii asociate</h2>',
    '  <div class="grid">',
    related.map((p) => card(p, '../')).join('\n'),
    '  </div>',
    '</section>'
  ].join('\n') : '';

  const navHtml = [
    '<nav class="photo-nav" aria-label="Navigare între fotografii">',
    prev
      ? `  <a data-prev href="${escapeAttr(prev.slug)}.html"><span>← Anterioară</span>`
        + `${escapeHtml(prev.title)} (${escapeHtml(prev.yearLabel)})</a>`
      : '  <span></span>',
    next
      ? `  <a data-next href="${escapeAttr(next.slug)}.html" style="text-align:right"><span>Următoare →</span>`
        + `${escapeHtml(next.title)} (${escapeHtml(next.yearLabel)})</a>`
      : '  <span></span>',
    '</nav>'
  ].join('\n');

  const content = [
    '<div class="wrap">',
    '  <nav class="crumbs" aria-label="Fir de navigare">',
    '    <a href="../index.html">Acasă</a><span aria-hidden="true">/</span>',
    '    <a href="../arhiva.html">Arhivă foto</a><span aria-hidden="true">/</span>',
    `    <span aria-current="page">${escapeHtml(photo.title)}</span>`,
    '  </nav>',
    '</div>',
    '<section class="photo">',
    '  <div class="wrap">',
    '    <div class="photo__layout">',
    '      <div>',
    figure,
    '      </div>',
    '      <div class="photo__side">',
    side,
    '      </div>',
    '    </div>',
    navHtml,
    relatedHtml,
    '  </div>',
    '</section>'
  ].join('\n');

  write('foto/' + photo.slug + '.html', page({
    title: photo.title + (photo.yearLabel ? ' (' + photo.yearLabel + ')' : ''),
    description: photo.alt
      ? photo.alt + (loc ? ' · ' + loc.name : '')
      : [photo.title, photo.yearLabel, loc ? loc.name : ''].filter(Boolean).join(' · '),
    canonical: 'foto/' + photo.slug + '.html',
    active: 'arhiva',
    root: '../',
    site,
    content,
    image: previewPath(photo),
    ogType: 'article',
    scripts: '<script type="module" src="../assets/js/photo.js"></script>'
  }));
}


/* ------------------------------------------------------------------ *
 * Pagina 404, sitemap, robots, statistici
 * ------------------------------------------------------------------ */
function build404() {
  const content = [
    '<section class="section">',
    '  <div class="wrap center" style="max-width:44rem;margin:0 auto">',
    '    <p class="eyebrow">Eroare 404</p>',
    '    <h1>Pagina nu a fost găsită</h1>',
    '    <p class="lede" style="margin:0 auto 1.6rem">Linkul folosit nu mai există sau a fost scris greșit. '
    + 'Puteți căuta în arhivă sau reveni la pagina principală.</p>',
    '    <div class="hero__actions" style="justify-content:center">',
    '      <a class="btn btn--gold" href="/index.html">Pagina principală</a>',
    '      <a class="btn" href="/arhiva.html">Arhivă foto</a>',
    '      <a class="btn" href="/harta.html">Hartă</a>',
    '    </div>',
    '  </div>',
    '</section>'
  ].join('\n');

  write('404.html', page({
    title: 'Pagina nu a fost găsită',
    description: 'Pagina căutată nu există în arhiva Huedin.net.',
    canonical: '404.html',
    active: '',
    root: '/',
    site,
    content,
    head: '<meta name="robots" content="noindex">'
  }));
}

function buildSitemap() {
  const urls = [
    { loc: 'index.html', priority: '1.0', changefreq: 'monthly' },
    { loc: 'arhiva.html', priority: '0.9', changefreq: 'weekly' },
    { loc: 'harta.html', priority: '0.8', changefreq: 'monthly' },
    { loc: 'despre.html', priority: '0.6', changefreq: 'yearly' }
  ].concat(photos.map((p) => ({
    loc: 'foto/' + p.slug + '.html',
    priority: '0.7',
    changefreq: 'yearly',
    image: p.image
  })));

  const body = urls.map((u) => {
    const parts = [
      `    <loc>${SITE.url}/${u.loc}</loc>`,
      `    <changefreq>${u.changefreq}</changefreq>`,
      `    <priority>${u.priority}</priority>`
    ];
    if (u.image) {
      parts.push('    <image:image>');
      parts.push(`      <image:loc>${SITE.url}/${u.image.split('/').map(encodeURIComponent).join('/')}</image:loc>`);
      parts.push('    </image:image>');
    }
    return '  <url>\n' + parts.join('\n') + '\n  </url>';
  }).join('\n');

  write('sitemap.xml', '<?xml version="1.0" encoding="UTF-8"?>\n'
    + '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" '
    + 'xmlns:image="http://www.google.com/schemas/sitemap-image/1.1">\n'
    + body + '\n</urlset>\n');

  write('robots.txt', [
    'User-agent: *',
    'Allow: /',
    'Disallow: /tools/',
    'Disallow: /docs/',
    'Disallow: /backup/',
    'Disallow: /node_modules/',
    '',
    `Sitemap: ${SITE.url}/sitemap.xml`,
    ''
  ].join('\n'));
}

function buildStats() {
  const byPeriod = {};
  for (const per of periodsData.periods) {
    byPeriod[per.id] = photos.filter((p) => p.periodId === per.id).length;
  }
  const stats = {
    generatedFrom: 'data/photos.json',
    photos: photos.length,
    photoPages: photos.length,
    pages: ['index.html', 'arhiva.html', 'harta.html', 'despre.html', '404.html'],
    periods: byPeriod,
    exactYear: photos.filter((p) => p.year !== null).length,
    approximateOrRange: photos.filter((p) => p.year === null && p.yearStart !== null).length,
    eraOnly: photos.filter((p) => p.yearStart === null && p.eraId).length,
    unknownYear: photos.filter((p) => p.yearStart === null && !p.eraId).length,
    withLocation: photos.filter((p) => p.locationId).length,
    withoutLocation: photos.filter((p) => !p.locationId).length,
    withOwnCoordinates: photos.filter((p) => typeof p.latitude === 'number' && typeof p.longitude === 'number').length,
    withExactCoordinates: photos.filter((p) => typeof p.latitude === 'number' && p.coordinateCertainty === 'exact').length,
    withoutAnyCoordinates: photos.filter((p) => typeof p.latitude !== 'number').length,
    locationsTotal: locationsData.locations.length,
    locationsWithCoordinates: locationsData.locations.filter((l) => typeof l.latitude === 'number').length,
    withBlackAndWhiteOriginal: photos.filter((p) => p.originalImage).length,
    brokenLegacyReferences: photos.filter((p) => p.lightboxBroken).length
  };
  write('data/site-stats.json', JSON.stringify(stats, null, 1) + '\n');
  return stats;
}

/* ------------------------------------------------------------------ *
 * Execuție
 * ------------------------------------------------------------------ */
function main() {
  buildHome();
  buildArchive();
  buildMap();
  buildAbout();
  photos.forEach((p, i) => buildPhotoPage(p, i));
  build404();
  buildSitemap();
  const stats = buildStats();

  console.log('Pagini generate:');
  console.log('  index.html, arhiva.html, harta.html, despre.html, 404.html');
  console.log('  foto/*.html:', photos.length);
  console.log('  sitemap.xml, robots.txt, data/site-stats.json');
  console.log('Statistici:', JSON.stringify(stats, null, 1));
}

main();

