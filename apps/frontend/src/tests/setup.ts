import '@testing-library/jest-dom/vitest';
import { vi } from 'vitest';

// Mock i18next with all required exports
vi.mock('react-i18next', () => ({
  useTranslation: () => {
    return {
      t: (str: string) => str,
      i18n: {
        changeLanguage: () => new Promise(() => { }),
      },
    };
  },
  I18nextProvider: ({ children }: any) => children,
  initReactI18next: {
    type: '3rdParty',
    init: () => { },
  },
}));
