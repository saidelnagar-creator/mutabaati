// قائمة أصول الـ Service Worker محدَّثة، المسارات نسبية، لا روابط خارجية ولا كود غير آمن، ولا بيانات حقيقية في الملفات المتتبَّعة.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { buildSwAssets, listAssets } from '../../tools/gen-sw-assets.mjs';

const ROOT = new URL('../../', import.meta.url).pathname;

test('app/sw-assets.js و بصمة sw.js محدَّثان (شغّل: npm run sw:assets)', () => {
  const expected = buildSwAssets();
  assert.equal(readFileSync(join(ROOT, 'app/sw-assets.js'), 'utf8'), expected.assets, 'ملفات app/ تغيّرت ولم يُعَد توليد sw-assets.js');
  assert.equal(readFileSync(join(ROOT, 'app/sw.js'), 'utf8'), expected.sw, 'بصمة sw.js قديمة');
});

test('كل المسارات نسبية ولا روابط خارجية إلا Google Drive في وحدتها، ولا innerHTML/eval', () => {
  const files = listAssets();
  const html = readFileSync(join(ROOT, 'app/index.html'), 'utf8');
  for (const m of html.matchAll(/(?:href|src)="([^"]+)"/g)) assert.ok(m[1].startsWith('./'), `مسار غير نسبي: ${m[1]}`);
  for (const f of files.filter((x) => x.endsWith('.js'))) {
    const src = readFileSync(join(ROOT, 'app', f), 'utf8');
    for (const m of src.matchAll(/from '([^']+)'/g)) assert.ok(m[1].startsWith('.'), `استيراد غير نسبي في ${f}: ${m[1]}`);
    const allowed = f === 'src/core/drive.js' ? '|accounts\\.google\\.com/o/oauth2|www\\.googleapis\\.com/' : '';
    assert.ok(!new RegExp(`https?://(?!www\\.w3\\.org|schemas\\.openxmlformats\\.org${allowed})`).test(src), `رابط خارجي في ${f}`);
    assert.ok(!/innerHTML|outerHTML|insertAdjacentHTML|eval\(|new Function\(/.test(src), `كود غير آمن في ${f}`);
  }
  const manifest = JSON.parse(readFileSync(join(ROOT, 'app/manifest.webmanifest'), 'utf8'));
  assert.equal(manifest.start_url, './index.html');
  assert.equal(manifest.scope, './');
  assert.match(html, /Content-Security-Policy/);
});

function trackedFiles() {
  const out = [];
  const walk = (d) => {
    for (const name of readdirSync(d)) {
      if (['node_modules', '.git', 'input', 'output'].includes(name)) continue;
      const p = join(d, name);
      if (statSync(p).isDirectory()) walk(p);
      else if (/\.(m?js|md|json|html|css|webmanifest|ya?ml)$/.test(name) && name !== 'package-lock.json') out.push(p);
    }
  };
  walk(ROOT);
  return out;
}

test('لا أرقام موبايل ولا أرقام قومية ولا ملفات نسخ احتياطية في الملفات المتتبَّعة', () => {
  for (const f of trackedFiles()) {
    const src = readFileSync(f, 'utf8');
    assert.ok(!/\b01[0125]\d{8}\b/.test(src), `رقم موبايل محتمل في ${f}`);
    assert.ok(!/\b[23]\d{13}\b/.test(src), `رقم قومي محتمل في ${f}`);
  }
  const ignore = readFileSync(join(ROOT, '.gitignore'), 'utf8');
  for (const p of ['input/', 'output/', '*-backup*.json']) assert.ok(ignore.includes(p), `.gitignore لا يستثني ${p}`);
});
