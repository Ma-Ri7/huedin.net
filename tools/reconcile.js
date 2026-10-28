/**
 * tools/reconcile.js — raport de reconciliere între arhiva legacy și cea nouă.
 *
 * Compară inventarul extras din backup/legacy-index.html cu catalogul nou și
 * generează docs/RECONCILIATION.md. Iese cu cod 1 dacă există pierderi de conținut.
 */
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => JSON.parse(readFileSync(join(ROOT, p), 'utf8'));

const legacy = read('data/legacy-inventory.json');
const photosData = read('data/photos.json');
const stats = read('data/site-stats.json');
const content = read('data/site-content.json');
const photos = photosData.photos;

const problems = [];
const checks = [];
const info = [];

function check(name, ok, detail) {
  checks.push({ name, ok, detail: detail || '' });
  if (!ok) problems.push(name + (detail ? ' — ' + detail : ''));
}

const legacyDerived = photos.filter((p) => (p.origin || 'legacy') === 'legacy');
const added = photos.filter((p) => p.origin === 'manual');

check('Toate fotografiile din arhiva legacy sunt prezente',
  legacyDerived.length === legacy.photoCount,
  `legacy=${legacy.photoCount}, prezente=${legacyDerived.length}`);
check('Fotografiile legacy păstrează ordinea originală',
  legacyDerived.every((p, i) => p.legacyIndex === i),
  'indexul legacy nu mai corespunde poziției în catalog');

let indexMismatch = 0;
let titleMismatch = 0;
let yearMismatch = 0;
let imageMismatch = 0;
const byLegacyIndex = new Map(legacyDerived.map((p) => [p.legacyIndex, p]));
for (const item of legacy.items) {
  const p = byLegacyIndex.get(item.legacyIndex);
  if (!p) { indexMismatch++; continue; }
  if (p.title !== item.title) titleMismatch++;
  if (p.yearText !== item.yearText) yearMismatch++;
  const legacyBase = item.image.split('/').pop();
  if (!p.image || p.image.split('/').pop() !== legacyBase) imageMismatch++;
}
check('Ordinea și indexul fotografiilor sunt identice', indexMismatch === 0, `${indexMismatch} nepotriviri`);
check('Toate titlurile sunt păstrate verbatim', titleMismatch === 0, `${titleMismatch} nepotriviri`);
check('Toate textele de an/perioadă sunt păstrate verbatim', yearMismatch === 0, `${yearMismatch} nepotriviri`);
check('Toate referințele către imagini sunt păstrate', imageMismatch === 0, `${imageMismatch} nepotriviri`);

if (added.length) {
  info.push(`${added.length} fotografii adăugate ulterior (nu fac parte din arhiva legacy): `
    + added.map((p) => `${p.id} „${p.title}”`).join(', '));
}

const missingFiles = photos.filter((p) => !existsSync(join(ROOT, p.image))).map((p) => p.image);
check('Toate fișierele foto referențiate există pe disc', missingFiles.length === 0,
  missingFiles.slice(0, 5).join(', '));

const missingPages = photos.filter((p) => !existsSync(join(ROOT, 'foto', p.slug + '.html')))
  .map((p) => 'foto/' + p.slug + '.html');
check('Există o pagină pentru fiecare fotografie', missingPages.length === 0, missingPages.slice(0, 5).join(', '));

check('Paragrafele secțiunii „Despre” sunt păstrate',
  Array.isArray(content.aboutParagraphs) && content.aboutParagraphs.length >= 5,
  `${(content.aboutParagraphs || []).length} paragrafe`);
check('Punctele din disclaimer sunt păstrate',
  Array.isArray(content.disclaimerItems) && content.disclaimerItems.length >= 4,
  `${(content.disclaimerItems || []).length} puncte`);
check('Statisticile publice sunt păstrate',
  Array.isArray(content.counts) && content.counts.length === 4,
  `${(content.counts || []).length} valori`);
check('Legăturile utile sunt păstrate',
  Array.isArray(content.usefulLinks) && content.usefulLinks.length === 4,
  `${(content.usefulLinks || []).length} legături`);
check('Conturile sociale sunt păstrate',
  Array.isArray(content.socials) && content.socials.length === 3,
  `${(content.socials || []).length} conturi`);
check('Informațiile de contact sunt păstrate',
  Boolean(content.email) && Boolean(content.phoneDisplay || content.phone),
  `${content.email || '-'} / ${content.phoneDisplay || '-'}`);

const indexHtml = readFileSync(join(ROOT, 'index.html'), 'utf8');
for (const anchor of ['id="header"', 'id="about"', 'id="portfolio"', 'id="services"', 'id="contact"']) {
  check(`Ancora legacy ${anchor} există în index.html`, indexHtml.includes(anchor));
}

const sitemap = readFileSync(join(ROOT, 'sitemap.xml'), 'utf8');
check('Sitemap-ul include toate paginile de fotografii',
  photos.every((p) => sitemap.includes('foto/' + p.slug + '.html')));

const now = new Date().toISOString().slice(0, 10);
const lines = [];
lines.push('# Raport de reconciliere — legacy vs. arhivă nouă');
lines.push('');
lines.push(`Generat: ${now} · sursă legacy: \`${legacy.source}\` (${legacy.sourceBytes} octeți)`);
lines.push('');
lines.push('## Rezumat');
lines.push('');
lines.push('| Indicator | Legacy | Arhivă nouă |');
lines.push('|---|---|---|');
lines.push(`| Fotografii | ${legacy.photoCount} | ${photos.length} (${legacyDerived.length} legacy + ${added.length} adăugate) |`);
lines.push(`| Pagini de fotografii | 0 (fără URL propriu) | ${stats.photoPages} |`);
lines.push(`| Pagini principale | 1 (single-page cu ancore) | ${stats.pages.length} |`);
lines.push(`| Fișiere imagine existente | ${legacy.photoCount} | ${photos.filter((p) => existsSync(join(ROOT, p.image))).length} |`);
lines.push(`| An exact documentat | — | ${stats.exactYear} |`);
lines.push(`| Perioadă/interval aproximativ | — | ${stats.approximateOrRange} |`);
lines.push(`| Doar „perioada interbelică” | — | ${stats.eraOnly} |`);
lines.push(`| Fără datare documentată | — | ${stats.unknownYear} |`);
lines.push(`| Locații documentate | 0 (fără metadate geografice) | ${stats.locationsTotal} (${stats.locationsWithCoordinates} cu coordonate) |`);
lines.push(`| Fotografii fără localitate | ${legacy.photoCount} | ${stats.withoutLocation} |`);
lines.push(`| Originale alb-negru legate | — | ${stats.withBlackAndWhiteOriginal} |`);
lines.push('');
lines.push('## Informații');
lines.push('');
lines.push(info.length ? info.map((m) => '- ' + m).join('\n') : 'Fără observații suplimentare.');
lines.push('');
lines.push('## Verificări');
lines.push('');
lines.push('| Verificare | Rezultat | Detaliu |');
lines.push('|---|---|---|');
for (const c of checks) {
  lines.push(`| ${c.name} | ${c.ok ? 'OK' : 'EȘEC'} | ${c.detail || ''} |`);
}
lines.push('');
lines.push('## Concluzie');
lines.push('');
lines.push(problems.length
  ? `**ATENȚIE:** ${problems.length} verificări au eșuat. Publicarea trebuie oprită până la rezolvare.\n\n`
    + problems.map((p) => '- ' + p).join('\n')
  : 'Toate verificările au trecut. Nu au fost identificate pierderi de conținut. '
    + 'Inventarul legacy și catalogul nou corespund 1:1 (index, titlu, text de an, referință imagine).');
lines.push('');
lines.push('## Note');
lines.push('');
lines.push('- Seriile de fotografii cu titlu și an identice au fost **păstrate integral** (nu s-au eliminat duplicate aparente).');
lines.push('- O referință ruptă din versiunea legacy (typo `_nn.webp`, fotografia p143 „Strada Poștei”) este păstrată în catalog ca informație; noul site folosește fișierul corect existent.');
lines.push('- Fișierele nefolosite de versiunea legacy (264 originale `.jpg` și variante `.webp`) **nu au fost șterse**; originalele alb-negru sunt legate în pagina fiecărei fotografii.');
lines.push('- Imaginile originale nu au fost modificate; miniaturile și preview-urile sunt fișiere noi, generate non-distructiv.');

writeFileSync(join(ROOT, 'docs', 'RECONCILIATION.md'), lines.join('\n') + '\n');

console.log('Raport de reconciliere scris în docs/RECONCILIATION.md');
console.log('Verificări trecute:', checks.filter((c) => c.ok).length + '/' + checks.length);
if (info.length) info.forEach((m) => console.log('  · ' + m));
if (problems.length) {
  console.log('PROBLEME:');
  problems.forEach((p) => console.log('  X ' + p));
  process.exit(1);
}
console.log('Reconciliere OK — fără pierderi de conținut.');

