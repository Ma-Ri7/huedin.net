/**
 * tools/browser-check.js — verificare în browser real (Chrome headless via puppeteer-core).
 *
 * Pornește un server static local și verifică, la 375 / 768 / 1440 px:
 *  - erori de consolă și erori de pagină;
 *  - cereri eșuate;
 *  - overflow orizontal (design responsive real);
 *  - funcționarea căutării, filtrelor, URL-urilor cu filtre, lightbox-ului;
 *  - încărcarea hărții și a pin-urilor.
 * Salvează capturi în docs/screenshots/.
 *
 * Rulare: node tools/browser-check.js
 */
import { mkdir, writeFile } from 'node:fs/promises';
import { existsSync, readdirSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import puppeteer from 'puppeteer-core';
import { createStaticServer } from './serve.js';
import { matchesFilters } from '../assets/js/search-core.js';

const execFileAsync = promisify(execFile);

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const SHOTS = join(ROOT, 'docs', 'screenshots');
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';

// Numărul total de fotografii este citit din statisticile generate (nu e codificat fix),
// astfel încât testul rămâne valid și după adăugarea de fotografii noi.
const TOTAL_PHOTOS = JSON.parse(readFileSync(join(ROOT, 'data', 'site-stats.json'), 'utf8')).photos;
const TOTAL_RE = new RegExp('\\b' + TOTAL_PHOTOS + '\\b');

const results = [];
function record(name, ok, detail) {
  results.push({ name, ok, detail: detail || '' });
  console.log((ok ? '  OK   ' : '  EȘEC ') + name + (detail ? ' — ' + detail : ''));
}

/** Șterge complet fotografii adăugate de test (catalog, locații, media, fișiere, pagină). */
async function cleanupAddedPhotos(ids) {
  if (!ids.length) return [];
  const pf = join(ROOT, 'data', 'photos.json');
  const lf = join(ROOT, 'data', 'locations.json');
  const mf = join(ROOT, 'data', 'media.json');

  const catalog = JSON.parse(readFileSync(pf, 'utf8'));
  const removed = catalog.photos.filter((p) => ids.includes(p.id));
  catalog.photos = catalog.photos.filter((p) => !ids.includes(p.id));
  catalog.count = catalog.photos.length;
  catalog.manualCount = catalog.photos.filter((p) => p.origin === 'manual').length;
  writeFileSync(pf, JSON.stringify(catalog, null, 1) + '\n');

  const locs = JSON.parse(readFileSync(lf, 'utf8'));
  for (const l of locs.locations) l.photoIds = l.photoIds.filter((id) => !ids.includes(id));
  writeFileSync(lf, JSON.stringify(locs, null, 1) + '\n');

  const media = JSON.parse(readFileSync(mf, 'utf8'));
  for (const id of ids) delete media.variants[id];
  writeFileSync(mf, JSON.stringify(media, null, 1) + '\n');

  for (const p of removed) {
    for (const rel of [p.image, p.originalImage, 'assets/img/thumbs/' + p.id + '.webp',
      'assets/img/previews/' + p.id + '.webp', 'foto/' + p.slug + '.html']) {
      if (rel) rmSync(join(ROOT, rel), { force: true });
    }
  }

  // regenerăm paginile, ca starea site-ului să fie din nou consistentă
  try {
    await execFileAsync(process.execPath, [join(ROOT, 'tools', 'build.js')],
      { cwd: ROOT, maxBuffer: 1024 * 1024 * 16 });
  } catch (e) { /* ignorăm */ }

  return removed.map((p) => p.id);
}

const VIEWPORTS = [
  { name: 'mobile-375', width: 375, height: 812, isMobile: true, deviceScaleFactor: 2 },
  { name: 'tablet-768', width: 768, height: 1024, deviceScaleFactor: 1 },
  { name: 'desktop-1440', width: 1440, height: 900, deviceScaleFactor: 1 }
];

/** Înregistrează erorile de consolă / pagină / cererile eșuate pentru o pagină. */
function attachDiagnostics(page, label, bucket) {
  page.on('console', (msg) => {
    if (msg.type() === 'error') bucket.console.push(label + ': ' + msg.text().slice(0, 300));
  });
  page.on('pageerror', (err) => bucket.pageErrors.push(label + ': ' + String(err.message).slice(0, 300)));
  page.on('requestfailed', (req) => {
    const url = req.url();
    // Tile-urile de hartă depind de rețea; eșecul lor nu blochează site-ul.
    if (url.includes('tile.openstreetmap.org')) return;
    bucket.failed.push(label + ': ' + url.slice(0, 160));
  });
  page.on('response', (res) => {
    if (res.status() >= 400 && !res.url().includes('tile.openstreetmap.org')) {
      bucket.failed.push(label + ': HTTP ' + res.status() + ' ' + res.url().slice(0, 160));
    }
  });
}

async function shot(page, name) {
  await mkdir(SHOTS, { recursive: true });
  await page.screenshot({ path: join(SHOTS, name + '.png') });
}

async function main() {
  if (!existsSync(CHROME)) {
    console.error('Chrome nu a fost găsit la ' + CHROME + ' — testul de browser a fost sărit.');
    process.exit(0);
  }

  // Folosim exact serverul de dezvoltare (tools/serve.js), ca testul să acopere
  // și endpoint-ul de salvare folosit de editorul de coordonate.
  const handle = await createStaticServer({ quiet: true });
  const base = handle.url;
  const bucket = { console: [], pageErrors: [], failed: [] };

  // Helper folosit de teste pentru a scrie/curăța coordonate prin API-ul de dezvoltare.
  const postCoords = (records) => fetch(base + '/api/coords', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ records })
  }).then((r) => r.json());

  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  const browser = await puppeteer.launch({
    executablePath: CHROME,
    headless: true,
    args: ['--no-sandbox', '--disable-dev-shm-usage', '--hide-scrollbars']
  });

  const sample = readdirSync(join(ROOT, 'foto')).filter((f) => f.endsWith('.html')).sort()[0];

  try {
    for (const vp of VIEWPORTS) {
      console.log('\n--- Viewport ' + vp.name + ' (' + vp.width + 'x' + vp.height + ') ---');
      const page = await browser.newPage();
      attachDiagnostics(page, vp.name, bucket);
      await page.setViewport({
        width: vp.width, height: vp.height,
        isMobile: Boolean(vp.isMobile), deviceScaleFactor: vp.deviceScaleFactor || 1
      });

      for (const [label, url, file] of [
        ['index', base + '/index.html', 'index'],
        ['arhiva', base + '/arhiva.html', 'arhiva'],
        ['harta', base + '/harta.html', 'harta'],
        ['despre', base + '/despre.html', 'despre'],
        ['foto', base + '/foto/' + sample, 'foto']
      ]) {
        await page.goto(url, { waitUntil: 'networkidle2', timeout: 45000 });
        await new Promise((r) => setTimeout(r, 350));

        const metrics = await page.evaluate(() => ({
          scrollWidth: document.documentElement.scrollWidth,
          innerWidth: window.innerWidth,
          h1: document.querySelectorAll('h1').length,
          title: document.title,
          cards: document.querySelectorAll('.card').length
        }));

        record(`${vp.name}/${label}: fără overflow orizontal`,
          metrics.scrollWidth <= metrics.innerWidth + 1,
          `scrollWidth=${metrics.scrollWidth}, viewport=${metrics.innerWidth}`);

        record(`${vp.name}/${label}: un singur <h1> și titlu setat`,
          metrics.h1 === 1 && metrics.title.length > 0,
          `h1=${metrics.h1}, title="${metrics.title.slice(0, 60)}"`);

        if (label === 'arhiva') {
          record(`${vp.name}/arhiva: grila afișează fotografii`, metrics.cards > 0, `carduri=${metrics.cards}`);
        }

        if (label === 'index') {
          const heroState = await page.evaluate(() => {
            const img = document.querySelector('.hero__media img');
            return img ? {
              src: img.getAttribute('src'),
              loaded: img.complete && img.naturalWidth > 0,
              natural: img.naturalWidth + '×' + img.naturalHeight,
              caption: (document.querySelector('.hero__caption') || {}).textContent || ''
            } : null;
          });
          record(`${vp.name}/index: imaginea de header se încarcă efectiv`,
            Boolean(heroState) && heroState.loaded,
            heroState ? `${heroState.src} (${heroState.natural})` : 'lipsă');
        }

        if (label === 'harta') {
          const mapState = await page.evaluate(() => ({
            leaflet: typeof window.L !== 'undefined',
            markers: document.querySelectorAll('.leaflet-marker-icon').length,
            fallback: !document.getElementById('map-fallback').hidden,
            panelText: (document.getElementById('map-panel') || {}).textContent || '',
            fallbackText: (document.getElementById('map-fallback') || {}).textContent || ''
          }));
          record(`${vp.name}/harta: Leaflet încărcat`, mapState.leaflet);
          record(`${vp.name}/harta: pin și panou funcționale (sau listă de rezervă)`,
            mapState.markers > 0 || mapState.fallback,
            `pin-uri=${mapState.markers}, fallback=${mapState.fallback}`);
          record(`${vp.name}/harta: mesajele publice nu conțin referințe interne`,
            !/tools\/|coords-editor|npm run/i.test(mapState.fallbackText + mapState.panelText),
            mapState.fallbackText.replace(/\s+/g, ' ').slice(0, 80));
        }

        await shot(page, `${vp.name}-${file}`);
      }

      await page.close();
    }


    /* ---------------- Navigare mobilă (meniul de pe telefon) ---------------- */
    console.log('\n--- Navigare mobilă ---');
    const mobilePage = await browser.newPage();
    attachDiagnostics(mobilePage, 'mobile-nav', bucket);
    await mobilePage.setViewport({ width: 375, height: 812, isMobile: true, deviceScaleFactor: 2 });

    const navPages = [
      ['index', base + '/index.html'],
      ['arhiva', base + '/arhiva.html'],
      ['harta', base + '/harta.html'],
      ['despre', base + '/despre.html'],
      ['foto', base + '/foto/' + sample]
    ];

    for (const [label, url] of navPages) {
      await mobilePage.goto(url, { waitUntil: 'networkidle2' });
      await wait(450);

      const navState = await mobilePage.evaluate(() => {
        const toggle = document.querySelector('.nav-toggle');
        const nav = document.getElementById('site-nav');
        const vis = (el) => { const r = el.getBoundingClientRect(); return r.width > 0 && r.height > 0; };
        return {
          toggleVisible: toggle ? vis(toggle) : false,
          links: nav ? nav.querySelectorAll('a').length : 0,
          closedHeight: nav ? Math.round(nav.getBoundingClientRect().height) : -1
        };
      });
      record(`meniu mobil/${label}: butonul e vizibil, meniul e închis`,
        navState.toggleVisible && navState.links >= 5 && navState.closedHeight <= 2,
        `linkuri=${navState.links}, înălțime închis=${navState.closedHeight}px`);

      await mobilePage.click('.nav-toggle');
      await wait(450);
      const opened = await mobilePage.evaluate(() => {
        const nav = document.getElementById('site-nav');
        const first = nav.querySelector('a');
        const r = first.getBoundingClientRect();
        return {
          open: nav.classList.contains('is-open'),
          height: Math.round(nav.getBoundingClientRect().height),
          linkH: Math.round(r.height),
          linkW: Math.round(r.width),
          expanded: document.querySelector('.nav-toggle').getAttribute('aria-expanded')
        };
      });
      record(`meniu mobil/${label}: se deschide la click și linkurile sunt vizibile`,
        opened.open && opened.height > 120 && opened.linkH > 20 && opened.expanded === 'true',
        `înălțime=${opened.height}px, link=${opened.linkW}×${opened.linkH}px`);

      if (label === 'index') await shot(mobilePage, 'mobil-meniu-deschis');

      await mobilePage.keyboard.press('Escape');
      await wait(320);
      const afterEsc = await mobilePage.evaluate(
        () => document.getElementById('site-nav').classList.contains('is-open'));
      record(`meniu mobil/${label}: se închide cu Escape`, !afterEsc);

      // linkul din meniu chiar navighează
      await mobilePage.click('.nav-toggle');
      await wait(400);
      await mobilePage.click('#site-nav a[href$="arhiva.html"]');
      for (let i = 0; i < 40 && !mobilePage.url().includes('arhiva.html'); i++) await wait(150);
      record(`meniu mobil/${label}: click pe un link navighează`,
        mobilePage.url().includes('arhiva.html'), mobilePage.url().replace(base, ''));
    }
    await mobilePage.close();

    /* ---------------- Teste de interacțiune (desktop) ---------------- */
    console.log('\n--- Interacțiuni (desktop 1440) ---');
    const page = await browser.newPage();
    attachDiagnostics(page, 'interact', bucket);
    await page.setViewport({ width: 1440, height: 900 });

    await page.goto(base + '/arhiva.html', { waitUntil: 'networkidle2' });
    await page.waitForSelector('#grid .card');
    const initial = await page.$$eval('#grid .card', (els) => els.length);
    record('arhivă: pagina 1 afișează 48 de fotografii', initial === 48, `carduri = ${initial}`);

    const totalText = await page.$eval('#count', (el) => el.textContent.trim());
    record('arhivă: numărul total de rezultate este afișat', TOTAL_RE.test(totalText), totalText);

    await page.type('#f-q', 'piata');
    await wait(700);
    const searched = await page.$eval('#count', (el) => el.textContent.trim());
    const searchCards = await page.$$eval('#grid .card', (els) => els.length);
    record('căutare „piata” (fără diacritice) găsește rezultate',
      searchCards > 0 && searchCards < 48, `${searchCards} carduri, ${searched}`);
    record('căutarea este reflectată în URL', page.url().includes('q=piata'), page.url().split('?')[1] || '');

    await page.select('#f-period', '1960-1990');
    await wait(600);
    const combinedUrl = page.url();
    const combined = await page.$$eval('#grid .card', (els) => els.length);
    record('combinarea filtrelor (text + perioadă) funcționează',
      combinedUrl.includes('period=1960-1990') && combined > 0 && combined <= searchCards,
      `${combined} carduri`);

    await page.$eval('#f-q', (el) => { el.value = ''; el.dispatchEvent(new Event('input', { bubbles: true })); });
    await wait(600);
    await page.type('#f-year', '1985');
    await wait(700);
    const yearCards = await page.$$eval('#grid .card', (els) => els.length);
    record('filtru an exact funcționează', yearCards > 0, `${yearCards} carduri pentru 1985`);

    await page.click('#reset');
    await wait(400);
    const afterReset = await page.$eval('#count', (el) => el.textContent.trim());
    record('resetarea filtrelor readuce toate rezultatele',
      TOTAL_RE.test(afterReset) && !page.url().includes('?'), afterReset);

    const pagerVisible = await page.$eval('#pager', (el) => !el.hidden);
    record(`paginarea este disponibilă pentru ${TOTAL_PHOTOS} de rezultate`, pagerVisible);
    await page.click('#pager button[data-page="2"]');
    await wait(500);
    record('navigarea la pagina 2 actualizează URL-ul', page.url().includes('page=2'), page.url().split('?')[1] || '');


    // Lightbox
    await page.goto(base + '/arhiva.html', { waitUntil: 'networkidle2' });
    await page.waitForSelector('#grid .card img');
    await page.click('#grid .card img');
    await wait(400);
    const lbOpen = await page.$eval('.lightbox', (el) => el.classList.contains('is-open'));
    record('lightbox-ul se deschide din grilă', lbOpen);
    await page.keyboard.press('ArrowRight');
    await wait(250);
    const lbTitle = await page.$eval('#lb-title', (el) => el.textContent.trim());
    record('navigarea cu tastatura în lightbox funcționează', lbTitle.length > 0, '„' + lbTitle + '”');
    await page.keyboard.press('Escape');
    await wait(300);
    const lbClosed = await page.$eval('.lightbox', (el) => !el.classList.contains('is-open'));
    record('Escape închide lightbox-ul', lbClosed);

    // Filtre preluate din URL (link partajabil)
    await page.goto(base + '/arhiva.html?q=biserica&period=1900-1930', { waitUntil: 'networkidle2' });
    await page.waitForSelector('#grid .card');
    const fromUrl = await page.evaluate(() => ({
      q: document.getElementById('f-q').value,
      period: document.getElementById('f-period').value,
      cards: document.querySelectorAll('#grid .card').length,
      chips: document.querySelectorAll('#active .tag').length
    }));
    record('filtrele din URL sunt aplicate la încărcare',
      fromUrl.q === 'biserica' && fromUrl.period === '1900-1930' && fromUrl.cards > 0,
      'q=' + fromUrl.q + ', period=' + fromUrl.period + ', carduri=' + fromUrl.cards);
    record('filtrele active sunt afișate ca etichete eliminabile', fromUrl.chips >= 2, fromUrl.chips + ' etichete');

    // Stare fără rezultate
    await page.goto(base + '/arhiva.html?q=zzzxxyyqq', { waitUntil: 'networkidle2' });
    await wait(600);
    const emptyVisible = await page.$eval('#empty', (el) => !el.hidden);
    record('starea „niciun rezultat” este afișată', emptyVisible);

    // Pagina fotografiei
    await page.goto(base + '/foto/' + sample, { waitUntil: 'networkidle2' });
    await wait(400);
    const photoInfo = await page.evaluate(() => ({
      h1: document.querySelector('h1') ? document.querySelector('h1').textContent.trim() : '',
      facts: document.querySelectorAll('.photo__facts li').length,
      hasPrev: Boolean(document.querySelector('[data-prev]')),
      hasBack: Boolean(document.querySelector('a[href="../arhiva.html"]')),
      related: document.querySelectorAll('.related .card').length
    }));
    record('pagina fotografiei are titlu, metadate și buton de revenire',
      photoInfo.h1.length > 0 && photoInfo.facts >= 3 && photoInfo.hasBack,
      'h1="' + photoInfo.h1.slice(0, 40) + '", fapte=' + photoInfo.facts);
    record('pagina fotografiei are navigare și fotografii asociate',
      photoInfo.hasPrev && photoInfo.related > 0, 'asociate=' + photoInfo.related);

    await page.click('[data-photo-figure] img');
    await wait(400);
    const photoLb = await page.$eval('.lightbox', (el) => el.classList.contains('is-open'));
    record('zoom în lightbox din pagina fotografiei', photoLb);
    await page.keyboard.press('Escape');
    await wait(300);

    await page.keyboard.press('ArrowRight');
    await wait(1200);
    record('navigarea cu tastele ← → între fotografii funcționează',
      page.url().includes('/foto/') && page.url() !== base + '/foto/' + sample, page.url().split('/').pop());

    /* ---------------- Editorul de coordonate (unealtă locală) ---------------- */
    console.log('\n--- Editor coordonate ---');

    // Instantaneu al coordonatelor existente, ca să putem curăța exact ce adaugă testul.
    const coordsBefore = new Set(
      JSON.parse(readFileSync(join(ROOT, 'data', 'photos.json'), 'utf8'))
        .photos.filter((p) => typeof p.latitude === 'number').map((p) => p.id)
    );

    await page.goto(base + '/tools/coords-editor.html', { waitUntil: 'networkidle2' });
    await page.waitForSelector('#list li');
    await wait(400);

    // garda pentru unelte locale
    const guard = await page.evaluate(() => {
      if (!window.huedinLocalTool) return { loaded: false };
      return {
        loaded: true,
        localHere: window.huedinLocalTool.isLocal(),
        publicHost: window.huedinLocalTool.isLocalHostname('huedin.net'),
        localhost: window.huedinLocalTool.isLocalHostname('localhost'),
        lan: window.huedinLocalTool.isLocalHostname('192.168.1.42'),
        uiPresent: Boolean(document.getElementById('list'))
      };
    });
    record('gardă: scriptul de protecție este încărcat', guard.loaded);
    record('gardă: uneltele sunt considerate locale pe 127.0.0.1', guard.localHere === true);
    record('gardă: un domeniu public este blocat, iar rețeaua locală este permisă',
      guard.publicHost === false && guard.localhost === true && guard.lan === true,
      `huedin.net=${guard.publicHost}, localhost=${guard.localhost}, 192.168.1.42=${guard.lan}`);
    record('gardă: interfața uneltei este activă local', guard.uiPresent === true);

    const editorInit = await page.evaluate(() => ({
      items: document.querySelectorAll('#list li').length,
      progress: document.getElementById('progress').textContent.trim(),
      leaflet: typeof window.L !== 'undefined'
    }));
    record('editor: încarcă toate fotografiile', editorInit.items === TOTAL_PHOTOS,
      `elemente listă = ${editorInit.items}`);
    record('editor: harta Leaflet este disponibilă', editorInit.leaflet);
    record('editor: afișează progresul', /\d+ \/ \d+/.test(editorInit.progress), editorInit.progress);

    // Selectăm prima fotografie fără coordonate și îi fixăm poziția printr-un click pe hartă.
    // Încercăm mai multe puncte, pentru că un click poate nimeri pin-ul altei fotografii
    // (ceea ce este comportamentul corect al editorului: selectează acea fotografie).
    await page.click('#f-missing');
    await wait(300);
    await page.click('#list li');
    await wait(300);
    const selectedId = await page.$eval('#selection', (el) => {
      const m = /\((p\d+),/.exec(el.textContent);
      return m ? m[1] : '';
    });
    const box = await page.$eval('#map', (m) => {
      const r = m.getBoundingClientRect();
      return { x: r.x, y: r.y, w: r.width, h: r.height };
    });

    let savedCount = 0;
    const spots = [[0.22, 0.2], [0.78, 0.25], [0.28, 0.78], [0.72, 0.72], [0.5, 0.12]];
    for (const [fx, fy] of spots) {
      await page.mouse.click(box.x + box.w * fx, box.y + box.h * fy);
      await wait(400);
      savedCount = await page.evaluate(() => {
        const raw = localStorage.getItem('huedin-coords-editor-v1');
        return raw ? Object.keys(JSON.parse(raw)).length : 0;
      });
      if (savedCount > 0) break;
    }

    const afterClick = await page.evaluate(() => ({
      markers: document.querySelectorAll('.leaflet-marker-icon').length,
      selection: document.getElementById('selection').textContent
    }));
    record('editor: click pe hartă salvează coordonatele',
      savedCount > 0, `fotografie selectată: ${selectedId || '?'}, înregistrări salvate: ${savedCount}`);
    record('editor: pin-ul apare pe hartă', afterClick.markers > 0, `markere = ${afterClick.markers}`);
    record('editor: progresul este salvat local (localStorage)', savedCount > 0,
      `${savedCount} înregistrări`);

    /* --------- Salvare într-un singur click (endpoint-ul tools/serve.js) --------- */
    const saveEnabled = await page.$eval('#saveBtn', (b) => !b.disabled);
    record('editor: butonul „Salvează în catalog” este activ (API disponibil)', saveEnabled);

    if (saveEnabled) {
      await page.click('#saveBtn');
      await wait(1500);

      const catalogAfterSave = JSON.parse(readFileSync(join(ROOT, 'data', 'photos.json'), 'utf8'));
      const savedPhoto = catalogAfterSave.photos.find((p) => p.id === selectedId);
      record('editor: salvarea scrie direct în data/photos.json',
        Boolean(savedPhoto && typeof savedPhoto.latitude === 'number'),
        savedPhoto ? `${savedPhoto.id} -> ${savedPhoto.latitude}, ${savedPhoto.longitude}` : 'niciun rezultat');

      const statusText = await page.$eval('#catalogStatus', (el) => el.textContent.replace(/\s+/g, ' '));
      record('editor: statusul arată câte coordonate sunt în catalog',
        /În catalog/.test(statusText), statusText.slice(0, 80));

      // curățăm TOATE coordonatele adăugate de test (indiferent de fotografia selectată
      // la un moment dat — un click poate nimeri pinul altei fotografii)
      const catalogAfter = JSON.parse(readFileSync(join(ROOT, 'data', 'photos.json'), 'utf8'));
      const added = catalogAfter.photos
        .filter((p) => typeof p.latitude === 'number' && !coordsBefore.has(p.id))
        .map((p) => p.id);
      const cleanupOut = added.length
        ? await postCoords(added.map((id) => ({ id, latitude: '', longitude: '' })))
        : { ok: true };
      const afterCleanup = JSON.parse(readFileSync(join(ROOT, 'data', 'photos.json'), 'utf8'));
      const stillThere = afterCleanup.photos
        .filter((p) => typeof p.latitude === 'number' && !coordsBefore.has(p.id)).map((p) => p.id);
      record('editor: curățarea coordonatelor de test funcționează',
        cleanupOut.ok && stillThere.length === 0,
        `adăugate de test: ${added.join(',') || '(niciuna)'}; rămase: ${stillThere.join(',') || 'niciuna'}`);
    }

    await shot(page, 'tools-coords-editor');

    /* ---------------- Harta: pin-uri pentru fotografii cu coordonate proprii ---------------- */
    console.log('\n--- Harta: pin-uri ---');
    const catalogNow = JSON.parse(readFileSync(join(ROOT, 'data', 'photos.json'), 'utf8'));

    // Reproducem exact scenariul real: o fotografie cu coordonate proprii foarte aproape
    // de pinul de localitate (Huedin). Pinul ei trebuie să apară SEPARAT, nu absorbit
    // într-un grup împreună cu pinul de localitate.
    const target = catalogNow.photos.find((p) => p.locationId === 'huedin') || catalogNow.photos[0];
    const testCoords = { id: target.id, latitude: 46.8701, longitude: 23.0152, certainty: 'exact', source: 'Test automat (pin lângă localitate)' };

    const seeded = await postCoords([testCoords]);
    record('hartă: pregătirea scenariului (coordonate scrise în catalog)', seeded.ok,
      `fotografia ${target.id} „${target.title}”`);

    try {
      await page.goto(base + '/harta.html', { waitUntil: 'networkidle2' });
      await wait(900);
      const mapState2 = await page.evaluate(() => ({
        markers: document.querySelectorAll('.leaflet-marker-icon').length,
        photoPins: document.querySelectorAll('.pin--exact, .pin--approx').length,
        localityPins: document.querySelectorAll('.pin--locality').length,
        legend: document.querySelectorAll('.map-legend li').length
      }));
      record('hartă: există pin-uri afișate', mapState2.markers > 0, `markere = ${mapState2.markers}`);
      record('hartă: pin-ul fotografiei apare separat de pinul de localitate',
        mapState2.photoPins >= 1,
        `pin-uri fotografie = ${mapState2.photoPins}, pin-uri localitate = ${mapState2.localityPins}`);
      record('hartă: legenda este afișată', mapState2.legend >= 4, `${mapState2.legend} intrări`);

      await page.goto(base + '/harta.html?foto=' + encodeURIComponent(target.slug), { waitUntil: 'networkidle2' });
      await wait(900);
      const panelText = await page.$eval('#map-panel', (el) => el.textContent.replace(/\s+/g, ' '));
      record('hartă: linkul ?foto=<slug> afișează fotografia cu coordonate proprii',
        panelText.includes(target.title), panelText.slice(0, 70));

      await page.goto(base + '/foto/' + target.slug + '.html', { waitUntil: 'networkidle2' });
      await wait(300);
      const facts = await page.$eval('.photo__facts', (el) => el.textContent.replace(/\s+/g, ' '));
      record('pagina fotografiei afișează coordonatele și sursa',
        facts.includes('Coordonate') && facts.includes(testCoords.latitude.toFixed(5)),
        facts.slice(0, 90));

      /* --------- Filtre pe hartă (perioadă / an) --------- */
      const expectPeriod = catalogNow.photos.filter((p) => matchesFilters(p, { period: '1960-1990' })).length;
      const expectYear = catalogNow.photos.filter((p) => matchesFilters(p, { year: '1985' })).length;
      const expectRange = catalogNow.photos.filter((p) => matchesFilters(p, { yearFrom: '1900', yearTo: '1930' })).length;

      await page.goto(base + '/harta.html', { waitUntil: 'networkidle2' });
      await wait(900);
      const countAll = await page.$eval('#m-count', (el) => el.textContent.replace(/\s+/g, ' '));
      const pinsAll = await page.$$eval('.leaflet-marker-icon', (els) => els.length);
      record('hartă: filtrul pornește fără restricții',
        countAll.includes(String(catalogNow.photos.length)), countAll);

      await page.select('#m-period', '1960-1990');
      await wait(800);
      const byPeriod = await page.evaluate(() => ({
        count: document.getElementById('m-count').textContent.replace(/\s+/g, ' '),
        pins: document.querySelectorAll('.leaflet-marker-icon').length,
        url: window.location.search,
        chips: document.querySelectorAll('#m-active .tag').length
      }));
      record('hartă: filtrul de perioadă istorică filtrează pinurile',
        byPeriod.count.includes(String(expectPeriod)), byPeriod.count);
      record('hartă: filtrul de perioadă este reflectat în URL',
        byPeriod.url.includes('period=1960-1990'), byPeriod.url);
      record('hartă: filtrul activ este afișat ca etichetă eliminabilă',
        byPeriod.chips >= 1, byPeriod.chips + ' etichete');

      await page.select('#m-period', '');
      await wait(400);
      await page.type('#m-year', '1985');
      await wait(800);
      const byYear = await page.$eval('#m-count', (el) => el.textContent.replace(/\s+/g, ' '));
      record('hartă: filtrul de an exact funcționează',
        byYear.includes(String(expectYear)), byYear + ' (așteptat ' + expectYear + ')');

      await page.click('#m-reset');
      await wait(700);
      const afterReset = await page.$eval('#m-count', (el) => el.textContent.replace(/\s+/g, ' '));
      const pinsAfterReset = await page.$$eval('.leaflet-marker-icon', (els) => els.length);
      record('hartă: resetarea filtrelor readuce toate pinurile',
        afterReset.includes(String(catalogNow.photos.length)) && pinsAfterReset === pinsAll,
        afterReset + ', pin-uri: ' + pinsAfterReset + '/' + pinsAll);

      await page.type('#m-from', '1900');
      await page.type('#m-to', '1930');
      await wait(900);
      const byRange = await page.$eval('#m-count', (el) => el.textContent.replace(/\s+/g, ' '));
      record('hartă: filtrul pe interval de ani funcționează',
        byRange.includes(String(expectRange)), byRange + ' (așteptat ' + expectRange + ')');

      await page.goto(base + '/harta.html?period=1960-1990', { waitUntil: 'networkidle2' });
      await wait(900);
      const fromUrl = await page.evaluate(() => ({
        period: document.getElementById('m-period').value,
        count: document.getElementById('m-count').textContent.replace(/\s+/g, ' ')
      }));
      record('hartă: filtrele din URL sunt aplicate la încărcare',
        fromUrl.period === '1960-1990' && fromUrl.count.includes(String(expectPeriod)),
        'perioadă=' + fromUrl.period + ', ' + fromUrl.count);

      /* --------- Miniaturile din panou (grilă, fără deformare) --------- */
      await page.goto(base + '/harta.html?foto=' + encodeURIComponent(target.slug), { waitUntil: 'networkidle2' });
      await wait(1000);
      const thumb = await page.evaluate(() => {
        const ul = document.querySelector('.map-panel__thumbs');
        const img = document.querySelector('.map-panel__thumbs img');
        if (!img) return null;
        const r = img.getBoundingClientRect();
        const cs = getComputedStyle(img);
        return {
          w: Math.round(r.width), h: Math.round(r.height), ratio: r.width / r.height,
          aspect: cs.aspectRatio, fit: cs.objectFit,
          cols: ul ? getComputedStyle(ul).gridTemplateColumns.split(' ').length : 0
        };
      });
      record('hartă: miniaturile din panou sunt într-o grilă corectă, fără deformare',
        Boolean(thumb) && thumb.ratio > 1.2 && thumb.ratio < 1.5 && thumb.cols >= 2
          && thumb.fit === 'cover',
        thumb ? `${thumb.w}×${thumb.h}px, raport ${thumb.ratio.toFixed(2)}, ${thumb.cols} coloane, fit=${thumb.fit}`
          : 'nu există miniaturi în panou');

      await shot(page, 'harta-panou-grila');

      // și o captură cu un filtru activ, ca să se vadă filtrul pe hartă
      await page.goto(base + '/harta.html?period=1960-1990', { waitUntil: 'networkidle2' });
      await wait(1200);
      await page.evaluate(() => {
        const pin = document.querySelector('.pin--exact, .pin--approx, .pin--cluster, .pin--locality');
        if (pin) pin.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      });
      await wait(1200);
      await shot(page, 'harta-filtru-perioada');

      /* --------- Pagina de adăugare fotografie (upload complet) --------- */
      console.log('\n--- Adăugare fotografie (upload) ---');

      // pregătim o imagine de test, copiind una existentă din arhivă
      const testImagePath = join('/tmp', 'huedin-add-photo-test.webp');
      const sourceImage = catalogNow.photos.find((p) => p.image.endsWith('.webp')).image;
      writeFileSync(testImagePath, readFileSync(join(ROOT, sourceImage)));

      await page.goto(base + '/tools/add-photo.html', { waitUntil: 'networkidle2' });
      await wait(600);
      const addInit = await page.evaluate(() => ({
        api: document.getElementById('apiStatus').textContent,
        submitEnabled: !document.getElementById('submitBtn').disabled,
        periods: document.querySelectorAll('#period option').length,
        locations: document.querySelectorAll('#location option').length,
        hasDrop: Boolean(document.getElementById('drop')),
        leaflet: typeof window.L !== 'undefined'
      }));
      record('adaugă: pagina detectează serverul cu API', /server OK/.test(addInit.api), addInit.api);
      record('adaugă: formularul este complet (perioade, localități, hartă, zonă de upload)',
        addInit.periods > 4 && addInit.locations > 5 && addInit.hasDrop && addInit.leaflet,
        `perioade=${addInit.periods}, localități=${addInit.locations}`);

      const testTitle = 'TEST automat adăugare fotografie';
      await page.$eval('#title', (el, v) => { el.value = v; }, testTitle);
      await page.$eval('#year', (el) => { el.value = 'Anul: 1942'; el.dispatchEvent(new Event('input', { bubbles: true })); });
      await page.select('#period', '1930-1960');
      await page.select('#location', 'huedin');
      await page.$eval('#alt', (el) => { el.value = 'Fotografie de test adăugată automat'; });

      // coordonate, ca să verificăm și pinul pe hartă
      await page.click('#useCoords');
      await wait(300);
      await page.$eval('#lat', (el) => { el.value = '46.8712'; });
      await page.$eval('#lng', (el) => { el.value = '23.0198'; el.dispatchEvent(new Event('change', { bubbles: true })); });
      await wait(300);

      const input = await page.$('#imageFile');
      await input.uploadFile(testImagePath);
      await wait(900);
      const previewOk = await page.$eval('#imagePreview', (el) => !el.hidden && Boolean(el.querySelector('img')));

      await shot(page, 'adauga-fotografie-formular');

      await page.click('#submitBtn');
      await page.waitForFunction(
        () => /adăugată|Nu am putut/.test(document.getElementById('result').textContent),
        { timeout: 60000 }
      );
      await wait(500);
      const addResult = await page.evaluate(() => ({
        ok: document.getElementById('result').classList.contains('ok'),
        text: document.getElementById('result').textContent.replace(/\s+/g, ' ').slice(0, 160),
        links: document.querySelectorAll('#result a.btn').length
      }));
      record('adaugă: previzualizarea imaginii funcționează', previewOk);
      record('adaugă: submitul adaugă fotografia pe site', addResult.ok, addResult.text);
      record('adaugă: rezultatul oferă linkuri către pagină și hartă',
        addResult.links >= 2, addResult.links + ' linkuri');

      // verificăm efectul real în catalog și pe disc
      const catalogAfterAdd = JSON.parse(readFileSync(join(ROOT, 'data', 'photos.json'), 'utf8'));
      const addedPhoto = catalogAfterAdd.photos.find((p) => p.title === testTitle);
      const addedId = addedPhoto ? addedPhoto.id : null;
      const fileOk = addedPhoto
        ? existsSync(join(ROOT, addedPhoto.image))
        : false;
      const thumbOk = addedId ? existsSync(join(ROOT, 'assets/img/thumbs', addedId + '.webp')) : false;
      const pageOk = addedPhoto ? existsSync(join(ROOT, 'foto', addedPhoto.slug + '.html')) : false;
      record('adaugă: imaginea, miniatura și pagina au fost create',
        Boolean(addedPhoto) && fileOk && thumbOk && pageOk,
        addedPhoto ? `${addedPhoto.id} · imagine=${fileOk} · miniatură=${thumbOk} · pagină=${pageOk}` : 'nu a fost găsită în catalog');
      record('adaugă: metadatele (an, perioadă, locație, coordonate) au fost salvate corect',
        Boolean(addedPhoto) && addedPhoto.year === 1942 && addedPhoto.periodId === '1930-1960'
          && addedPhoto.locationId === 'huedin' && addedPhoto.latitude === 46.8712,
        addedPhoto ? `an=${addedPhoto.year}, perioadă=${addedPhoto.periodId}, locație=${addedPhoto.locationId}, lat=${addedPhoto.latitude}` : '-');

      if (addedPhoto) {
        await page.goto(base + '/foto/' + addedPhoto.slug + '.html', { waitUntil: 'networkidle2' });
        await wait(300);
        const newPageText = await page.$eval('.photo__side', (el) => el.textContent.replace(/\s+/g, ' '));
        record('adaugă: pagina fotografiei noi este completă',
          newPageText.includes(testTitle) && newPageText.includes('1942') && newPageText.includes('Huedin'),
          newPageText.slice(0, 90));
      }

      await shot(page, 'adauga-fotografie-rezultat');

      const cleaned = await cleanupAddedPhotos(addedId ? [addedId] : []);
      record('adaugă: curățarea fotografiei de test', cleaned.length === 1,
        cleaned.join(',') || 'nimic de curățat');
      rmSync(testImagePath, { force: true });

      /* --------- Imaginea de header (tools/set-hero.html) --------- */
      console.log('\n--- Imaginea de header ---');

      const configBefore = JSON.parse(readFileSync(join(ROOT, 'data', 'site-config.json'), 'utf8'));
      const heroBefore = configBefore.hero.image;

      // imaginea configurată trebuie să apară efectiv în pagina principală
      const indexHtml = readFileSync(join(ROOT, 'index.html'), 'utf8');
      const heroImgTag = /<div class="hero__media">\s*<img src="([^"]+)"/.exec(indexHtml);
      record('hero: index.html folosește imaginea din data/site-config.json',
        Boolean(heroImgTag) && heroImgTag[1] === heroBefore,
        `config=${heroBefore} · index=${heroImgTag ? heroImgTag[1] : '?'}`);

      await page.goto(base + '/tools/set-hero.html', { waitUntil: 'networkidle2' });
      await wait(900);
      const heroPage = await page.evaluate(() => ({
        api: document.getElementById('apiStatus').textContent,
        current: document.getElementById('heroImage').value,
        currentShown: document.getElementById('current').getAttribute('src'),
        options: document.querySelectorAll('#options .opt').length,
        saveEnabled: !document.getElementById('saveBtn').disabled,
        extrasTab: Boolean(document.getElementById('tab-extras'))
      }));
      record('hero: pagina detectează serverul cu API', /server OK/.test(heroPage.api), heroPage.api);
      record('hero: afișează imaginea curentă', heroPage.current === heroBefore,
        heroPage.current);
      record('hero: lista de imagini este încărcată', heroPage.options > 100,
        `${heroPage.options} opțiuni afișate`);

      // căutare + filă „alte imagini"
      await page.type('#search', 'huedin-1907');
      await wait(400);
      await page.click('#tab-extras');
      await wait(400);
      const extrasFound = await page.evaluate(() => ({
        count: document.querySelectorAll('#options .opt').length,
        first: document.querySelector('#options .opt span')
          ? document.querySelector('#options .opt span').textContent : ''
      }));
      record('hero: căutarea găsește imaginile din assets/img/previews/',
        extrasFound.count >= 1 && /HUEDIN-1907/i.test(extrasFound.first),
        `${extrasFound.count} rezultat(e): ${extrasFound.first}`);

      // salvăm aceeași imagine (test idempotent, fără schimbare de stare)
      await page.click('#options .opt');
      await wait(300);
      await page.click('#saveBtn');
      await page.waitForFunction(
        () => /actualizată|Nu am putut/.test(document.getElementById('status').textContent),
        { timeout: 60000 }
      );
      await wait(400);
      const heroSave = await page.evaluate(() => ({
        ok: document.getElementById('status').classList.contains('ok'),
        text: document.getElementById('status').textContent.replace(/\s+/g, ' ').slice(0, 120)
      }));
      record('hero: salvarea din pagină funcționează', heroSave.ok, heroSave.text);

      const configAfter = JSON.parse(readFileSync(join(ROOT, 'data', 'site-config.json'), 'utf8'));
      record('hero: configurația rămâne neschimbată după test (fără efecte secundare)',
        configAfter.hero.image === heroBefore,
        `înainte=${heroBefore} · după=${configAfter.hero.image}`);

      const indexAfter = readFileSync(join(ROOT, 'index.html'), 'utf8');
      record('hero: index.html regenerat folosește în continuare imaginea configurată',
        indexAfter.includes(heroBefore), heroBefore);
      /* --------- Ștergerea reversibilă (tools/delete-photo.html) --------- */
      console.log('\n--- Ștergerea fotografiilor (coș de reciclare) ---');

      const catalogBefore = JSON.parse(readFileSync(join(ROOT, 'data', 'photos.json'), 'utf8'));
      const lastPhoto = catalogBefore.photos[catalogBefore.photos.length - 1];

      await page.goto(base + '/tools/delete-photo.html', { waitUntil: 'networkidle2' });
      await wait(1500);

      const delPage = await page.evaluate(() => ({
        api: document.getElementById('apiStatus').textContent,
        cards: document.querySelectorAll('#photoGrid .pcard').length,
        legacyBadges: document.querySelectorAll('#photoGrid .badge.legacy').length,
        deleteDisabled: document.getElementById('deleteBtn').disabled,
        trash: document.getElementById('trashList').textContent.trim().slice(0, 60),
        guard: Boolean(window.huedinLocalTool)
      }));
      record('ștergere: pagina detectează serverul cu API',
        /fotografii în arhivă/.test(delPage.api), delPage.api);
      record('ștergere: grila încarcă toate fotografiile din catalog',
        delPage.cards === catalogBefore.count,
        `${delPage.cards} carduri / ${catalogBefore.count} în catalog`);
      record('ștergere: fotografiile din arhiva originală sunt marcate',
        delPage.legacyBadges >= catalogBefore.legacyCount,
        `${delPage.legacyBadges} marcaje (legacy: ${catalogBefore.legacyCount})`);
      record('ștergere: butonul de ștergere este inactiv fără selecție',
        delPage.deleteDisabled === true);
      record('ștergere: coșul de reciclare pornește gol',
        /Coșul este gol/.test(delPage.trash), delPage.trash);

      // căutare
      await page.type('#search', 'biserica');
      await wait(500);
      const delFiltered = await page.evaluate(() => document.querySelectorAll('#photoGrid .pcard').length);
      record('ștergere: căutarea filtrează grila',
        delFiltered > 0 && delFiltered < 30, `${delFiltered} rezultate pentru „biserica"`);

      // filtru „adăugate de mine"
      await page.click('#tab-manual');
      await wait(400);
      const delManual = await page.evaluate(() => ({
        count: document.querySelectorAll('#photoGrid .pcard').length,
        legacy: document.querySelectorAll('#photoGrid .badge.legacy').length
      }));
      record('ștergere: filtrul „adăugate de mine" exclude arhiva originală',
        delManual.legacy === 0, `${delManual.count} carduri, ${delManual.legacy} legacy`);

      // resetăm filtrele
      await page.evaluate(() => {
        const s = document.getElementById('search');
        s.value = '';
        s.dispatchEvent(new Event('input'));
      });
      await page.click('#tab-all');
      await wait(400);

      // selectăm ultima fotografie și deschidem confirmarea
      await page.evaluate((id) => {
        document.querySelector('#photoGrid .pcard[data-id="' + id + '"]').click();
      }, lastPhoto.id);
      await wait(400);
      const delSelected = await page.evaluate(() => ({
        enabled: !document.getElementById('deleteBtn').disabled,
        title: document.querySelector('#selectedCard .sel-title')
          ? document.querySelector('#selectedCard .sel-title').textContent : '',
        label: document.getElementById('deleteBtn').textContent
      }));
      record('ștergere: selectarea unei fotografii activează butonul',
        delSelected.enabled && delSelected.title === lastPhoto.title,
        `„${delSelected.title}" · buton: ${delSelected.label}`);

      await page.click('#deleteBtn');
      await wait(500);
      const delModal = await page.evaluate(() => ({
        open: document.getElementById('modal').classList.contains('show'),
        text: document.getElementById('modalBody').textContent.replace(/\s+/g, ' '),
        confirm: document.getElementById('modalConfirm').textContent
      }));
      record('ștergere: dialogul de confirmare se deschide', delModal.open);
      record('ștergere: dialogul enumeră fișierele care se mută în coș',
        /thumbs/.test(delModal.text) && /previews/.test(delModal.text)
        && delModal.text.includes(lastPhoto.slug + '.html'),
        delModal.text.slice(0, 90));
      record('ștergere: dialogul explică faptul că ștergerea este reversibilă',
        /backup\/deleted/.test(delModal.text) && /Restaurează|restaurată/.test(delModal.text));

      // anulare — nu trebuie să se întâmple nimic
      await page.click('#modalCancel');
      await wait(400);
      const delCancelled = await page.evaluate(() => ({
        open: document.getElementById('modal').classList.contains('show'),
        cards: document.querySelectorAll('#photoGrid .pcard').length
      }));
      record('ștergere: anularea închide dialogul fără să șteargă nimic',
        delCancelled.open === false && delCancelled.cards === catalogBefore.count);

      // ștergere reală (reversibilă) + restaurare, ca starea să rămână neschimbată
      await page.click('#deleteBtn');
      await wait(500);
      await page.click('#modalConfirm');
      await page.waitForFunction(
        () => document.querySelectorAll('#trashList .restore').length > 0,
        { timeout: 240000 }
      );

      const afterDelete = await page.evaluate(() => ({
        cards: document.querySelectorAll('#photoGrid .pcard').length,
        trash: document.querySelectorAll('#trashList .restore').length,
        toast: document.getElementById('toast').textContent.replace(/\s+/g, ' ').slice(0, 120),
        api: document.getElementById('apiStatus').textContent
      }));
      record('ștergere: fotografia dispare din grilă', afterDelete.cards === catalogBefore.count - 1,
        `${afterDelete.cards} carduri (înainte: ${catalogBefore.count})`);
      record('ștergere: fotografia apare în coșul de reciclare', afterDelete.trash === 1,
        afterDelete.toast);
      record('ștergere: mesajul confirmă că fotografia poate fi restaurată',
        /coș/.test(afterDelete.toast) && /restaurată/.test(afterDelete.toast), afterDelete.toast);

      const catalogAfterDelete = JSON.parse(readFileSync(join(ROOT, 'data', 'photos.json'), 'utf8'));
      record('ștergere: catalogul de pe disc este actualizat',
        catalogAfterDelete.count === catalogBefore.count - 1
        && !catalogAfterDelete.photos.some((p) => p.id === lastPhoto.id),
        `count=${catalogAfterDelete.count}`);
      record('ștergere: pagina foto nu mai există pe disc',
        !existsSync(join(ROOT, 'foto', lastPhoto.slug + '.html')));
      record('ștergere: fișierele sunt mutate în coș (nu șterse definitiv)',
        existsSync(join(ROOT, 'backup', 'deleted'))
        && readdirSync(join(ROOT, 'backup', 'deleted')).length > 0,
        `${existsSync(join(ROOT, 'backup', 'deleted')) ? readdirSync(join(ROOT, 'backup', 'deleted')).length : 0} fișiere în coș`);
      record('ștergere: evidența coșului este scrisă',
        existsSync(join(ROOT, 'data', 'deleted-photos.json')));

      await shot(page, 'tools-delete-photo-sters');

      // restaurare din interfață
      await page.click('#trashList .restore');
      await page.waitForFunction(
        () => document.querySelectorAll('#trashList .restore').length === 0,
        { timeout: 240000 }
      );
      await wait(500);

      const afterRestore = await page.evaluate(() => ({
        cards: document.querySelectorAll('#photoGrid .pcard').length,
        trash: document.getElementById('trashList').textContent.replace(/\s+/g, ' ').slice(0, 60),
        toast: document.getElementById('toast').textContent.replace(/\s+/g, ' ').slice(0, 120)
      }));
      record('restaurare: fotografia revine în grilă', afterRestore.cards === catalogBefore.count,
        `${afterRestore.cards} carduri`);
      record('restaurare: coșul este din nou gol', /Coșul este gol/.test(afterRestore.trash),
        afterRestore.toast);

      const catalogAfterRestore = JSON.parse(readFileSync(join(ROOT, 'data', 'photos.json'), 'utf8'));
      record('restaurare: catalogul revine exact la starea inițială',
        catalogAfterRestore.count === catalogBefore.count
        && catalogAfterRestore.photos.some((p) => p.id === lastPhoto.id),
        `count=${catalogAfterRestore.count}`);
      record('restaurare: pagina foto este regenerată',
        existsSync(join(ROOT, 'foto', lastPhoto.slug + '.html')));
      record('restaurare: coșul de pe disc este gol',
        !existsSync(join(ROOT, 'backup', 'deleted'))
        || readdirSync(join(ROOT, 'backup', 'deleted')).length === 0);


    } finally {
      // curățăm, ca starea catalogului să rămână neatinsă
      const cleared = await postCoords([{ id: target.id, latitude: '', longitude: '' }]);
      record('hartă: curățarea coordonatelor de test', cleared.ok,
        cleared.ok ? `rămân ${cleared.summary.withOwn} fotografii cu coordonate` : cleared.error);
    }

    await page.close();
  } finally {
    await browser.close();
    await handle.close();
  }

  /* ---------------- Raport ---------------- */
  const failed = results.filter((r) => !r.ok);
  console.log('\n' + '='.repeat(72));
  console.log('VERIFICARE BROWSER: ' + (results.length - failed.length) + '/' + results.length + ' verificări trecute');
  console.log('Capturi: docs/screenshots/ (' + readdirSync(SHOTS).length + ' fișiere)');
  if (bucket.console.length) {
    console.log('\nErori de consolă (' + bucket.console.length + '):');
    [...new Set(bucket.console)].forEach((m) => console.log('  ! ' + m));
  } else {
    console.log('Erori de consolă: niciuna');
  }
  if (bucket.pageErrors.length) {
    console.log('\nErori de pagină (' + bucket.pageErrors.length + '):');
    [...new Set(bucket.pageErrors)].forEach((m) => console.log('  X ' + m));
  }
  if (bucket.failed.length) {
    console.log('\nCereri eșuate (' + bucket.failed.length + '):');
    [...new Set(bucket.failed)].slice(0, 20).forEach((m) => console.log('  ! ' + m));
  }
  if (failed.length) {
    console.log('\nVerificări eșuate:');
    failed.forEach((f) => console.log('  X ' + f.name + (f.detail ? ' — ' + f.detail : '')));
  }
  console.log('='.repeat(72));

  const report = [
    '# Raport de testare în browser (Chrome headless)',
    '',
    'Generat: ' + new Date().toISOString(),
    '',
    'Verificări: ' + (results.length - failed.length) + '/' + results.length + ' trecute',
    '',
    '| Verificare | Rezultat | Detaliu |',
    '|---|---|---|',
    ...results.map((r) => '| ' + r.name + ' | ' + (r.ok ? 'OK' : 'EȘEC') + ' | ' + r.detail + ' |'),
    '',
    '## Erori de consolă',
    '',
    bucket.console.length ? [...new Set(bucket.console)].map((m) => '- ' + m).join('\n') : 'Niciuna.',
    '',
    '## Cereri eșuate (exclusiv tile-urile de hartă)',
    '',
    bucket.failed.length ? [...new Set(bucket.failed)].map((m) => '- ' + m).join('\n') : 'Niciuna.',
    ''
  ];
  await writeFile(join(ROOT, 'docs', 'BROWSER-REPORT.md'), report.join('\n'));

  process.exit(failed.length || bucket.pageErrors.length ? 1 : 0);
}

main().catch((e) => {
  console.error('Eroare neașteptată:', e);
  process.exit(1);
});

