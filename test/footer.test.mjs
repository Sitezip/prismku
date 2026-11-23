// Ticket #12: every page needs a way to report bugs. Static check of sources + the shared footer.
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { MARKER, SITE_FOOTER, LINKS, injectFooter } from '../scripts/site-footer.mjs';
assert.ok(SITE_FOOTER.includes('href="/#feedback"') && SITE_FOOTER.includes('Feedback &amp; bugs'));
for (const [h] of LINKS) assert.ok(SITE_FOOTER.includes(`href="${h}"`), h);
assert.equal(injectFooter(`<p>x</p>${MARKER}`), `<p>x</p>${SITE_FOOTER}`);
assert.equal(injectFooter('<p>none</p>'), '<p>none</p>');
for (const f of readdirSync('pages').filter(f => f.endsWith('.html'))) assert.ok(readFileSync('pages/' + f, 'utf8').includes(MARKER), `pages/${f} has the site footer`);
assert.ok(readFileSync('client/404.html', 'utf8').includes(MARKER), '404 has the site footer');
assert.ok(readFileSync('scripts/build.mjs', 'utf8').includes(MARKER), '/versions/ has the site footer');
const qd = readFileSync('client/quick-draw/index.html', 'utf8').match(/<footer[\s\S]*?<\/footer>/)[0];
assert.ok(qd.includes('href="../#feedback"'), 'Quick Draw footer links to feedback');
const main = readFileSync('client/index.html', 'utf8').match(/<footer[\s\S]*?<\/footer>/)[0];
assert.ok(main.includes('data-act="feedback"'), 'home footer links to feedback');
console.log('footer tests ok');
