// أدوات اختبارات المتصفح: خادم ثابت على مسار فرعي (مثل GitHub Pages) + Chromium بمحاكاة iPhone.
// WebKit غير مثبت في بيئة التطوير؛ نحاكي iPhone (المقاس، اللمس، user-agent) على Chromium.
import { createRequire } from 'node:module';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { startServer } from '../../tools/serve.mjs';

const require = createRequire(import.meta.url);
export const { chromium, devices } = require('playwright');
export const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
export const APP_DIR = resolve(ROOT, 'app');
const iPhone = devices['iPhone 14'];
export const IPHONE = { viewport: iPhone.viewport, userAgent: iPhone.userAgent, deviceScaleFactor: 1, isMobile: true, hasTouch: true, locale: 'ar-EG', timezoneId: 'Africa/Cairo' };

export async function launch({ root = APP_DIR, base = '/mutabaati/' } = {}) {
  let current = root;
  const srv = await startServer({ getRoot: () => current, base });
  const browser = await chromium.launch();
  const context = await browser.newContext({ ...IPHONE, serviceWorkers: 'allow', acceptDownloads: true });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(m.text());
  });
  return {
    browser,
    context,
    page,
    errors,
    url: srv.url,
    setRoot: (r) => (current = r),
    stopServer: () => srv.close(),
    async close() {
      await browser.close();
      await srv.close().catch(() => {});
    },
  };
}

export async function openApp(page, url) {
  await page.goto(url);
  await page.waitForSelector('.tabbar', { timeout: 15000 });
}

export const go = (page, hash) => page.evaluate((h) => (location.hash = h), hash).then(() => page.waitForTimeout(120));
export const sheet = (page) => page.locator('.sheet').last();

export async function swReady(page) {
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready;
    if (!navigator.serviceWorker.controller) await new Promise((r) => navigator.serviceWorker.addEventListener('controllerchange', r, { once: true }));
  });
}

// مريض جديد من شاشة المرضى. يعيد معرّفه.
export async function newPatient(page, { name = 'مريض اختبار', sex = 'ذكر', age = '62', dm = 'T2' } = {}) {
  await go(page, '#/patients');
  await page.locator('.fab').click();
  const s = sheet(page);
  await s.getByLabel('الاسم').fill(name);
  await s.getByRole('radio', { name: sex }).click();
  await s.getByRole('radio', { name: 'السن بس' }).click();
  await s.locator('.field', { hasText: 'السن' }).locator('input').last().fill(age);
  await s.getByLabel('نوع السكر').selectOption(dm);
  await s.getByLabel('الطول').fill('170');
  await s.getByRole('button', { name: 'حفظ' }).click();
  await page.waitForFunction(() => /#\/patient\//.test(location.hash));
  return page.evaluate(() => location.hash.split('/')[2]);
}
