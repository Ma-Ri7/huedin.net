/**
 * tools/thumbs.js — generează miniaturi și preview-uri pentru toate fotografiile.
 *
 * Logica este în tools/lib/thumbs.js (folosită și de serverul de dezvoltare).
 * Nu modifică niciodată imaginile originale. Idempotent; folosiți --force
 * pentru regenerare completă.
 */
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { generateVariants } from './lib/thumbs.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const data = JSON.parse(readFileSync(join(ROOT, 'data', 'photos.json'), 'utf8'));

const result = await generateVariants(data.photos, {
  root: ROOT,
  force: process.argv.includes('--force')
});

if (result.missing.length) {
  console.warn('Fotografii fără fișier sursă:', result.missing.join(', '));
}
console.log('Miniaturi generate:', result.generated, '| reutilizate:', result.reused,
  '| fotografii:', data.photos.length);
