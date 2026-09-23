// verify-current.cjs — gate for the IIFE-encapsulated ms-pacman-web build.
const path = require('path'), fs = require('fs'), http = require('http');
const { chromium } = require('/Users/davidpence/.hermes/node/lib/node_modules/playwright');
const ROOT = '/Users/davidpence/ms-pacman-web', PORT = 4197;
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.png': 'image/png', '.css': 'text/css' };
const srv = http.createServer((req, res) => {
  const rel = decodeURIComponent(req.url.split('?')[0]);
  const p = path.join(ROOT, rel === '/' ? 'index.html' : rel);
  fs.readFile(p, (e, buf) => {
    if (e) { res.writeHead(404); res.end(); return; }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(p)] || 'application/octet-stream' });
    res.end(buf);
  });
});
// count strongly-colored pixels in a PNG via canvas in-page? Simpler: raw luminance via sharp-less approach:
// use playwright to sample canvas pixels directly.
(async () => {
  await new Promise(r => srv.listen(PORT, '127.0.0.1', r));
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 520, height: 760 } });
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  const R = []; const t = (n, ok, info = '') => R.push([n, ok, info]);

  await page.goto(`http://127.0.0.1:${PORT}/`);
  await page.waitForTimeout(1000);

  // Attract: expect visible "PUSH 1 TO START" — sample canvas for bright-yellow pixels
  const yellow = await page.evaluate(() => {
    const g = document.querySelector('canvas').getContext('2d');
    const d = g.getImageData(0, 0, document.querySelector('canvas').width, document.querySelector('canvas').height).data;
    let y = 0; for (let i = 0; i < d.length; i += 4) if (d[i] > 200 && d[i + 1] > 170 && d[i + 2] < 120) y++;
    return y;
  });
  t('attract shows bright-yellow content (PUSH 1 TO START etc)', yellow > 800, 'yellowpx=' + yellow);
  await page.screenshot({ path: '/tmp/mpm2-attract.png' });

  await page.keyboard.press('Digit1');
  await page.waitForTimeout(700);

  await page.keyboard.down('ArrowUp');
  await page.waitForTimeout(1200);
  await page.keyboard.up('ArrowUp');
  await page.waitForTimeout(2500);
  await page.screenshot({ path: '/tmp/mpm2-gameplay.png' });

  // gameplay: expect pink maze wall pixels (level 1 pink fidelity)
  const pink = await page.evaluate(() => {
    const g = document.querySelector('canvas').getContext('2d');
    const d = g.getImageData(0, 0, document.querySelector('canvas').width, document.querySelector('canvas').height).data;
    let c = 0; for (let i = 0; i < d.length; i += 4) if (Math.abs(d[i] - 204) < 50 && Math.abs(d[i + 1] - 68) < 50 && Math.abs(d[i + 2] - 136) < 50) c++;
    return c;
  });
  t('level-1 pink maze walls present', pink > 500, 'pinkpx=' + pink);

  t('no page errors', errors.length === 0, errors.join('; ').slice(0, 200));

  R.forEach(([n, ok, i]) => console.log(`${ok ? 'PASS' : 'FAIL'}  ${n}${i ? '  [' + i + ']' : ''}`));
  console.log(R.some(r => !r[1]) ? 'GATE: FAIL' : 'GATE: PASS');
  await browser.close(); srv.close();
  process.exit(R.some(r => !r[1]) ? 1 : 0);
})().catch(e => { console.error('HARNESS ERROR', e); process.exit(2); });
