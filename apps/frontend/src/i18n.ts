import i18n from "i18next";
import { initReactI18next } from "react-i18next";

import zhTW from './modules/core/locales/zh-TW.json';
import enUS from './modules/core/locales/en-US.json';

i18n
  .use(initReactI18next)
  .init({
    resources: {
      "zh-TW": { translation: zhTW },
      "en-US": { translation: enUS }
    },
    lng: localStorage.getItem("lng") || "zh-TW",
    fallbackLng: "zh-TW",
    interpolation: {
      escapeValue: false
    }
  });

export default i18n;
