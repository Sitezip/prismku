// Render images with headless Chrome: node scripts/shot.mjs <html-or-svg-file> <out.png> <w> <h>
import puppeteer from 'puppeteer-core';
const [, , src, out, w, h] = process.argv;
const b = await puppeteer.launch({ executablePath: '/usr/bin/google-chrome', args: ['--no-sandbox'] });
const p = await b.newPage(); await p.setViewport({ width: +w, height: +h });
await p.goto('file://' + src); await new Promise(r => setTimeout(r, 300));
await p.screenshot({ path: out, omitBackground: true }); await b.close();
