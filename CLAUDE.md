# متابعاتي — دليل المطوّر (اقرأه قبل أي تعديل)

PWA عربي RTL لطبيب غدد: متابعة المرضى (السكر أولاً، ثم الدرقية، ثم النوبتجيات، ثم باقي الغدد).
يعمل أوفلاين على iPhone، بلا backend، والبيانات في IndexedDB على الجهاز فقط. بلا خطوة بناء: ملفات `app/` تُنشر كما هي (ES modules).

## الأوامر

```bash
npm install                 # مرة واحدة (اعتماد تطوير واحد: fake-indexeddb)
npm run serve               # خادم محلي http://127.0.0.1:8080
npm run test:unit           # المعادلات + سيناريوهات سريرية + القواعد + التخزين + خواص عشوائية (Node، ثوانٍ)
npm run test:e2e            # متصفح بمحاكاة iPhone (Playwright/Chromium، ~دقيقة)
npm run sw:assets           # ← بعد أي تعديل داخل app/ (قائمة الأوفلاين وبصمة sw.js)
npm run icons               # إعادة توليد الأيقونات من tools/make-icons.mjs
```

المهمة لا تُعتبر منتهية قبل نجاح `test:unit` و`test:e2e`.

## المعمارية

```
app/
  src/config/
    version.js              APP_VERSION، DB_NAME (لا يتغير أبداً)، KEY_PREFIX = 'mt'
    rules.js                معاملات تشغيلية (النسخ، القفل، حداثة التحاليل، الصور)
    defaults.js             المصادر المزروعة (المعهد، معارف البلد، آخر) والإعدادات الافتراضية
    catalog/                القوائم الطبية — بيانات لا منطق، كلها قابلة للتعديل من الواجهة
      drugs.js              المواد الفعالة (التصنيف، العلاقة بالأكل، الملاحظات، تعليمات المريض) + الأسماء التجارية (review: true)
      labs.js               التحاليل: الوحدة الأساسية، الوحدات البديلة ومعامل التحويل، المدى المرجعي، المجموعات، المؤشرات المحسوبة
      conditions.js         أنواع السكر، الحالات المصاحبة وتفاصيلها و ICD-10
      alerts.js             قواعد التنبيهات (DSL شرطي + params قابلة للتعديل + مرجع)
      care.js               المتابعات الدورية، مجموعات الأهداف، خانات القراءات، مستويات الهبوط، الفحوصات
  src/core/                 منطق خالص: لا DOM ولا IndexedDB، يعمل في Node
    state.js engine.js      الحالة = fold(الأحداث). 4 أحداث عامة فقط (انظر أدناه)
    kinds.js                أنواع الكيانات والقيود: التحقق (رسائل عربية) والوصف. الجرعة والتاريخ متغير الدقة
    validate.js book.js     dispatch (تحقق ← إلحاق)، replaceEntry، الزرع
    catalog.js              القوائم الفعلية = الافتراضية + تعديلات/إضافات الطبيب (كيانات بنفس المعرّف)
    calc.js                 كل المعادلات (eGFR 2021، CG، FIB-4، MELD، Child-Pugh، LDL، …)
    labs.js                 التحويل، المدى، العلامات، السلاسل، المؤشرات المحسوبة، جدول المقارنة
    meds.js                 الخط الزمني للعلاج، العلاج النشط، الجرعة اليومية لكل مادة، الإنسولين، نص الجرعة
    patient.js              سياق المريض في تاريخ (مدخل التنبيهات): السن، آخر القيم الحديثة، eGFR/CrCl، الحالات، العلاج، الأهداف
    alerts.js               محرك القواعد
    glucose.js              SMBG، CGM، الهبوط، الأهداف
    followup.js             المتابعات الدورية والمهام المنتظرة
    backup.js crypto-backup.js drive.js sha256.js xlsx.js num.js util.js age.js migrations/
  src/storage/              store.js (فتح، ترحيل آمن، snapshots، استيراد، مخزن الصور files)، idb.js، mirror.js، drive-sync.js
  src/ui/                   app.js (المسارات، القفل)، components.js، widgets.js (تاريخ متغير الدقة، اختيار دواء، بناء الجرعة)،
                            chart.js (SVG)، forms-*.js، screens/ (patients, patient, library, calc, rules, reports, backup, more)
tests/unit tests/e2e        بيانات وهمية فقط
tools/                      serve، gen-sw-assets، make-icons
docs/                       USER_GUIDE، CLINICAL_SOURCES، SECURITY، DEPLOY، ASSUMPTIONS، ROADMAP، CHANGELOG
```

**تدفق البيانات:** الواجهة ← `store.run(book => …)` ← `Book.dispatch` (تحقق) ← إلحاق في IndexedDB ← `applyEvent` ← إعادة رسم.
الواجهة لا تحسب ولا تكتب في IndexedDB مباشرة؛ كل حساب في `core/`.

### الأحداث (لا تُضف نوع حدث — أضف نوع كيان أو قيد في kinds.js)

| الحدث | المعنى |
|---|---|
| `entity.upsert {kind, item}` | مريض، حالة مصاحبة (`condition` بتاريخ بداية/نهاية)، مهمة منتظرة (`task`)، مصدر، تعديل/إضافة دواء (`drug.generic`/`drug.product`)، تحليل (`lab.test`)، قاعدة (`rule`)، مراجعة تنبيه (`alert.ack`). الحقول المرسلة تحل محل القديمة، و`undefined` تتحول `null` |
| `entry.add {entry}` | قيد بتاريخ لا يُعدَّل: `visit`، `labs`، `med.start`/`med.change`/`med.stop`، `smbg`، `cgm`، `hypo`، `exam`، `photo`، `note` |
| `entry.void {entryId, reason}` | إلغاء. التعديل = إلغاء + قيد جديد يحمل `replaces` |
| `settings.set {key, value}` | إعداد عام (ومنه فترات المتابعة `screen.<id>`) |

## قواعد ثابتة

1. **سجل append-only.** لا حدث يُعدَّل ولا يُحذف. كل رقم يُحسب من السجل.
2. **القيم الطبية أرقام كما أُدخلت** (مقرّبة 4 خانات في `num.js`). نتيجة التحليل تُخزن بوحدتها `unit` وتُحوَّل للوحدة الأساسية عند الحساب (`toCanonical`). لا تغيّر الوحدة الأساسية لتحليل منشور — أضف تحليلاً جديداً.
3. **العلاج خط زمني:** `med.start` (بمعرّف `medId`، ويمكن `prior` و`datePrecision: unknown`) ← `med.change` ← `med.stop`. الجرعة `{slots:[{at, amount, unit}], freq, weekday?, every?, meal?, mealMin?, text?, sig?}`. المجم اليومي لكل مادة = الكمية × تركيز المنتج المختار (`drug.s`) × معامل التكرار.
4. **القوائم الطبية ليست مزروعة:** تعيش في `config/catalog` وتُعدَّل بكيانات بنفس المعرّف فوقها (`catalog.js`)؛ تحديث التطبيق يضيف أدوية/قواعد دون أن يمسح تعديلات الطبيب. المعرّفات ثابتة للأبد.
5. **القاعدة الطبية = بيانات:** شروط `all/any` على حقول السياق (`egfr`, `crcl`, `dose_day`, …) و`has/lacks/missing`. أي رقم قابل للتعديل يكون `$param`. بيانات ناقصة = لا تنبيه (وقواعد `missing` تنبّه للنقص). كل قاعدة لها `ref`.
6. **حداثة التحاليل:** نتيجة أقدم من `labMaxAgeDays` (365) لا تُستخدم في التنبيهات.
7. **الصور** في مخزن `files` منفصل؛ القيد `photo` يشير للمعرّف. النسخة الاحتياطية «بالصور» تضمّها، والاستيراد يضيف الناقص ولا يمسح.
8. **النسخ الاحتياطي مشفر إجبارياً** (AES-256-GCM، PBKDF2) للتصدير ولـ Drive. المرآة الداخلية (على نفس الجهاز) بدون صور.

## ما لا يجوز كسره

- **فصل الكود عن البيانات:** `DB_NAME` وأسماء المخازن ثابتة. `sw.js` لا يلمس IndexedDB. كاش الأصول يبدأ بـ `mt-assets-` ولا يبدأ به أي كاش آخر (المرآة `mt-mirror-v1`). مفاتيح localStorage تبدأ بـ `KEY_PREFIX`.
- **لا تحذف نوع كيان/قيد ولا تغيّر معنى حقل مخزَّن.** تغيير المعنى = ترحيل جديد في `core/migrations/`.
- **لا بيانات حقيقية في git** (أسماء، تليفونات، أرقام قومية). `sw-assets.test.mjs` يفحص. الاختبارات ببيانات وهمية.
- **كل المسارات نسبية**، لا CDN ولا مكتبات. **الأمان:** لا `innerHTML` ولا `eval` ولا كود/نمط مضمَّن (CSP). الاتصال الخارجي الوحيد `www.googleapis.com` في `core/drive.js`.
- **الطب:** كل قاعدة جديدة تحتاج مرجعاً في `ref` واختباراً في `clinical.test.mjs`. الأسماء التجارية الجديدة `review: true`. لا تغيّر ثوابت المعادلات المنشورة (`calc.test.mjs` يحرسها).
- **رسائل وواجهة بالعربية** (المصطلحات الطبية إنجليزي)، موبايل أولاً، حقول الإدخال ≥ 16px. التقرير الطبي بالإنجليزي، تعليمات المريض بالعربي (عامية/فصحى).

## إضافة مرحلة (الدرقية، النوبتجيات، …)

1. البيانات في `config/catalog` (تحاليل/أدوية/حالات/قواعد/متابعات جديدة بمعرّفات جديدة).
2. منطق خالص في `core/` + اختبار وحدة. نوع قيد جديد = تعريف في `kinds.js` (validate + describe).
3. الواجهة: تبويب في `screens/patient.js` أو شاشة جديدة ومسار في `ROUTES` بـ `app.js`.
4. `npm run sw:assets` ثم `npm run test:unit && npm run test:e2e`، وحدّث `docs/CHANGELOG.md` وارفع `APP_VERSION`.

## النشر

- GitHub Actions (`.github/workflows/pages.yml`) ينشر `app/` على GitHub Pages عند كل دفع لـ `main` (بعد نجاح test:unit). الريبو عام لكنه **كود فقط**.
- **تغيير رابط التطبيق = مخزن بيانات جديد فارغ على الهاتف.** لا تغيّر اسم الريبو ولا المستخدم بعد التثبيت إلا بنسخة احتياطية.

## بيئة الاختبار

- E2E: Playwright المثبت عالمياً + Chromium بمحاكاة iPhone 14 على مسار فرعي `/mutabaati/`. التخزين في Node عبر `fake-indexeddb`.
