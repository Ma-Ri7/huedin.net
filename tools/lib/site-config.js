/**
 * tools/lib/site-config.js — configurația editorială a site-ului
 * (`data/site-config.json`), citită de tools/build.js.
 *
 * Momentan conține imaginea de header (hero) a paginii principale. Fiind un fișier
 * de configurare (nu generat), modificările NU se pierd la `npm run build`.
 */
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join, basename } from 'node:path';

export const CONFIG_REL = 'data/site-config.json';

export const DEFAULT_CONFIG = {
  note: 'Configurație editorială. Modificările aici nu sunt suprascrise de build.',
  hero: {
    image: null,        // cale către imaginea de header (ex. assets/img/previews/HUEDIN-1907.webp)
    photoSlug: null,    // opțional: preia titlul/anul dintr-o fotografie din arhivă
    title: '',          // opțional: titlul afișat în legenda imaginii
    yearLabel: '',      // opțional: anul/perioada afișată în legendă
    alt: ''             // opțional: text alternativ (accesibilitate)
  }
};

export function loadSiteConfig(root) {
  const file = join(root, CONFIG_REL);
  if (!existsSync(file)) return JSON.parse(JSON.stringify(DEFAULT_CONFIG));
  try {
    const parsed = JSON.parse(readFileSync(file, 'utf8'));
    return {
      ...DEFAULT_CONFIG,
      ...parsed,
      hero: { ...DEFAULT_CONFIG.hero, ...(parsed.hero || {}) }
    };
  } catch (e) {
    console.warn('data/site-config.json nu a putut fi citit (' + e.message + '); se folosesc valorile implicite.');
    return JSON.parse(JSON.stringify(DEFAULT_CONFIG));
  }
}

export function saveSiteConfig(root, config) {
  writeFileSync(join(root, CONFIG_REL), JSON.stringify(config, null, 1) + '\n');
}

/**
 * Determină imaginea de header și legenda ei.
 * Prioritate: `hero.image` → fotografie din arhivă (`hero.photoSlug`) → implicit (prima fotografie).
 */
export function resolveHero(config, photos, fallbackPhoto) {
  const hero = (config && config.hero) || {};
  let photo = null;

  if (hero.photoSlug) {
    photo = photos.find((p) => p.slug === hero.photoSlug || p.id === hero.photoSlug) || null;
  }

  let image = hero.image || null;
  if (!image && photo) image = photo.image;
  if (!image && fallbackPhoto) {
    image = fallbackPhoto.image;
    photo = photo || fallbackPhoto;
  }

  const title = hero.title || (photo ? photo.title : '');
  const yearLabel = hero.yearLabel || (photo ? photo.yearLabel : '');
  const alt = hero.alt || (photo ? (photo.alt || photo.title) : '') || 'Fotografie istorică din Huedin';

  return {
    image,
    preview: image ? 'assets/img/previews/' + basename(image) : null,
    title,
    yearLabel,
    alt,
    photo
  };
}

/** Eticheta completă din colțul imaginii de header. */
export function heroCaption(hero) {
  const parts = [hero.title, hero.yearLabel].filter(Boolean);
  return parts.length
    ? parts.join(' · ') + ' — fotografie din colecția arhivei, colorizată.'
    : 'Fotografie din colecția arhivei, colorizată.';
}
