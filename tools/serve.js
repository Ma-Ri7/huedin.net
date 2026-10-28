/**
 * tools/serve.js — server static local pentru dezvoltare, cu un singur endpoint:
 *
 *   GET  /api/status   -> starea catalogului (câte fotografii au coordonate)
 *   POST /api/coords   -> salvează coordonatele direct în data/photos.json
 *
 * Endpoint-ul permite editorului vizual (tools/coords-editor.html) să scrie
 * coordonatele într-un singur click, fără export/import manual.
 *
 * Servește fișierele cu `Cache-Control: no-store` pentru HTML/JSON/JS/CSS,
 * ca browserul să vadă imediat modificările (evită răspunsurile 304 învechite).
 *
 * Rulare:  npm run serve          (implicit http://localhost:8000)
 *          PORT=8080 npm run serve
 */
import { createServer as createHttpServer } from 'node:http';
import { readFile, writeFile } from 'node:fs/promises';
import { existsSync, readFileSync, rmSync, writeFileSync, readdirSync } from 'node:fs';
import { join, extname, dirname, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { applyRecords, coordsSummary } from './lib/coords.js';
import { buildEntry, appendPhoto, safeFileName } from './lib/photos.js';
import { generateVariants, ensurePreview } from './lib/thumbs.js';
import { loadSiteConfig, saveSiteConfig, resolveHero } from './lib/site-config.js';

const execFileAsync = promisify(execFile);
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const PHOTOS_FILE = join(ROOT, 'data', 'photos.json');

/** Regenerează paginile statice după salvarea coordonatelor (sitemap, pagini foto etc.). */
async function rebuildSite() {
  try {
    const { stdout } = await execFileAsync(process.execPath, [join(ROOT, 'tools', 'build.js')],
      { cwd: ROOT, maxBuffer: 1024 * 1024 * 16 });
    const m = /foto\/\*\.html:\s*(\d+)/.exec(stdout);
    return { ok: true, pages: m ? Number(m[1]) : null };
  } catch (e) {
    return { ok: false, error: String(e.message || e).slice(0, 300) };
  }
}

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.webp': 'image/webp',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.xml': 'application/xml; charset=utf-8',
  '.txt': 'text/plain; charset=utf-8',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.eot': 'application/vnd.ms-fontobject',
  '.map': 'application/json; charset=utf-8'
};

/** Fișierele care trebuie servite mereu proaspete (fără 304 învechit). */
const NO_STORE = new Set(['.html', '.json', '.js', '.css', '.xml', '.txt']);

function json(res, status, payload) {
  const body = JSON.stringify(payload, null, 1);
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    'Content-Length': Buffer.byteLength(body)
  });
  res.end(body);
}

function readBody(req, limit) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on('data', (c) => {
      size += c.length;
      if (size > (limit || 8 * 1024 * 1024)) {
        reject(new Error('corpul cererii este prea mare'));
        req.destroy();
        return;
      }
      chunks.push(c);
    });
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    req.on('error', reject);
  });
}

function loadCatalog() {
  return JSON.parse(readFileSync(PHOTOS_FILE, 'utf8'));
}

export function createStaticServer(options) {
  const root = (options && options.root) || ROOT;
  const quiet = Boolean(options && options.quiet);

  const server = createHttpServer(async (req, res) => {
    const url = new URL(req.url, 'http://localhost');
    const pathname = decodeURIComponent(url.pathname);

    /* ---------------------------- API ---------------------------- */
    if (pathname === '/api/status') {
      const data = loadCatalog();
      json(res, 200, {
        ok: true,
        server: 'huedin-net-dev',
        photosFile: 'data/photos.json',
        summary: coordsSummary(data.photos)
      });
      return;
    }

    if (pathname === '/api/coords') {
      if (req.method !== 'POST') {
        json(res, 405, { ok: false, error: 'folosiți POST' });
        return;
      }
      try {
        const raw = await readBody(req);
        const parsed = JSON.parse(raw || '{}');
        const records = Array.isArray(parsed) ? parsed : (parsed.records || []);
        if (!records.length) {
          json(res, 400, { ok: false, error: 'nicio coordonată de salvat' });
          return;
        }

        const data = loadCatalog();
        const result = applyRecords(data.photos, records, {
          allowNoSource: Boolean(parsed.allowNoSource)
        });

        if (result.updated === 0 && result.cleared === 0) {
          json(res, 400, { ok: false, error: 'nicio modificare aplicată', problems: result.problems });
          return;
        }

        data.count = data.photos.length;
        await writeFile(PHOTOS_FILE, JSON.stringify(data, null, 1) + '\n');

        // regenerăm paginile statice, ca paginile fotografiilor să afișeze coordonatele
        let rebuild = { ok: false, skipped: true };
        if (parsed.rebuild !== false) {
          rebuild = await rebuildSite();
        }

        if (!quiet) {
          console.log(`  salvat: ${result.updated} coordonate actualizate, `
            + `${result.cleared} șterse`
            + (result.problems.length ? `, ${result.problems.length} probleme` : '')
            + (rebuild.ok ? `; regenerat ${rebuild.pages || '?'} pagini` : ''));
        }

        json(res, 200, {
          ok: true,
          updated: result.updated,
          cleared: result.cleared,
          problems: result.problems,
          rebuild,
          summary: coordsSummary(data.photos)
        });
      } catch (e) {
        json(res, 500, { ok: false, error: String(e.message || e) });
      }
      return;
    }

    /* ------------------- GET /api/hero/options (imagini disponibile) ------------------- */
    if (pathname === '/api/hero/options') {
      const catalog = loadCatalog();
      const ids = new Set(catalog.photos.map((p) => p.id));
      const photos = catalog.photos.map((p) => ({
        id: p.id,
        slug: p.slug,
        title: p.title,
        yearLabel: p.yearLabel,
        image: p.image,
        thumb: existsSync(join(root, 'assets/img/thumbs', p.id + '.webp'))
          ? 'assets/img/thumbs/' + p.id + '.webp'
          : p.image
      }));

      // imagini din previews care nu corespund unei fotografii din catalog
      const previewsDir = join(root, 'assets/img/previews');
      const extras = existsSync(previewsDir)
        ? readdirSync(previewsDir)
          .filter((f) => /\.(webp|jpg|jpeg|png)$/i.test(f))
          .filter((f) => !ids.has(f.replace(/\.[^.]+$/, '')))
          .map((f) => ({ path: 'assets/img/previews/' + f, name: f, thumb: 'assets/img/previews/' + f }))
        : [];

      json(res, 200, { ok: true, photos, extras });
      return;
    }

    /* ------------------- GET /api/hero (imaginea de header curentă) ------------------- */
    if (pathname === '/api/hero' && req.method === 'GET') {
      const catalog = loadCatalog();
      const config = loadSiteConfig(root);
      const hero = resolveHero(config, catalog.photos, catalog.photos[0]);
      json(res, 200, { ok: true, config: config.hero, hero: { image: hero.image, title: hero.title, yearLabel: hero.yearLabel } });
      return;
    }

    /* ------------------- POST /api/hero (setează imaginea de header) ------------------- */
    if (pathname === '/api/hero' && req.method === 'POST') {
      try {
        const raw = await readBody(req);
        const body = JSON.parse(raw || '{}');
        const catalog = loadCatalog();
        const config = loadSiteConfig(root);

        let image = body.image ? String(body.image).trim() : null;
        const photoSlug = body.photoSlug ? String(body.photoSlug).trim() : null;

        if (photoSlug) {
          const photo = catalog.photos.find((p) => p.slug === photoSlug || p.id === photoSlug);
          if (!photo) { json(res, 400, { ok: false, error: 'fotografia nu există: ' + photoSlug }); return; }
          image = photo.image;
        }

        if (!image) { json(res, 400, { ok: false, error: 'indicați o imagine sau o fotografie din arhivă' }); return; }

        const normalized = image.replace(/^\/+/, '').replace(/^\.\//, '');
        if (!/^assets\/img\//.test(normalized)) {
          json(res, 400, { ok: false, error: 'calea imaginii trebuie să înceapă cu assets/img/' });
          return;
        }
        if (!existsSync(join(root, normalized))) {
          json(res, 400, { ok: false, error: 'fișierul nu există: ' + normalized });
          return;
        }

        // dacă imaginea nu e deja un preview, generăm unul (încărcare rapidă în hero)
        let preview = null;
        if (!normalized.startsWith('assets/img/previews/')) {
          try {
            preview = await ensurePreview(normalized, { root });
          } catch (e) {
            preview = { error: String(e.message || e).slice(0, 200) };
          }
        }

        config.hero = {
          image: normalized,
          photoSlug: photoSlug || null,
          title: body.title !== undefined ? String(body.title) : '',
          yearLabel: body.yearLabel !== undefined ? String(body.yearLabel) : '',
          alt: body.alt !== undefined ? String(body.alt) : ''
        };
        saveSiteConfig(root, config);

        let rebuild = { ok: false };
        if (body.rebuild !== false) rebuild = await rebuildSite();

        const hero = resolveHero(config, catalog.photos, catalog.photos[0]);
        if (!quiet) {
          console.log('  imagine de header: ' + normalized + (rebuild.ok ? ' (site regenerat)' : ''));
        }

        json(res, 200, {
          ok: true,
          hero: { image: hero.image, title: hero.title, yearLabel: hero.yearLabel, alt: hero.alt },
          preview,
          rebuild
        });
      } catch (e) {
        json(res, 400, { ok: false, error: String(e.message || e) });
      }
      return;
    }

    /* ------------------- POST /api/photos (fotografie nouă) ------------------- */
    if (pathname === '/api/photos') {
      if (req.method !== 'POST') {
        json(res, 405, { ok: false, error: 'folosiți POST' });
        return;
      }
      const written = [];
      try {
        const raw = await readBody(req, 64 * 1024 * 1024);
        const body = JSON.parse(raw || '{}');

        if (!body.image || !body.image.dataUrl) {
          json(res, 400, { ok: false, error: 'lipsește imaginea' });
          return;
        }

        const catalog = loadCatalog();
        const locationsData = JSON.parse(readFileSync(join(ROOT, 'data', 'locations.json'), 'utf8'));
        const periods = JSON.parse(readFileSync(join(ROOT, 'data', 'periods.json'), 'utf8')).periods;

        // decodificăm imaginea (data URL base64)
        const decode = (file) => {
          const m = /^data:([^;,]+)?(;base64)?,(.*)$/s.exec(file.dataUrl || '');
          if (!m) throw new Error('format de imagine necunoscut');
          if (!m[2]) throw new Error('imaginea trebuie trimisă în format base64');
          return Buffer.from(m[3], 'base64');
        };

        const imageBuffer = decode(body.image);
        if (imageBuffer.length === 0) throw new Error('imaginea este goală');
        if (imageBuffer.length > 40 * 1024 * 1024) throw new Error('imaginea este prea mare (max 40 MB)');

        // nume de fișier sigur, unic
        const parsedYear = String(body.year || '').trim();
        const imageName = safeFileName(body.title, parsedYear.replace(/^[^:]*:\s*/, ''), body.image.name, catalog.photos, ROOT);
        const imageRel = 'assets/img/portfolio/' + imageName;
        writeFileSync(join(ROOT, imageRel), imageBuffer);
        written.push(imageRel);

        let originalRel = null;
        if (body.original && body.original.dataUrl) {
          const buf = decode(body.original);
          const ext = extname(body.original.name || '').toLowerCase() || '.jpg';
          const stem = imageName.replace(/\.[^.]+$/, '');
          originalRel = 'assets/img/portfolio/' + stem + (ext === '.webp' ? '.jpg' : ext);
          writeFileSync(join(ROOT, originalRel), buf);
          written.push(originalRel);
        }

        // înregistrarea în catalog
        const entry = buildEntry({
          photos: catalog.photos,
          locations: locationsData.locations,
          periods,
          input: {
            title: body.title,
            image: imageRel,
            originalImage: originalRel,
            year: body.year,
            alt: body.alt,
            period: body.period,
            locationId: body.locationId,
            latitude: body.latitude,
            longitude: body.longitude,
            certainty: body.certainty,
            coordinateSource: body.coordinateSource,
            description: body.description,
            source: body.source,
            credits: body.credits,
            tags: body.tags
          }
        });

        appendPhoto(catalog, locationsData, entry);
        writeFileSync(PHOTOS_FILE, JSON.stringify(catalog, null, 1) + '\n');
        writeFileSync(join(ROOT, 'data', 'locations.json'), JSON.stringify(locationsData, null, 1) + '\n');

        // miniatură + preview pentru fotografia nouă
        let thumbs = { generated: 0, reused: 0, missing: [] };
        try {
          thumbs = await generateVariants([entry], { root: ROOT });
        } catch (e) {
          thumbs = { error: String(e.message || e).slice(0, 200) };
        }

        // regenerăm site-ul (pagina fotografiei, sitemap, statistici)
        let rebuild = { ok: false };
        if (body.rebuild !== false) rebuild = await rebuildSite();

        if (!quiet) {
          console.log(`  fotografie nouă: ${entry.id} „${entry.title}” -> ${entry.slug}`
            + (rebuild.ok ? ' (site regenerat)' : ''));
        }

        json(res, 200, {
          ok: true,
          photo: entry,
          pageUrl: '/foto/' + entry.slug + '.html',
          mapUrl: entry.latitude !== null ? '/harta.html?foto=' + encodeURIComponent(entry.slug) : null,
          thumbs,
          rebuild
        });
      } catch (e) {
        // curățăm fișierele scrise dacă înregistrarea a eșuat
        for (const rel of written) {
          try { rmSync(join(ROOT, rel), { force: true }); } catch (err) { /* ignorăm */ }
        }
        json(res, 400, { ok: false, error: String(e.message || e) });
      }
      return;
    }

    /* --------------------------- static --------------------------- */
    if (req.method !== 'GET' && req.method !== 'HEAD') {
      res.writeHead(405, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('405');
      return;
    }

    const rel = pathname === '/' ? '/index.html' : pathname;
    const abs = normalize(join(root, rel));
    if (!abs.startsWith(root) || !existsSync(abs)) {
      const notFound = join(root, '404.html');
      if (existsSync(notFound)) {
        const body = await readFile(notFound);
        res.writeHead(404, { 'Content-Type': MIME['.html'], 'Cache-Control': 'no-store' });
        res.end(body);
      } else {
        res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
        res.end('404');
      }
      return;
    }

    const ext = extname(abs).toLowerCase();
    const headers = {
      'Content-Type': MIME[ext] || 'application/octet-stream',
      'Cache-Control': NO_STORE.has(ext) ? 'no-store' : 'public, max-age=3600'
    };
    const body = await readFile(abs);
    headers['Content-Length'] = body.length;
    res.writeHead(200, headers);
    res.end(req.method === 'HEAD' ? undefined : body);

    if (!quiet) {
      const t = new Date().toTimeString().slice(0, 8);
      console.log(`[${t}] ${req.method} ${pathname}`);
    }
  });

  return new Promise((resolve) => {
    const port = (options && options.port) || 0;
    server.listen(port, '127.0.0.1', () => {
      resolve({
        server,
        port: server.address().port,
        url: 'http://localhost:' + server.address().port,
        close: () => new Promise((r) => server.close(r))
      });
    });
  });
}


/* --------------------------- pornire directă --------------------------- */
const invokedDirectly = process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1];

if (invokedDirectly) {
  const port = Number(process.env.PORT || 8000);
  const handle = await createStaticServer({ port });
  const summary = coordsSummary(loadCatalog().photos);

  console.log('');
  console.log('  Huedin.net — server local de dezvoltare');
  console.log('  ' + '-'.repeat(58));
  console.log('  Site:           ' + handle.url);
  console.log('  Arhivă:         ' + handle.url + '/arhiva.html');
  console.log('  Hartă:          ' + handle.url + '/harta.html');
  console.log('  Editor coord.:  ' + handle.url + '/tools/coords-editor.html');
  console.log('  ' + '-'.repeat(58));
  console.log('  Fotografii: ' + summary.total
    + ' | cu coordonate: ' + summary.withOwn
    + ' | fără coordonate: ' + summary.withoutOwn);
  console.log('  Editorul salvează direct în data/photos.json (butonul „Salvează în catalog”).');
  console.log('  HTML/JSON sunt servite fără cache, deci modificările se văd imediat.');
  console.log('  Oprire: Ctrl+C');
  console.log('');
}

