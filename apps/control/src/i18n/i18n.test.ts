import { describe, expect, it } from "vitest";
import {
  normalizeLanguage,
  resolveAcceptLanguage,
} from "./config";
import { createPlatformI18n } from "./create-i18n";
import { i18nResources } from "./resources";

function resourceKeys(
  value: Record<string, unknown>,
  prefix = "",
): string[] {
  return Object.entries(value).flatMap(([key, nested]) => {
    const path = prefix ? `${prefix}.${key}` : key;
    return nested && typeof nested === "object"
      ? resourceKeys(nested as Record<string, unknown>, path)
      : [path];
  });
}

describe("platform i18n", () => {
  it("normalizes supported browser language variants", () => {
    expect(normalizeLanguage("zh-Hans-CN")).toBe("zh-CN");
    expect(normalizeLanguage("en_GB")).toBe("en-US");
    expect(normalizeLanguage("ja-JP")).toBeNull();
  });

  it("resolves Accept-Language by quality and supported language", () => {
    expect(resolveAcceptLanguage("ja-JP, zh-CN;q=0.8, en-US;q=0.6")).toBe(
      "zh-CN",
    );
    expect(resolveAcceptLanguage("zh-CN;q=0.4, en-US;q=0.9")).toBe("en-US");
    expect(resolveAcceptLanguage("ja-JP, ko-KR;q=0.8")).toBeNull();
  });

  it("creates isolated language instances with typed namespaces", () => {
    const english = createPlatformI18n("en-US");
    const chinese = createPlatformI18n("zh-CN");

    expect(english).not.toBe(chinese);
    expect(english.t("defineAgent.title", { ns: "createInstance" })).toBe(
      "Define an Agent",
    );
    expect(chinese.t("defineAgent.title", { ns: "createInstance" })).toBe(
      "定义一个 Agent",
    );
  });

  it("keeps every supported language resource structurally complete", () => {
    expect(resourceKeys(i18nResources["zh-CN"]).sort()).toEqual(
      resourceKeys(i18nResources["en-US"]).sort(),
    );
  });

  it("interpolates values through the shared sidebar namespace", () => {
    const instance = createPlatformI18n("zh-CN");
    const t = instance.getFixedT("zh-CN", "sidebar");
    expect(t("account.openMenu", { displayName: "小林" })).toBe(
      "打开 小林 的账户菜单",
    );
  });

  it("loads Help UI copy from the same request-scoped instance", () => {
    const instance = createPlatformI18n("zh-CN");
    expect(instance.t("navigation.userGuides", { ns: "help" })).toBe(
      "使用文档",
    );
    expect(instance.t("topics.troubleshooting", { ns: "help" })).toBe(
      "故障排查",
    );
  });
});
