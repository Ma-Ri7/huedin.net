/**
 * assets/js/photo.js — pagina individuală a fotografiei.
 *  - deschiderea imaginii în lightbox (zoom);
 *  - navigare cu tastatura către fotografia anterioară/următoare;
 *  - revenirea la rezultate păstrând filtrele (link din HTML).
 */
import { initNav, initLazyImages, createLightbox } from './site.js';

initNav();
initLazyImages();

const figure = document.querySelector('[data-photo-figure]');
if (figure) {
  const full = figure.dataset.full;
  const title = figure.dataset.title || '';
  const caption = figure.dataset.caption || '';
  const lightbox = createLightbox([{ src: full, title, caption }]);

  figure.addEventListener('click', (e) => {
    if (e.target.tagName === 'IMG') {
      e.preventDefault();
      lightbox.open(0);
    }
  });

  figure.addEventListener('keydown', (e) => {
    if ((e.key === 'Enter' || e.key === ' ') && e.target.tagName === 'IMG') {
      e.preventDefault();
      lightbox.open(0);
    }
  });
}

// Navigare cu tastatura între fotografii (când lightbox-ul este închis).
document.addEventListener('keydown', (e) => {
  if (document.querySelector('.lightbox.is-open')) return;
  if (e.target.matches('input, textarea, select')) return;
  if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
  const link = document.querySelector(e.key === 'ArrowLeft' ? '[data-prev]' : '[data-next]');
  if (link && link.href) window.location.href = link.href;
});
