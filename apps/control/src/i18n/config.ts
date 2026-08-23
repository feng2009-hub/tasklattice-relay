export const supportedLanguages = ["en-US", "zh-CN", "zh-TW"] as const;

export type SupportedLanguage = (typeof supportedLanguages)[number];

export const defaultLanguage: SupportedLanguage = "en-US";
export const LANGUAGE_COOKIE_NAME = "tali.account.language";

export function normalizeLanguage(
  value: string | null | undefined,
): SupportedLanguage | null {
  if (!value) return null;
  const normalized = value.trim().replaceAll("_", "-").toLowerCase();
  if (
    normalized === "zh-tw" ||
    normalized.startsWith("zh-tw-") ||
    normalized === "zh-hk" ||
    normalized.startsWith("zh-hk-") ||
    normalized === "zh-mo" ||
    normalized.startsWith("zh-mo-") ||
    normalized === "zh-hant" ||
    normalized.startsWith("zh-hant-")
  ) {
    return "zh-TW";
  }
  if (normalized === "zh" || normalized.startsWith("zh-")) return "zh-CN";
  if (normalized === "en" || normalized.startsWith("en-")) return "en-US";
  return null;
}

export function resolveAcceptLanguage(
  header: string | null | undefined,
): SupportedLanguage | null {
  if (!header) return null;

  return (
    header
      .split(",")
      .map((entry, index) => {
        const [tag, ...parameters] = entry.trim().split(";");
        const quality = parameters.reduce((current, parameter) => {
          const [key, rawValue] = parameter.trim().split("=");
          if (key !== "q") return current;
          const parsed = Number(rawValue);
          return Number.isFinite(parsed) ? parsed : 0;
        }, 1);
        return { index, language: normalizeLanguage(tag), quality };
      })
      .filter(
        (
          entry,
        ): entry is {
          index: number;
          language: SupportedLanguage;
          quality: number;
        } => Boolean(entry.language) && entry.quality > 0,
      )
      .sort(
        (left, right) =>
          right.quality - left.quality || left.index - right.index,
      )[0]?.language ?? null
  );
}
