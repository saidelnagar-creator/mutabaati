// التخزين في IndexedDB (fake-indexeddb): الزرع، الحفظ وإعادة الفتح، الاستيراد مع نسخة تلقائية، الصور، التشفير.
import test from 'node:test';
import assert from 'node:assert/strict';
import 'fake-indexeddb/auto';
import { Store } from '../../app/src/storage/store.js';
import { seedEvents } from '../../app/src/core/book.js';
import { parseBackup, exportDoc } from '../../app/src/core/backup.js';
import { encryptBackup, decryptBackup } from '../../app/src/core/crypto-backup.js';
import { buildState } from '../../app/src/core/engine.js';
import { stableStringify } from '../../app/src/core/util.js';

let n = 0;
const fresh = () => Store.open({ dbName: `t-${++n}` });

test('أول فتح يزرع المصادر ويعلّم القاعدة جديدة', async () => {
  const s = await fresh();
  assert.equal(s.isFresh, true);
  assert.equal(s.events.length, seedEvents().length);
  assert.equal(s.state.entities.get('source').get('institute').name, 'المعهد');
});

test('الحفظ يبقى بعد إعادة الفتح، والحالة تُعاد بناؤها من السجل', async () => {
  const name = `t-${++n}`;
  const s = await Store.open({ dbName: name });
  await s.run((b) => b.upsert('patient', { id: 'p', name: 'م', sex: 'F', sourceId: 'local' }));
  await s.run((b) => b.addEntry({ kind: 'labs', patientId: 'p', date: '2026-01-02', results: [{ test: 'a1c', v: 7.1 }] }));
  s.close();
  const s2 = await Store.open({ dbName: name });
  assert.equal(s2.isFresh, false);
  assert.equal(s2.events.length, s.events.length);
  assert.equal(s2.state.entries.length, 1);
});

test('حدث مرفوض لا يُكتب ولا يغيّر الحالة', async () => {
  const s = await fresh();
  const before = s.events.length;
  await assert.rejects(() => s.run((b) => b.addEntry({ kind: 'labs', patientId: 'missing', date: '2026-01-02', results: [{ test: 'a1c', v: 7 }] })), /المريض غير موجود/);
  assert.equal(s.events.length, before);
});

test('الاستيراد (دمج/استبدال) يأخذ نسخة تلقائية، والصور تُضاف ولا تُمسح', async () => {
  const a = await fresh();
  await a.run((b) => b.upsert('patient', { id: 'p1', name: 'أ', sex: 'M' }));
  await a.putFile({ id: 'f1', mime: 'image/jpeg', data: 'data:image/jpeg;base64,AAAA', bytes: 3 });
  await a.run((b) => b.addEntry({ kind: 'photo', patientId: 'p1', date: '2026-01-01', fileId: 'f1' }));
  const doc = await a.exportDocWithFiles('t');
  assert.equal(doc.files.length, 1);
  const b = await fresh();
  await b.run((bk) => bk.upsert('patient', { id: 'p2', name: 'ب', sex: 'F' }));
  await b.importBackup(parseBackup(JSON.stringify(doc)), 'merge');
  assert.ok(b.state.entities.get('patient').get('p1') && b.state.entities.get('patient').get('p2'));
  assert.equal((await b.getFile('f1')).data, 'data:image/jpeg;base64,AAAA');
  const snaps = await b.listSnapshots();
  assert.ok(snaps.some((x) => x.reason.includes('دمج')));
  await b.importBackup(parseBackup(JSON.stringify(a.exportDoc())), 'replace');
  assert.ok(!b.state.entities.get('patient').get('p2'));
  assert.ok(await b.getFile('f1'), 'الاستبدال من غير صور لا يمسح الصور');
  await b.restoreSnapshot(snaps[0].id);
  assert.ok(b.state.entities.get('patient').get('p2'));
});

test('ملف معدَّل يُرفض (checksum)، والتشفير ذهاباً وعودة', async () => {
  const a = await fresh();
  await a.run((b) => b.upsert('patient', { id: 'p', name: 'سري', sex: 'M' }));
  const doc = a.exportDoc();
  const bad = JSON.parse(JSON.stringify(doc));
  bad.events[bad.events.length - 1].data.item.name = 'تلاعب';
  assert.throws(() => parseBackup(JSON.stringify(bad)), /checksum/);
  const enc = await encryptBackup(doc, 'pass-1234', { iterations: 1000 });
  assert.ok(!JSON.stringify(enc).includes('سري'));
  const dec = await decryptBackup(enc, 'pass-1234');
  assert.equal(parseBackup(dec).doc.events.length, doc.events.length);
  await assert.rejects(() => decryptBackup(enc, 'wrong-pass'), /كلمة السر/);
});

test('مسح حقل (undefined) يفضل ممسوح بعد النسخة (JSON)', async () => {
  const a = await fresh();
  await a.run((b) => b.upsert('patient', { id: 'p', name: 'م', sex: 'M', phone: '0123' }));
  await a.run((b) => b.upsert('patient', { id: 'p', phone: undefined }));
  const doc = JSON.parse(JSON.stringify(exportDoc(a.events)));
  const s = buildState(doc.events);
  assert.equal(s.entities.get('patient').get('p').phone ?? null, null);
  assert.equal(stableStringify(s.entities.get('patient').get('p').name), stableStringify('م'));
});
