// إصدار الكود (يتغير مع كل نشر) — مستقل تماماً عن إصدار هيكل البيانات (SCHEMA_VERSION في core/migrations).
export const APP_VERSION = '0.1.0';
export const APP_ID = 'mutabaati';
export const APP_NAME = 'متابعاتي';
// اسم قاعدة البيانات ثابت للأبد: تغييره = بيانات فارغة. لا تغيّره.
export const DB_NAME = 'mutabaati';
// بادئة كل مفاتيح التخزين المحلي والكاش: التطبيق يشارك نطاق github.io مع تطبيقات أخرى.
export const KEY_PREFIX = 'mt';
