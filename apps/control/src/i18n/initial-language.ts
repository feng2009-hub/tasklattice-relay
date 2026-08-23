import { createIsomorphicFn } from "@tanstack/react-start";
import {
  getCookie,
  getRequestHeader,
} from "@tanstack/react-start/server";
import {
  defaultLanguage,
  LANGUAGE_COOKIE_NAME,
  normalizeLanguage,
  resolveAcceptLanguage,
  type SupportedLanguage,
} from "./config";

export const getInitialLanguage = createIsomorphicFn()
  .server((): SupportedLanguage => {
    try {
      return (
        normalizeLanguage(getCookie(LANGUAGE_COOKIE_NAME)) ??
        resolveAcceptLanguage(getRequestHeader("accept-language")) ??
        defaultLanguage
      );
    } catch {
      // Router-focused tests and build-time callers do not have a Start request.
      return defaultLanguage;
    }
  })
  .client((): SupportedLanguage => {
    return (
      normalizeLanguage(document.documentElement.lang) ??
      normalizeLanguage(window.localStorage.getItem(LANGUAGE_COOKIE_NAME)) ??
      resolveAcceptLanguage(window.navigator.languages.join(",")) ??
      defaultLanguage
    );
  });
