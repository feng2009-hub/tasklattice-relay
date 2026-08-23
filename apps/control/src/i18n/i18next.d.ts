import "i18next";
import { i18nResources } from "./resources";

declare module "i18next" {
  interface CustomTypeOptions {
    defaultNS: "common";
    resources: (typeof i18nResources)["en-US"];
    returnNull: false;
  }
}

