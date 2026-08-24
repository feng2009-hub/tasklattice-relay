import { definePlugin } from "nitro";
import { ensureInitialPlatformAdministrator } from "../auth/better-auth";

export default definePlugin(async () => {
  await ensureInitialPlatformAdministrator();
});
