/**
 * tools/local-guard.js — gardă pentru uneltele locale de lucru.
 *
 * Uneltele din `tools/` (editor de coordonate, adăugare fotografii, imagine de header)
 * sunt destinate exclusiv rulării locale. Acest fișier blochează interfața dacă pagina
 * este accesată de pe un domeniu public (ex. huedin.net), ca măsură suplimentară de
 * siguranță — pe lângă faptul că `tools/` este exclus de la publicare.
 *
 * Sunt considerate „locale": localhost, 127.0.0.1, ::1, *.local și intervalele de
 * adrese private (192.168.x.x, 10.x.x.x, 172.16–31.x.x), plus deschiderea prin file://.
 */
(function () {
  'use strict';

  function isLocalHostname(host) {
    const h = String(host || '').toLowerCase();
    if (!h) return true;                                   // file:// nu are hostname
    if (h === 'localhost' || h === '127.0.0.1' || h === '::1' || h === '[::1]') return true;
    if (h.endsWith('.local') || h.endsWith('.localhost')) return true;
    if (/^192\.168\.\d{1,3}\.\d{1,3}$/.test(h)) return true;
    if (/^10\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(h)) return true;
    if (/^172\.(1[6-9]|2\d|3[01])\.\d{1,3}\.\d{1,3}$/.test(h)) return true;
    if (/^169\.254\.\d{1,3}\.\d{1,3}$/.test(h)) return true; // link-local
    return false;
  }

  function isLocal() {
    if (window.location.protocol === 'file:') return true;
    return isLocalHostname(window.location.hostname);
  }

  /** Înlocuiește pagina cu o notificare clară. */
  function block() {
    const style = [
      'min-height:100vh', 'margin:0', 'display:grid', 'place-items:center',
      'background:#0c0b0e', 'color:#f6f3ed', 'text-align:center', 'padding:24px',
      'font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Arial,sans-serif',
      'line-height:1.6'
    ].join(';');
    document.body.innerHTML = '<div style="' + style + '">'
      + '<div style="max-width:34rem">'
      + '<p style="letter-spacing:.26em;text-transform:uppercase;font-size:.72rem;color:#c9a227;margin:0 0 1rem">'
      + 'Huedin.net</p>'
      + '<h1 style="font-family:Georgia,serif;font-weight:600;font-size:1.6rem;margin:0 0 .8rem">'
      + 'Pagina nu este disponibilă public</h1>'
      + '<p style="color:#d5d1c8;margin:0 0 1.4rem">Aceasta este o unealtă de administrare care '
      + 'funcționează doar pe calculatorul autorului. Site-ul public nu conține această secțiune.</p>'
      + '<p><a href="/index.html" style="display:inline-block;padding:.7rem 1.4rem;border-radius:999px;'
      + 'background:linear-gradient(180deg,#e3c05c,#c9a227);color:#17130a;text-decoration:none;font-weight:600">'
      + 'Înapoi la arhivă</a></p>'
      + '</div></div>';
    document.title = 'Pagina nu este disponibilă · Huedin.net';
  }

  window.huedinLocalTool = { isLocal: isLocal, block: block, isLocalHostname: isLocalHostname };
})();
