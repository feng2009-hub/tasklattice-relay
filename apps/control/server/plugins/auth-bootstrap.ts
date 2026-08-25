import { definePlugin } from "nitro";
import { ensureInitialPlatformAdministrator } from "../auth/better-auth";
import { ensurePlatformRuntimeSettings } from "../platform/platform-runtime-config";

export default definePlugin(async () => {
  await ensurePlatformRuntimeSettings();
  await ensureInitialPlatformAdministrator();
});
