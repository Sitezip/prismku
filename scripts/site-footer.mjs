// One footer for the evergreen pages (/how-to-play/, /printable/, /versions/, 404), so every page links to
// feedback & bugs (ticket #12). build.mjs swaps the <!--SITE-FOOTER--> marker for this markup.
export const MARKER = '<!--SITE-FOOTER-->';
export const LINKS = [
  ['/', 'Play Prismku'], ['/daily/', 'Daily archive'], ['/how-to-play/', 'How to play'], ['/quick-draw/', 'Quick Draw'],
  ['/printable/', 'Printable puzzles'], ['/versions/', 'Version history'], ['/#feedback', 'Feedback & bugs'],
];
export const SITE_FOOTER = `<footer class="site-foot" style="max-width:680px;margin:28px auto 0;padding:14px 16px 30px;border-top:1px solid rgba(255,255,255,.14);color:#b9aedb;font:13px/1.7 system-ui,sans-serif;text-align:center">`
  + `<nav aria-label="Site">${LINKS.map(([h, t]) => `<a href="${h}" style="color:#ffd60a">${t.replace('&', '&amp;')}</a>`).join(' · ')}</nav>`
  + `<div>© 2026 Prismku · Free, no sign-up, no tracking cookies.</div></footer><style>@media print{.site-foot{display:none!important}}</style>`;
export function injectFooter(html) { return html.includes(MARKER) ? html.split(MARKER).join(SITE_FOOTER) : html; }
