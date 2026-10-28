/**
 * assets/js/data.js — încărcare catalog static (fără backend).
 * Fișierele JSON sunt statice; rezultatele sunt cache-uite în memorie.
 */

export const DATA = {
  photos: 'data/photos.json',
  locations: 'data/locations.json',
  periods: 'data/periods.json',
  content: 'data/site-content.json',
  media: 'data/media.json'
};

const cache = new Map();

export async function loadJSON(path) {
  if (cache.has(path)) return cache.get(path);
  const promise = fetch(path, { credentials: 'same-origin' })
    .then((res) => {
      if (!res.ok) throw new Error('Nu pot încărca ' + path + ' (' + res.status + ')');
      return res.json();
    });
  cache.set(path, promise);
  return promise;
}

/** Încarcă tot catalogul necesar paginilor de arhivă/hartă. */
export async function loadCatalog() {
  const [photos, locations, periods, media] = await Promise.all([
    loadJSON(DATA.photos),
    loadJSON(DATA.locations),
    loadJSON(DATA.periods),
    loadJSON(DATA.media)
  ]);

  const locationById = new Map(locations.locations.map((l) => [l.id, l]));
  const enriched = photos.photos.map((p) => {
    const loc = p.locationId ? locationById.get(p.locationId) : null;
    return Object.assign({}, p, {
      locationName: loc ? loc.name : null,
      variants: media.variants[p.id] || null
    });
  });

  return {
    photos: enriched,
    locations: locations.locations,
    periods: periods.periods,
    eras: periods.eras,
    variants: media.variants
  };
}

/** Varianta de afișare (miniatură) sau imaginea originală, dacă lipsește. */
export function thumbOf(photo) {
  return (photo.variants && photo.variants.thumb && photo.variants.thumb.path) || photo.image;
}

export function previewOf(photo) {
  return (photo.variants && photo.variants.preview && photo.variants.preview.path) || photo.image;
}

/** Dimensiunile afișate, pentru width/height explicite (fără layout shift). */
export function thumbSize(photo) {
  const t = photo.variants && photo.variants.thumb;
  if (t) return { width: t.width, height: t.height };
  const s = photo.variants && photo.variants.sourceSize;
  return s || { width: 600, height: 400 };
}

/** Pagina publică a unei fotografii. */
export function photoHref(photo) {
  return 'foto/' + photo.slug + '.html';
}
