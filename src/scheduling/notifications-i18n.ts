import { DEFAULT_LANGUAGE, LANGUAGE_STORAGE_KEY, isSupportedLanguage, type LanguageCode } from "../i18n/config";
import { storageGet } from "../utils/storage-backend";

interface NotificationStrings {
  publishedTitle: string;
  publishedBody: string;
  failedTitle: string;
  sessionExpiredTitle: string;
  sessionExpiredBody: string;
  partialTitle: string;
  partialBody: (succeeded: number, total: number) => string;
}

const STRINGS: Record<LanguageCode, NotificationStrings> = {
  en: {
    publishedTitle: "Story published",
    publishedBody: "Your scheduled story was posted successfully.",
    failedTitle: "Scheduled story failed",
    sessionExpiredTitle: "Telegram session expired",
    sessionExpiredBody: "Open the extension and log in again to keep your scheduled stories working.",
    partialTitle: "Scheduled story partially failed",
    partialBody: (s, t) => `Published to ${s} of ${t} targets.`,
  },
  fa: {
    publishedTitle: "استوری منتشر شد",
    publishedBody: "استوری زمان‌بندی‌شده‌ی شما با موفقیت منتشر شد.",
    failedTitle: "انتشار استوری زمان‌بندی‌شده ناموفق بود",
    sessionExpiredTitle: "نشست تلگرام منقضی شد",
    sessionExpiredBody: "اکستنشن را باز کنید و دوباره وارد شوید تا استوری‌های زمان‌بندی‌شده کار کنند.",
    partialTitle: "انتشار استوری زمان‌بندی‌شده ناقص بود",
    partialBody: (s, t) => `در ${s} مورد از ${t} مقصد منتشر شد.`,
  },
  ar: {
    publishedTitle: "تم نشر القصة",
    publishedBody: "تم نشر قصتك المجدولة بنجاح.",
    failedTitle: "فشل نشر القصة المجدولة",
    sessionExpiredTitle: "انتهت جلسة تيليجرام",
    sessionExpiredBody: "افتح الإضافة وسجّل الدخول مجددًا لإبقاء قصصك المجدولة تعمل.",
    partialTitle: "فشل جزئي في نشر القصة المجدولة",
    partialBody: (s, t) => `تم النشر في ${s} من ${t} وجهات.`,
  },
  es: {
    publishedTitle: "Historia publicada",
    publishedBody: "Tu historia programada se publicó correctamente.",
    failedTitle: "Falló la historia programada",
    sessionExpiredTitle: "La sesión de Telegram caducó",
    sessionExpiredBody: "Abre la extensión e inicia sesión de nuevo para que tus historias programadas sigan funcionando.",
    partialTitle: "Historia programada publicada parcialmente",
    partialBody: (s, t) => `Publicado en ${s} de ${t} destinos.`,
  },
  fr: {
    publishedTitle: "Story publiée",
    publishedBody: "Votre story planifiée a été publiée avec succès.",
    failedTitle: "Échec de la story planifiée",
    sessionExpiredTitle: "Session Telegram expirée",
    sessionExpiredBody: "Ouvrez l'extension et reconnectez-vous pour que vos stories planifiées continuent de fonctionner.",
    partialTitle: "Story planifiée partiellement échouée",
    partialBody: (s, t) => `Publiée sur ${s} destinations sur ${t}.`,
  },
  it: {
    publishedTitle: "Storia pubblicata",
    publishedBody: "La tua storia pianificata è stata pubblicata correttamente.",
    failedTitle: "Storia pianificata non riuscita",
    sessionExpiredTitle: "Sessione Telegram scaduta",
    sessionExpiredBody: "Apri l'estensione ed effettua di nuovo l'accesso per continuare a usare le storie pianificate.",
    partialTitle: "Storia pianificata parzialmente riuscita",
    partialBody: (s, t) => `Pubblicata su ${s} di ${t} destinazioni.`,
  },
  ru: {
    publishedTitle: "История опубликована",
    publishedBody: "Ваша запланированная история успешно опубликована.",
    failedTitle: "Не удалось опубликовать запланированную историю",
    sessionExpiredTitle: "Сессия Telegram истекла",
    sessionExpiredBody: "Откройте расширение и войдите снова, чтобы запланированные истории продолжали работать.",
    partialTitle: "Запланированная история опубликована частично",
    partialBody: (s, t) => `Опубликовано в ${s} из ${t} мест.`,
  },
  tr: {
    publishedTitle: "Hikaye yayınlandı",
    publishedBody: "Zamanlanmış hikayeniz başarıyla yayınlandı.",
    failedTitle: "Zamanlanmış hikaye başarısız oldu",
    sessionExpiredTitle: "Telegram oturumu sona erdi",
    sessionExpiredBody: "Zamanlanmış hikayelerinizin çalışmaya devam etmesi için uzantıyı açıp tekrar giriş yapın.",
    partialTitle: "Zamanlanmış hikaye kısmen başarısız oldu",
    partialBody: (s, t) => `${t} hedeften ${s} tanesine yayınlandı.`,
  },
};

export async function getNotificationStrings(): Promise<NotificationStrings> {
  const stored = await storageGet<string>(LANGUAGE_STORAGE_KEY);
  const language = stored && isSupportedLanguage(stored) ? stored : DEFAULT_LANGUAGE;
  return STRINGS[language];
}
