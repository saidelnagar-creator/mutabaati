// التطبيق كتطبيق مثبَّت: يعمل أوفلاين، التحديث لا يمس البيانات، القفل، واسترجاع المرآة.
import test from 'node:test';
import assert from 'node:assert/strict';
import { cpSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { launch, openApp, go, swReady, APP_DIR, sheet } from './helpers.mjs';
import { writeSwAssets } from '../../tools/gen-sw-assets.mjs';

test('يعمل بدون إنترنت بعد أول فتح، والبيانات باقية', async () => {
  const t = await launch();
  const { page, context } = t;
  try {
    await openApp(page, t.url);
    await swReady(page);
    await page.evaluate(() => window.__mt.store.run((b) => b.upsert('patient', { id: 'off', name: 'مريض أوفلاين', sex: 'M' })));
    await context.setOffline(true);
    await page.reload();
    await page.waitForSelector('.tabbar');
    await go(page, '#/patients');
    assert.match(await page.locator('#screen').innerText(), /مريض أوفلاين/);
  } finally {
    await t.close();
  }
});

test('تحديث الكود يعرض «تحديث الآن» ولا يمس البيانات', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'mt-app-'));
  cpSync(APP_DIR, dir, { recursive: true });
  const t = await launch({ root: dir });
  const { page } = t;
  try {
    await openApp(page, t.url);
    await swReady(page);
    await page.evaluate(() => window.__mt.store.run((b) => b.upsert('patient', { id: 'keep', name: 'باقٍ بعد التحديث', sex: 'F' })));
    const before = await page.evaluate(() => window.__mt.store.events.length);
    const p = join(dir, 'src/config/version.js');
    writeFileSync(p, readFileSync(p, 'utf8').replace(/APP_VERSION = '[^']+'/, "APP_VERSION = '9.9.9'"));
    writeSwAssets(dir);
    await page.reload();
    await page.waitForSelector('.banner.info', { timeout: 15000 });
    await page.getByRole('button', { name: 'تحديث الآن' }).click();
    await page.waitForFunction(() => window.__mt && window.__mt.version === '9.9.9', null, { timeout: 15000 });
    assert.equal(await page.evaluate(() => window.__mt.store.events.length), before);
  } finally {
    await t.close();
  }
});

test('قفل الرقم السري: يطلب الرقم ويرفض الخطأ', async () => {
  const t = await launch();
  const { page } = t;
  try {
    await openApp(page, t.url);
    await go(page, '#/settings');
    await page.getByRole('button', { name: 'تفعيل القفل' }).click();
    await sheet(page).getByLabel('الرقم الجديد').fill('2468');
    await sheet(page).getByLabel('تأكيد الرقم').fill('2468');
    await sheet(page).getByRole('button', { name: 'حفظ' }).click();
    await page.reload();
    await page.waitForSelector('.lock');
    for (const d of '1111') await page.getByRole('button', { name: d, exact: true }).click();
    await page.waitForSelector('text=رقم غير صحيح');
    for (const d of '2468') await page.getByRole('button', { name: d, exact: true }).click();
    await page.waitForSelector('.tabbar');
  } finally {
    await t.close();
  }
});

test('اختفاء قاعدة البيانات وحدها: يعرض الاسترجاع من النسخة المرآة', async () => {
  const t = await launch();
  const { page } = t;
  page.on('dialog', (d) => d.accept());
  try {
    await openApp(page, t.url);
    await page.evaluate(() => window.__mt.store.run((b) => b.upsert('patient', { id: 'mir', name: 'محفوظ في المرآة', sex: 'M' })));
    await page.evaluate(() => window.__mt.mirror.flush());
    await page.evaluate(() => new Promise((r) => { window.__mt.store.close(); const q = indexedDB.deleteDatabase('mutabaati'); q.onsuccess = q.onerror = q.onblocked = () => r(); }));
    await page.reload();
    await page.waitForSelector('.dialog');
    await page.locator('.dialog').getByRole('button', { name: 'استرجاع' }).click();
    await page.waitForSelector('.tabbar');
    await go(page, '#/patients');
    assert.match(await page.locator('#screen').innerText(), /محفوظ في المرآة/);
  } finally {
    await t.close();
  }
});

test('التصدير مشفر إجباري، والاستيراد يرجّع البيانات والصور', async () => {
  const t = await launch();
  const { page } = t;
  try {
    await openApp(page, t.url);
    // مريض + صورة صغيرة مباشرة في المخزن
    await page.evaluate(async () => {
      const s = window.__mt.store;
      await s.run((b) => b.upsert('patient', { id: 'bk', name: 'مريض النسخة', sex: 'M' }));
      await s.putFile({ id: 'f_test1', mime: 'image/png', data: 'data:image/png;base64,iVBORw0KGgo=', bytes: 8, createdAt: new Date().toISOString() });
      await s.run((b) => b.addEntry({ kind: 'photo', patientId: 'bk', date: '2026-11-01', fileId: 'f_test1', cat: 'lab' }));
    });
    await go(page, '#/backup');
    const [dl] = await Promise.all([
      page.waitForEvent('download'),
      (async () => {
        await page.getByRole('button', { name: 'تصدير بالصور' }).click();
        const s = sheet(page);
        await s.getByLabel('كلمة السر', { exact: true }).fill('secret-pass-1');
        await s.getByLabel('تأكيد كلمة السر').fill('secret-pass-1');
        await s.getByRole('button', { name: 'تشفير وتصدير' }).click();
      })(),
    ]);
    const text = readFileSync(await dl.path(), 'utf8');
    const obj = JSON.parse(text);
    assert.equal(obj.format, 'backup-encrypted');
    assert.ok(!text.includes('مريض النسخة'), 'الاسم مش ظاهر في الملف المشفر');
    // مسح وإعادة الاستيراد على قاعدة جديدة
    await page.evaluate(() => new Promise((r) => { window.__mt.store.close(); const q = indexedDB.deleteDatabase('mutabaati'); q.onsuccess = q.onerror = q.onblocked = () => r(); }));
    await page.evaluate(() => caches.keys().then((ks) => Promise.all(ks.filter((k) => k.includes('mirror')).map((k) => caches.delete(k)))));
    await page.evaluate(() => localStorage.clear());
    await page.reload();
    await page.waitForSelector('.tabbar');
    await go(page, '#/backup');
    await page.setInputFiles('#import-file', await dl.path());
    await page.waitForSelector('.sheet');
    if (await page.getByLabel('كلمة السر').count()) {
      await sheet(page).getByLabel('كلمة السر').fill('secret-pass-1');
      await sheet(page).getByRole('button', { name: 'فتح' }).click();
    }
    await sheet(page).getByRole('button', { name: /استيراد|دمج/ }).click();
    await page.waitForFunction(() => window.__mt.store.state.entities.get('patient')?.has('bk'));
    const f = await page.evaluate(() => window.__mt.store.getFile('f_test1'));
    assert.ok(f && f.data.startsWith('data:image/png'));
  } finally {
    await t.close();
  }
});
