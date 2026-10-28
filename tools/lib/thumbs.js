/**
 * tools/lib/thumbs.js — generare non-distructivă de miniaturi și preview-uri.
 *
 * Nu modifică niciodată imaginile originale. Scrie fișiere noi în:
 *   assets/img/thumbs/<id>.webp    (max 600px, pentru grile)
 *   assets/img/previews/<id>.webp  (max 1400px, pentru paginile fotografiilor)
 * și actualizează `data/media.json`.
 *
 * Folosit de tools/thumbs.js (toate fotografiile) și de tools/serve.js
 * (o singură fotografie nouă, imediat după încărcare).
 */
import { readFileSync, writeFileSync, mkdirSync, existsSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

export const SIZES = [
  { key: 'thumb', dir: 'thumbs', rel: 'assets/img/thumbs', max: 600, quality: 74 },
  { key: 'preview', dir: 'previews', rel: 'assets/img/previews', max: 1400, quality: 78 }
];

async function identify(file) {
  const { stdout } = await execFileAsync('magick', ['identify', '-format', '%w %h', file]);
  const [w, h] = stdout.trim().split(/\s+/).map(Number);
  return { width: w, height: h };
}

async function makeVariant(srcAbs, outAbs, max, quality, force) {
  if (!force && existsSync(outAbs) && statSync(outAbs).mtimeMs >= statSync(srcAbs).mtimeMs) {
    return identify(outAbs);
  }
  await execFileAsync('magick', [
    srcAbs,
    '-auto-orient',
    '-resize', max + 'x' + max + '>',
    '-strip',
    '-quality', String(quality),
    '-define', 'webp:method=4',
    outAbs
  ], { maxBuffer: 1024 * 1024 * 32 });
  return identify(outAbs);
}

/**
 * Generează variantele pentru lista de fotografii dată și actualizează media.json.
 * @returns {{generated:number, reused:number, missing:string[], media:object}}
 */
export async function generateVariants(photos, options) {
  const opts = options || {};
  const root = opts.root;
  const force = Boolean(opts.force);
  const concurrency = opts.concurrency || 6;

  for (const s of SIZES) mkdirSync(join(root, s.rel), { recursive: true });

  const mediaFile = join(root, 'data', 'media.json');
  let mediaData = { note: 'Dimensiuni și căi pentru miniaturi/preview-uri generate. Originalele nu sunt modificate.', variants: {} };
  if (existsSync(mediaFile)) {
    try { mediaData = JSON.parse(readFileSync(mediaFile, 'utf8')); } catch (e) { /* se regenerează */ }
  }
  if (!mediaData.variants) mediaData.variants = {};

  const queue = photos.slice();
  const missing = [];
  let generated = 0;
  let reused = 0;

  async function worker() {
    while (queue.length) {
      const photo = queue.shift();
      const srcAbs = join(root, photo.image);
      if (!existsSync(srcAbs)) { missing.push(photo.id + ' (' + photo.image + ')'); continue; }

      const entry = { source: photo.image, sourceSize: await identify(srcAbs) };
      for (const s of SIZES) {
        const outAbs = join(root, s.rel, photo.id + '.webp');
        const existed = existsSync(outAbs);
        const size = await makeVariant(srcAbs, outAbs, s.max, s.quality, force);
        entry[s.key] = { path: s.rel + '/' + photo.id + '.webp', ...size };
        if (existed && !force) reused++; else generated++;
      }
      mediaData.variants[photo.id] = entry;
    }
  }

  await Promise.all(new Array(Math.min(concurrency, queue.length)).fill(0).map(worker));

  writeFileSync(mediaFile, JSON.stringify(mediaData, null, 1) + '\n');
  return { generated, reused, missing, media: mediaData };
}

/**
 * Asigură un preview pentru o imagine folosită în afara catalogului
 * (ex. imaginea de header): `assets/img/previews/<nume>.webp`.
 * Nu suprascrie un fișier existent mai nou decât sursa.
 * @returns {{path:string, width:number, height:number, reused:boolean}|null}
 */
export async function ensurePreview(imageRel, options) {
  const opts = options || {};
  const root = opts.root;
  const max = opts.max || 1800;
  const quality = opts.quality || 82;
  const srcAbs = join(root, imageRel);
  if (!existsSync(srcAbs)) return null;

  const name = imageRel.split('/').pop().replace(/\.[^.]+$/, '') + '.webp';
  const outRel = 'assets/img/previews/' + name;
  const outAbs = join(root, outRel);
  mkdirSync(join(root, 'assets/img/previews'), { recursive: true });

  // dacă sursa este deja în previews, nu facem nimic
  if (imageRel === outRel) {
    const size = await identify(srcAbs);
    return { path: outRel, ...size, reused: true };
  }

  const reused = !opts.force && existsSync(outAbs) && statSync(outAbs).mtimeMs >= statSync(srcAbs).mtimeMs;
  const size = await makeVariant(srcAbs, outAbs, max, quality, Boolean(opts.force));
  return { path: outRel, ...size, reused };
}

