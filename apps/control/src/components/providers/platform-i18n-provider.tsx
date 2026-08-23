import { useEffect, type ReactNode } from "react";
import type { i18n } from "i18next";
import { I18nextProvider, useTranslation } from "react-i18next";
import {
  getPlatformLanguage,
  PREFERENCES_CHANGED_EVENT,
} from "@/lib/platform-preferences";
import type { SupportedLanguage } from "@/i18n/config";

function PlatformLanguageSync() {
  const { i18n: instance } = useTranslation();

  useEffect(() => {
    const changeLanguage = (language: SupportedLanguage) => {
      document.documentElement.lang = language;
      if (instance.resolvedLanguage !== language) {
        void instance.changeLanguage(language);
      }
    };
    const handlePreferencesChanged = (event: Event) => {
      const detail = (event as CustomEvent<{ language?: SupportedLanguage }>)
        .detail;
      if (detail?.language) changeLanguage(detail.language);
    };

    changeLanguage(getPlatformLanguage());
    window.addEventListener(PREFERENCES_CHANGED_EVENT, handlePreferencesChanged);
    return () =>
      window.removeEventListener(
        PREFERENCES_CHANGED_EVENT,
        handlePreferencesChanged,
      );
  }, [instance]);

  return null;
}

export function PlatformI18nProvider({
  children,
  instance,
}: {
  children: ReactNode;
  instance: i18n;
}) {
  return (
    <I18nextProvider i18n={instance}>
      <PlatformLanguageSync />
      {children}
    </I18nextProvider>
  );
}

