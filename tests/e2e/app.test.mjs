// سيناريو كامل في المتصفح (محاكاة iPhone): مريض جديد ← متابعة بمواعيد منتظرة ← تحاليل تقفل المنتظر ← دواء بتنبيه كلى
// ← تعديل وإيقاف ← قراءات سكر ← حالة حمل ← تقرير ← بقاء البيانات بعد إعادة الفتح. بيانات وهمية فقط.
import test from 'node:test';
import assert from 'node:assert/strict';
import { launch, openApp, go, sheet, newPatient } from './helpers.mjs';

test('رحلة مريض سكر كاملة', async () => {
  const app = await launch();
  const { page, errors } = app;
  try {
    await openApp(page, app.url);
    const id = await newPatient(page, { name: 'مريض أول', age: '66' });
    assert.ok(id);
    await page.waitForSelector('.patient-head');
    assert.match(await page.locator('.patient-head').innerText(), /سكر نوع تاني/);

    // متابعة: شكوى + قياسات + ميعاد جاي + تحاليل منتظرة + سؤال
    await page.locator('.fab').click();
    let s = sheet(page);
    await s.getByLabel('الشكوى', { exact: true }).fill('عطش وتنميل في الرجلين');
    await s.getByLabel('الوزن').fill('80');
    await s.getByLabel('الضغط').fill('145');
    await s.getByLabel('/').fill('90');
    await s.getByRole('button', { name: 'شهر', exact: true }).click();
    await s.getByRole('button', { name: '+ وظايف كلى' }).click();
    await s.getByLabel('أسأله المرة الجاية عن').fill('فحص قاع العين');
    await s.getByRole('button', { name: 'حفظ المتابعة' }).click();
    await page.waitForFunction(() => !document.querySelector('.sheet'));
    await go(page, `#/patient/${id}/pending`);
    const pending = await page.locator('main').innerText();
    assert.match(pending, /Creat/);
    assert.match(pending, /فحص قاع العين/);
    assert.match(pending, /ميعاد متابعة/);

    // التحاليل: كرياتينين عالي (eGFR ~ 28) بوحدة µmol/L + HbA1c
    await go(page, `#/patient/${id}/labs`);
    await page.getByRole('button', { name: '+ إدخال تحاليل' }).click();
    s = sheet(page);
    await s.getByRole('button', { name: 'إضافتها' }).click();
    const creatRow = s.locator('.lab-row', { hasText: 'Creat' });
    await creatRow.locator('input').fill('212');
    await creatRow.locator('select').selectOption('µmol/L');
    await s.getByRole('button', { name: 'سكر', exact: true }).click();
    await s.locator('.lab-row', { hasText: 'HbA1c' }).locator('input').fill('8.6');
    await s.getByRole('button', { name: 'حفظ النتائج' }).click();
    await page.waitForFunction(() => !document.querySelector('.sheet'));
    const labsText = await page.locator('table.compare').innerText();
    assert.match(labsText, /HbA1c/);
    assert.match(labsText, /eGFR/);
    await go(page, `#/patient/${id}/pending`);
    assert.doesNotMatch(await page.locator('main').innerText(), /تحاليل: Creat/, 'المنتظر اتقفل بالتحاليل');

    // دواء: Glucophage 1000 مرتين → تنبيه ممنوع (eGFR < 30) قبل الحفظ وبعده
    await go(page, `#/patient/${id}/meds`);
    await page.getByRole('button', { name: '+ دواء جديد' }).click();
    s = sheet(page);
    await s.locator('input.search').fill('glucophage');
    await s.locator('.row', { hasText: /^Glucophage/ }).first().click();
    await sheet(page).getByRole('button', { name: '1000 mg' }).click();
    s = sheet(page);
    await s.getByRole('button', { name: 'فطار + عشا' }).click();
    await s.locator('.dose .line input').first().fill('1');
    await s.locator('.dose .line input').nth(1).fill('1');
    await s.getByRole('button', { name: 'تحديث' }).click();
    assert.match(await s.locator('.alerts-preview').innerText(), /ممنوع/);
    await s.getByRole('button', { name: 'حفظ الدواء' }).click();
    await page.waitForFunction(() => !document.querySelector('.sheet'));
    await go(page, `#/patient/${id}`);
    const summary = await page.locator('main').innerText();
    assert.match(summary, /Metformin مع eGFR منخفض/);
    assert.match(summary, /SGLT2i للكلى|ACEi أو ARB|Statin/);

    // تعديل الجرعة ثم الإيقاف
    await go(page, `#/patient/${id}/meds`);
    await page.locator('.row', { hasText: 'Glucophage 1000' }).first().click();
    await sheet(page).getByRole('button', { name: 'تعديل الجرعة' }).click();
    s = sheet(page);
    await s.locator('.dose .line').nth(1).getByRole('button', { name: 'حذف' }).click();
    await s.getByLabel('السبب').fill('الكلى');
    await s.getByRole('button', { name: 'حفظ التعديل' }).click();
    await page.waitForFunction(() => !document.querySelector('.sheet'));
    await page.locator('.row', { hasText: 'Glucophage 1000' }).first().click();
    await sheet(page).getByRole('button', { name: 'إيقاف' }).click();
    s = sheet(page);
    await s.getByLabel('السبب').selectOption('contraindication');
    await s.getByRole('button', { name: 'إيقاف الدواء' }).click();
    await page.waitForFunction(() => !document.querySelector('.sheet'));
    const meds = await page.locator('main').innerText();
    assert.match(meds, /علاج سابق\/متوقف \(1\)/);
    assert.match(meds, /تعديل ↓/);

    // قراءات سكر منزلية
    await go(page, `#/patient/${id}/glucose`);
    await page.getByRole('button', { name: '+ قراءات البيت' }).click();
    s = sheet(page);
    const cells = s.locator('input.cell');
    await cells.nth(0).fill('180');
    await cells.nth(1).fill('240');
    await cells.nth(7).fill('65');
    await s.getByRole('button', { name: 'حفظ القراءات' }).click();
    await page.waitForFunction(() => !document.querySelector('.sheet'));
    assert.match(await page.locator('main').innerText(), /المتوسط/);

    // التقرير
    await go(page, `#/report/${id}`);
    const rep = await page.locator('.print-doc').innerText();
    assert.match(rep, /Patient Clinical Report/);
    assert.match(rep, /Medication History/);
    await page.getByRole('radio', { name: 'تعليمات المريض' }).click();
    assert.match(await page.locator('.print-doc').innerText(), /تعليمات العلاج/);

    // البيانات تبقى بعد إعادة التحميل
    await page.reload();
    await page.waitForSelector('.tabbar');
    await go(page, `#/patient/${id}/log`);
    const log = await page.locator('main').innerText();
    assert.match(log, /إيقاف/);
    assert.match(log, /قراءات سكر منزلية/);
    assert.deepEqual(errors, []);
  } finally {
    await app.close();
  }
});

test('الحمل يطلع تنبيهات ACEi و SGLT2i، والحاسبة تتملي من المريض', async () => {
  const app = await launch();
  const { page, errors } = app;
  try {
    await openApp(page, app.url);
    const id = await newPatient(page, { name: 'مريضة حامل', sex: 'أنثى', age: '31' });
    for (const [q, label] of [
      ['jardiance', '10 mg'],
      ['tritace', '5 mg'],
    ]) {
      await go(page, `#/patient/${id}/meds`);
      await page.getByRole('button', { name: '+ دواء جديد' }).click();
      await sheet(page).locator('input.search').fill(q);
      await sheet(page).locator('.list .row').first().click();
      await sheet(page).getByRole('button', { name: label, exact: true }).click();
      await sheet(page).locator('.dose .line input').first().fill('1');
      await sheet(page).getByRole('button', { name: 'حفظ الدواء' }).click();
      await page.waitForFunction(() => !document.querySelector('.sheet'));
    }
    await go(page, `#/patient/${id}/dx`);
    await page.locator('.fab').click();
    const s = sheet(page);
    await s.getByLabel('الحالة').selectOption('pregnancy');
    await s.getByRole('button', { name: 'حفظ' }).click();
    await page.waitForFunction(() => !document.querySelector('.sheet'));
    await go(page, `#/patient/${id}`);
    const t = await page.locator('main').innerText();
    assert.match(t, /ACEi\/ARB\/MRA في الحمل/);
    assert.match(t, /SGLT2i في الحمل/);
    assert.match(await page.locator('.patient-head').innerText(), /حامل/);
    // الحاسبة
    await go(page, '#/calc/body');
    await page.getByRole('button', { name: 'املأ من بيانات مريض' }).click();
    await sheet(page).locator('.row', { hasText: 'مريضة حامل' }).click();
    assert.equal(await page.getByLabel('الطول (سم)').inputValue(), '170');
    assert.deepEqual(errors, []);
  } finally {
    await app.close();
  }
});
