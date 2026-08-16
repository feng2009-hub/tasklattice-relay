import { useSyncExternalStore } from "react";
import type { AccountLanguage } from "@/services/personal-profile";
import {
  getPlatformLanguage,
  PREFERENCES_CHANGED_EVENT,
} from "@/lib/platform-preferences";

function subscribe(onStoreChange: () => void): () => void {
  window.addEventListener(PREFERENCES_CHANGED_EVENT, onStoreChange);
  return () =>
    window.removeEventListener(PREFERENCES_CHANGED_EVENT, onStoreChange);
}

function getServerLanguage(): AccountLanguage {
  return "en-US";
}

export function usePlatformLanguage(): AccountLanguage {
  return useSyncExternalStore(subscribe, getPlatformLanguage, getServerLanguage);
}
