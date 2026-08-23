import type { ThemePreference } from "@/services/personal-profile";
import {
  defaultLanguage,
  LANGUAGE_COOKIE_NAME,
  normalizeLanguage,
  type SupportedLanguage,
} from "@/i18n/config";

const themeKey = "tali.account.theme";
const timezoneKey = "tali.account.timezone";
export const PREFERENCES_CHANGED_EVENT = "tali:preferences-changed";

export function detectedTimezone(): string {
  if (typeof Intl === "undefined") return "UTC";
  return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
}

export function getPlatformTheme(): ThemePreference {
  if (typeof window === "undefined") return "system";
  const value = window.localStorage.getItem(themeKey);
  return value === "light" || value === "dark" ? value : "system";
}

export function getPlatformLanguage(): SupportedLanguage {
  if (typeof window === "undefined") return defaultLanguage;
  return (
    normalizeLanguage(window.localStorage.getItem(LANGUAGE_COOKIE_NAME)) ??
    normalizeLanguage(document.documentElement.lang) ??
    defaultLanguage
  );
}

export function getPlatformTimezone(): string {
  if (typeof window === "undefined") return "UTC";
  return window.localStorage.getItem(timezoneKey) || detectedTimezone();
}

function persistPlatformLanguage(language: SupportedLanguage): void {
  window.localStorage.setItem(LANGUAGE_COOKIE_NAME, language);
  const secure = window.location.protocol === "https:" ? "; Secure" : "";
  document.cookie = `${LANGUAGE_COOKIE_NAME}=${encodeURIComponent(language)}; Path=/; Max-Age=31536000; SameSite=Lax${secure}`;
  document.documentElement.lang = language;
}

export function applyPlatformLanguage(language: SupportedLanguage): void {
  if (typeof window === "undefined") return;
  persistPlatformLanguage(language);
  window.dispatchEvent(
    new CustomEvent(PREFERENCES_CHANGED_EVENT, { detail: { language } }),
  );
}

export function applyPlatformPreferences(input: {
  language: SupportedLanguage;
  theme: ThemePreference;
  timezone: string;
}): void {
  if (typeof window === "undefined") return;
  persistPlatformLanguage(input.language);
  window.localStorage.setItem(themeKey, input.theme);
  window.localStorage.setItem(timezoneKey, input.timezone);
  const dark =
    input.theme === "dark" ||
    (input.theme === "system" &&
      window.matchMedia("(prefers-color-scheme: dark)").matches);
  document.documentElement.classList.toggle("dark", dark);
  document.documentElement.style.colorScheme = dark ? "dark" : "light";
  window.dispatchEvent(
    new CustomEvent(PREFERENCES_CHANGED_EVENT, { detail: input }),
  );
}

export function formatPlatformDate(
  value: string | number | Date,
  options: Intl.DateTimeFormatOptions = {},
): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return new Intl.DateTimeFormat(getPlatformLanguage(), {
    dateStyle: "medium",
    timeZone: getPlatformTimezone(),
    ...options,
  }).format(date);
}

export function formatPlatformDateTime(
  value: string | number | Date,
  options: Intl.DateTimeFormatOptions = {},
): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return new Intl.DateTimeFormat(getPlatformLanguage(), {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: getPlatformTimezone(),
    ...options,
  }).format(date);
}
