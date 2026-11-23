// النسخ الاحتياطي: تصدير (عادي/مشفّر) ومشاركته لحفظه في Google Drive أو الملفات، الاستيراد بمعاينة،
// النسخة المرآة، النسخ التلقائية، والنسخ المستمر على Google Drive (اختياري).
import { h } from '../dom.js';
import { ctx, F } from '../ctx.js';
import { badge, checkbox, confirmDialog, empty, errorBox, field, kv, list, openSheet, row, saveFile, sectionTitle, table, textInput, toast } from '../components.js';
import { parseBackup, planImport } from '../../core/backup.js';
import { canEncrypt, decryptBackup, encryptBackup, isEncryptedBackup } from '../../core/crypto-backup.js';
import { SCHEMA_VERSION } from '../../core/migrations/index.js';
import { RULES } from '../../config/rules.js';
import { readMirror } from '../../storage/mirror.js';
import { driveConfig, driveConnect, driveDisconnect, driveFetchBackup, driveRedirectUri, driveStatus, driveSyncNow } from '../../storage/drive-sync.js';

// التصدير دايماً مشفر (بيانات مرضى). photos: تضمين الصور.
export async function exportBackupNow({ password, photos = false }) {
  const store = ctx.store;
  try {
    if (!password) throw new Error('كلمة السر مطلوبة');
    const doc = photos ? await store.exportDocWithFiles('') : store.exportDoc('');
    const payload = await encryptBackup(doc, password);
    const name = `mutabaati-backup-${ctx.today()}${photos ? '-photos' : ''}.json`;
    const res = await saveFile(name, JSON.stringify(payload), 'application/json');
    if (res === 'cancelled') return false;
    await store.markBackedUp();
    toast(photos ? 'تم تجهيز النسخة المشفرة بالصور' : 'تم تجهيز النسخة المشفرة');
    return true;
  } catch (e) {
    toast('تعذّر التصدير: ' + e.message, 'bad');
    return false;
  }
}
function passwordSheet({ title, confirm, note, okText, remember = false }) {
  return new Promise((resolve) => {
    openSheet(
      title,
      (body, close) => {
        const err = errorBox();
        const a = h('input', { type: 'password', autocomplete: 'off', placeholder: 'كلمة السر' });
        const b = h('input', { type: 'password', autocomplete: 'off', placeholder: 'أعد كلمة السر' });
        const rem = remember ? checkbox('احفظها على الجهاز ده للنسخ الجاية', true) : null;
        body.append(
          err,
          note ? h('p', { class: 'muted', text: note }) : null,
          field('كلمة السر', a),
          confirm ? field('تأكيد كلمة السر', b) : null,
          rem,
          h('button', {
            type: 'button',
            class: 'btn primary block',
            text: okText,
            onclick: async () => {
              if (a.value.length < (confirm ? 8 : 1)) return err.show(confirm ? 'كلمة السر 8 أحرف على الأقل' : 'اكتب كلمة السر');
              if (confirm && a.value !== b.value) return err.show('الكلمتان غير متطابقتين');
              if (rem?.input.checked) await ctx.store.setMeta('backupPassword', a.value);
              close(a.value);
            },
          }),
        );
      },
      { onClose: (v) => resolve(v || null) },
    );
  });
}

// يقرأ نص ملف (عادي أو مشفَّر) ويعيد ناتج parseBackup أو null إذا أُلغي إدخال كلمة السر.
async function readBackupText(text) {
  let obj;
  try {
    obj = JSON.parse(text);
  } catch {
    return parseBackup(text);
  }
  if (!isEncryptedBackup(obj)) return parseBackup(obj);
  const saved = ctx.store.meta.backupPassword || ctx.store.meta.drive?.password;
  if (saved) {
    try {
      return parseBackup(await decryptBackup(obj, saved));
    } catch {
      /* كلمة مختلفة: نسأل */
    }
  }
  const password = await passwordSheet({ title: 'نسخة مشفرة', okText: 'فتح' });
  if (!password) return null;
  return parseBackup(await decryptBackup(obj, password));
}


async function exportFlow(photos) {
  const saved = ctx.store.meta.backupPassword || '';
  const password = saved ? saved : await passwordSheet({ title: 'كلمة سر النسخة', confirm: true, okText: 'تشفير وتصدير', note: 'اختار كلمة سر واحفظها في مكان آمن (مش على الموبايل بس). مفيش أي طريقة لاسترجاعها. تقدر تحفظها على الجهاز ده عشان ماتكتبهاش كل مرة.', remember: true });
  if (!password) return;
  await exportBackupNow({ password, photos });
}

export function backupScreen() {
  const store = ctx.store;
  const body = h('div', {});
  const last = store.meta.lastBackupAt;
  const unsaved = store.unsavedChanges();
  body.append(
    h('div', { class: `banner ${store.backupDue() || !last ? '' : 'info'}` }, h('span', { class: 'grow', text: `${last ? `آخر نسخة احتياطية: ${F.dateTime(last)}` : 'لم تُؤخذ نسخة احتياطية بعد.'}${unsaved ? ` — ${F.int(unsaved)} تغيير غير منسوخ` : ''}` })),
    h('p', { class: 'muted small', text: 'البيانات على الموبايل ده بس. الضمان ضد فقده أو حذف التطبيق: نسخة خارجه. كل نسخة بتتشفر بكلمة سر (AES-256) — من غيرها النسخة مش هتتفتح. عند التصدير تظهر قائمة المشاركة: اختار Drive أو «حفظ في الملفات».' }),
    canEncrypt()
      ? h('div', { class: 'btn-row' }, h('button', { type: 'button', class: 'btn primary', text: 'تصدير (من غير صور)', onclick: () => exportFlow(false) }), h('button', { type: 'button', class: 'btn', text: 'تصدير بالصور', onclick: () => exportFlow(true) }))
      : h('div', { class: 'banner bad', text: 'التشفير غير متاح في المتصفح ده — التصدير متوقف.' }),
    h('div', { style: { height: '10px' } }),
  );
  body.append(driveSection());
  const file = h('input', { type: 'file', style: { display: 'none' }, id: 'import-file', accept: '.json,application/json' });
  file.addEventListener('change', async () => {
    const f = file.files[0];
    file.value = '';
    if (!f) return;
    try {
      const parsed = await readBackupText(await f.text());
      if (parsed) importPreview(parsed);
    } catch (e) {
      toast(e.message, 'bad');
    }
  });
  body.append(file, h('button', { type: 'button', class: 'btn block', style: { marginTop: '10px' }, text: 'استيراد نسخة احتياطية…', onclick: () => file.click() }));
  body.append(
    h(
      'div',
      { class: 'card', style: { marginTop: '10px' } },
      kv('كلمة سر النسخ', store.meta.backupPassword ? 'محفوظة على الجهاز' : 'بتتكتب مع كل تصدير'),
      store.meta.backupPassword ? h('button', { type: 'button', class: 'btn small', text: 'مسح الكلمة المحفوظة', onclick: async () => (await store.setMeta('backupPassword', undefined), ctx.refresh()) }) : null,
    ),
  );

  body.append(sectionTitle('الحماية على الجهاز'));
  const persisted = h('span', { text: '…' });
  const usage = h('span', { text: '…' });
  const mirrorInfo = h('span', { text: '…' });
  if (navigator.storage?.persisted) navigator.storage.persisted().then((ok) => (persisted.textContent = ok ? 'مفعّل' : 'غير مؤكد')).catch(() => (persisted.textContent = 'غير معروف'));
  else persisted.textContent = 'غير مدعوم';
  if (navigator.storage?.estimate) navigator.storage.estimate().then((e) => (usage.textContent = `${F.int(Math.max(1, Math.round((e.usage || 0) / 1024)))} ك.ب`)).catch(() => (usage.textContent = '—'));
  else usage.textContent = '—';
  let mirrorDoc = null;
  readMirror().then((doc) => {
    mirrorDoc = doc;
    mirrorInfo.textContent = doc ? `${F.dateTime(doc.exportedAt)} — ${F.int(doc.events.length)} حدث` : 'لم تُكتب بعد';
  });
  body.append(
    h(
      'div',
      { class: 'card' },
      kv('تخزين دائم (لا يمسحه المتصفح تلقائياً)', persisted),
      kv('حجم البيانات على الجهاز', usage),
      kv('النسخة المرآة الداخلية (تلقائية)', mirrorInfo),
      h('p', { class: 'muted small', text: 'النسخة المرآة تُحدَّث تلقائياً بعد كل تغيير في مخزن مستقل عن قاعدة البيانات، ويعرض التطبيق استرجاعها إذا وجد قاعدته فارغة. هي على نفس الهاتف فلا تحمي من فقده أو حذف التطبيق.' }),
      h('button', {
        type: 'button',
        class: 'btn small',
        text: 'استرجاع من النسخة المرآة',
        onclick: async () => {
          if (!mirrorDoc) return toast('لا توجد نسخة مرآة بعد', 'bad');
          try {
            importPreview(parseBackup(mirrorDoc));
          } catch (e) {
            toast(e.message, 'bad');
          }
        },
      }),
    ),
  );

  body.append(sectionTitle('النسخ التلقائية قبل العمليات الحساسة'));
  const snaps = h('div', {}, empty('…'));
  body.append(snaps, h('p', { class: 'muted small', text: `تُؤخذ نسخة تلقائياً قبل كل استيراد أو استرجاع أو ترقية للهيكل (يُحتفظ بآخر ${F.int(RULES.snapshotsKeep)}). هذه النسخ على الجهاز نفسه ولا تغني عن التصدير.` }));
  store.listSnapshots().then((all) => {
    snaps.replaceChildren(
      all.length
        ? list(
            all.map((s) =>
              row({
                title: s.reason,
                subtitle: `${F.dateTime(s.createdAt)} · ${F.int(s.eventsCount)} حدث`,
                badge: badge('استرجاع', 'warn'),
                onclick: async () => {
                  if (!(await confirmDialog({ title: 'استرجاع هذه النسخة؟', message: `ستعود البيانات إلى حالتها في ${F.dateTime(s.createdAt)}.\nستُؤخذ نسخة تلقائية من الوضع الحالي أولاً.`, okText: 'استرجاع', danger: true }))) return;
                  try {
                    await store.restoreSnapshot(s.id);
                    toast('تم الاسترجاع');
                  } catch (e) {
                    toast(e.message, 'bad');
                  }
                },
              }),
            ),
          )
        : empty('لا توجد نسخ تلقائية بعد'),
    );
  });
  return { title: 'النسخ الاحتياطي', body };
}

// ---------- النسخ التلقائي على Google Drive ----------
const DRIVE_STATE = { ok: ['يعمل — كل التغييرات مرفوعة', 'ok'], pending: ['يعمل — تغييرات في انتظار الرفع', 'info'], 'needs-auth': ['يحتاج تجديد الاتصال', 'warn'], error: ['خطأ في آخر محاولة', 'bad'], off: ['غير مفعّل', ''] };

function driveSection() {
  const store = ctx.store;
  const c = driveConfig(store) || {};
  const st = driveStatus(store);
  const sb = DRIVE_STATE[st.state];
  const out = h('div', {});
  out.append(sectionTitle('نسخ احتياطي تلقائي مستمر على Google Drive'));
  const card = h('div', { class: 'card' }, kv('الحالة', badge(sb[0], sb[1])));
  if (st.lastAt) card.append(kv('آخر رفع', F.dateTime(st.lastAt)));
  if (st.pending) card.append(kv('تغييرات لم تُرفع', F.int(st.pending)));
  if (st.error) card.append(kv('الخطأ', st.error, 'neg'));
  if (c.lastError && st.state !== 'error') card.append(kv('ملاحظة', c.lastError, 'neg'));
  out.append(card);
  if (!c.clientId) {
    out.append(h('p', { class: 'muted small', text: 'بعد كل تغيير تُرفع نسخة كاملة تلقائياً إلى ملف واحد في حسابك على Drive (يحتفظ Drive بإصداراته السابقة). التطبيق لا يرى في حسابك إلا هذا الملف. يحتاج إعداداً لمرة واحدة (حوالي 10 دقائق): «معرّف عميل» مجاني من Google Cloud — الخطوات تظهر عند الضغط على الزر.' }));
  }
  const btns = h('div', { class: 'btn-row' });
  if (c.clientId && st.state === 'needs-auth') btns.append(h('button', { type: 'button', class: 'btn primary', text: c.auto ? 'تجديد الاتصال بـ Drive' : 'اتصال', onclick: () => driveConnect(store, { silent: !!c.lastAt }).catch((e) => toast(e.message, 'bad')) }));
  if (c.clientId && c.auto && ['ok', 'pending', 'error'].includes(st.state)) {
    btns.append(
      h('button', {
        type: 'button',
        class: 'btn primary',
        text: 'رفع الآن',
        onclick: async () => {
          const r = await driveSyncNow(store, { force: true });
          toast(r.ok ? 'تم الرفع إلى Drive' : r.reason === 'needs-auth' ? 'جدّد الاتصال أولاً' : r.error || 'تعذّر الرفع', r.ok ? '' : 'bad');
          ctx.refresh();
        },
      }),
      c.photos
        ? h('button', {
            type: 'button',
            class: 'btn',
            text: 'استرجاع الصور من Drive',
            onclick: async () => {
              try {
                const parsed = await readBackupText(await driveFetchBackup(store, { photos: true }));
                if (parsed) {
                  await store.importBackup(parsed, 'merge');
                  toast(`تم استرجاع ${parsed.doc.files?.length || 0} صورة`);
                }
              } catch (e) {
                toast(e.message, 'bad');
              }
            },
          })
        : null,
      h('button', {
        type: 'button',
        class: 'btn',
        text: 'استرجاع من Drive',
        onclick: async () => {
          try {
            const parsed = await readBackupText(await driveFetchBackup(store));
            if (parsed) importPreview(parsed);
          } catch (e) {
            toast(e.message, 'bad');
          }
        },
      }),
    );
  }
  btns.append(h('button', { type: 'button', class: 'btn', text: c.clientId ? 'إعداد Drive' : 'تفعيل النسخ على Drive', onclick: () => driveSetupForm() }));
  out.append(btns);
  return out;
}

function driveSetupForm() {
  const store = ctx.store;
  const c = driveConfig(store) || {};
  openSheet('إعداد النسخ على Google Drive', (body, close) => {
    const err = errorBox();
    const clientId = textInput(c.clientId || '', 'xxxxxxxx.apps.googleusercontent.com');
    clientId.dir = 'ltr';
    const password = h('input', { type: 'password', autocomplete: 'off', value: c.password || ctx.store.meta.backupPassword || '', placeholder: '8 أحرف على الأقل' });
    const photos = checkbox('ارفع الصور كمان (ملف منفصل، بيترفع لما الصور تتغير بس)', !!c.photos);
    const uri = driveRedirectUri();
    const saveCfg = async (connect) => {
      const id = clientId.value.trim();
      if (!/^[\w.-]+\.apps\.googleusercontent\.com$/.test(id)) return err.show('معرّف العميل يبدأ بأرقام وينتهي بـ .apps.googleusercontent.com');
      if (!password.value || password.value.length < 8) return err.show('كلمة سر التشفير إجبارية (8 أحرف على الأقل)');
      await store.setMeta('drive', { ...c, clientId: id, auto: true, password: password.value, photos: photos.input.checked, ...(id !== c.clientId ? { token: undefined, expiresAt: 0, fileId: undefined, photosFileId: undefined, lastEvents: 0, lastPhotosKey: '' } : {}) });
      close(true);
      if (connect) driveConnect(store).catch((e) => toast(e.message, 'bad'));
      else ctx.refresh();
    };
    body.append(
      err,
      h('ol', { class: 'flag-list' }, h('li', { text: 'افتح console.cloud.google.com بحسابك وأنشئ مشروعاً (مجاني).' }), h('li', { text: 'فعّل «Google Drive API» من APIs & Services ← Library.' }), h('li', { text: 'OAuth consent screen: النوع External، وأضف بريدك في Test users.' }), h('li', { text: 'Credentials ← Create credentials ← OAuth client ID ← Web application.' }), h('li', { text: 'في Authorized redirect URIs و Authorized JavaScript origins ضع رابط التطبيق التالي حرفياً:' })),
      h('div', { class: 'card', dir: 'ltr', style: { wordBreak: 'break-all', userSelect: 'all' }, text: uri }),
      field('معرّف العميل (Client ID)', clientId),
      field('كلمة سر تشفير النسخة المرفوعة', password, 'إجباري: الملف بيتشفر قبل الرفع. الكلمة بتتحفظ على الجهاز ده؛ لو نسيتها النسخة مش هتتفتح.'),
      photos,
      h('button', { type: 'button', class: 'btn primary block', type: 'button', text: 'حفظ والاتصال بحساب Google', onclick: () => saveCfg(true) }),
      c.clientId ? h('button', { type: 'button', class: 'btn block', style: { marginTop: '8px' }, type: 'button', text: 'حفظ فقط', onclick: () => saveCfg(false) }) : null,
      c.clientId
        ? h('button', {
            type: 'button',
            class: 'btn danger block',
            style: { marginTop: '8px' },
            type: 'button',
            text: 'إيقاف النسخ على Drive',
            onclick: async () => {
              await driveDisconnect(store);
              close(true);
              toast('أُوقف النسخ على Drive (الملف المرفوع باقٍ في حسابك)');
            },
          })
        : null,
    );
  });
}

function importPreview(parsed) {
  const plan = planImport(ctx.store.events, parsed);
  openSheet('معاينة الاستيراد', (body, close) => {
    const err = errorBox();
    const c = (x) => [F.int(x.entries), F.int(x.patients), x.lastDate ? F.date(x.lastDate) : '—'];
    body.append(
      err,
      h('div', { class: 'card' }, kv('تاريخ الملف', F.dateTime(plan.exportedAt)), kv('إصدار هيكل الملف', `${F.int(parsed.originalVersion)}${parsed.migrated.length ? ` ← رُقّي إلى ${F.int(SCHEMA_VERSION)}` : ''}`), kv('سلامة الملف (checksum)', 'سليم', 'pos'), parsed.doc.files ? kv('الصور', F.int(parsed.doc.files.length)) : null),
      table(
        [{ label: '' }, { label: 'قيود', num: true }, { label: 'مرضى', num: true }, { label: 'آخر قيد', num: true }],
        [
          ['على هذا الجهاز الآن', ...c(plan.current)],
          ['في الملف', ...c(plan.incoming)],
          ...(plan.merge.result ? [['بعد الدمج', ...c(plan.merge.result)]] : []),
        ],
      ),
      plan.merge.error ? h('div', { class: 'banner bad', text: `لا يمكن الدمج: ${plan.merge.error}` }) : null,
      h('p', { class: 'muted small', text: `الدمج يضيف ${F.int(plan.merge.added)} حدثاً جديداً من الملف ويُبقي ما على الجهاز. الاستبدال يمسح ما على الجهاز ويضع محتوى الملف مكانه. في الحالتين تُؤخذ نسخة تلقائية أولاً.` }),
    );
    const run = async (mode) => {
      if (mode === 'replace' && plan.current.entries > 0) {
        if (!(await confirmDialog({ title: 'استبدال كل البيانات؟', message: 'سيُستبدل كل ما على هذا الجهاز بمحتوى الملف.', okText: 'استبدال', danger: true }))) return;
      }
      try {
        await ctx.store.importBackup(parsed, mode);
        toast(mode === 'replace' ? 'تم الاستيراد (استبدال)' : 'تم الاستيراد (دمج)');
        close();
        ctx.nav('#/');
      } catch (e) {
        err.show('تعذّر الاستيراد: ' + e.message);
      }
    };
    body.append(h('div', { class: 'btn-row' }, h('button', { type: 'button', class: 'btn primary', text: plan.current.entries ? 'دمج' : 'استيراد', onclick: () => run(plan.current.entries ? 'merge' : 'replace') }), plan.current.entries ? h('button', { type: 'button', class: 'btn danger', text: 'استبدال', onclick: () => run('replace') }) : null));
  });
}

