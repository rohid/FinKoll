import i18n from "i18next";
import { initReactI18next } from "react-i18next";
import en from "./locales/en.json";
import sv from "./locales/sv.json";
import es from "./locales/es.json";

export const LANGUAGES = [
  { code: "en", label: "English" },
  { code: "sv", label: "Svenska" },
  { code: "es", label: "Español" },
] as const;

export type LangCode = (typeof LANGUAGES)[number]["code"];

const SUPPORTED = LANGUAGES.map((l) => l.code) as LangCode[];

// Detect the browser's preferred language (e.g. "sv-SE" → "sv"), falling back to
// English. A previously saved choice always wins over auto-detection.
function detectLang(): LangCode {
  const langs = navigator.languages ?? [navigator.language];
  for (const l of langs) {
    const code = l?.slice(0, 2).toLowerCase() as LangCode;
    if (SUPPORTED.includes(code)) return code;
  }
  return "en";
}

const saved = localStorage.getItem("finkoll-lang") as LangCode | null;
const initialLang = saved && SUPPORTED.includes(saved) ? saved : detectLang();

i18n.use(initReactI18next).init({
  resources: {
    en: { translation: en },
    sv: { translation: sv },
    es: { translation: es },
  },
  lng: initialLang,
  fallbackLng: "en",
  interpolation: { escapeValue: false },
});

export default i18n;
