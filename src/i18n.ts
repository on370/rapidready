import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import LanguageDetector from 'i18next-browser-languagedetector';

import commonEN from './locales/en/common.json';
import settingsEN from './locales/en/settings.json';
import helpEN from './locales/en/help.json';

import commonDE from './locales/de/common.json';
import settingsDE from './locales/de/settings.json';
import helpDE from './locales/de/help.json';

i18n
  .use(LanguageDetector)
  .use(initReactI18next)
  .init({
    resources: {
      en: {
        common: commonEN,
        settings: settingsEN,
        help: helpEN
      },
      de: {
        common: commonDE,
        settings: settingsDE,
        help: helpDE
      }
    },
    ns: ['common', 'settings', 'help'],
    defaultNS: 'common',
    fallbackLng: 'en',
    interpolation: {
      escapeValue: false // React escapes by default
    }
  });

export default i18n;
