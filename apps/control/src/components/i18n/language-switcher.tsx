import { Languages } from "lucide-react";
import { useTranslation } from "react-i18next";
import { applyPlatformLanguage } from "@/lib/platform-preferences";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  defaultLanguage,
  normalizeLanguage,
  type SupportedLanguage,
} from "@/i18n/config";

export function LanguageSwitcher() {
  const { i18n, t } = useTranslation("common");
  const language =
    normalizeLanguage(i18n.resolvedLanguage ?? i18n.language) ??
    defaultLanguage;

  return (
    <Select
      value={language}
      onValueChange={(value) =>
        applyPlatformLanguage(value as SupportedLanguage)
      }
    >
      <SelectTrigger
        aria-label={t("language.label")}
        size="lg"
        className="min-w-36 bg-background/90"
      >
        <Languages className="size-4 text-muted-foreground" />
        <SelectValue />
      </SelectTrigger>
      <SelectContent align="end">
        <SelectItem value="en-US">{t("language.english")}</SelectItem>
        <SelectItem value="zh-CN">{t("language.simplifiedChinese")}</SelectItem>
        <SelectItem value="zh-TW">{t("language.traditionalChinese")}</SelectItem>
      </SelectContent>
    </Select>
  );
}
