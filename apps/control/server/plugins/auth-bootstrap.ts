import { definePlugin } from "nitro";
import { ensureInitialSuperAdministrator } from "../auth/better-auth";

export default definePlugin(async () => {
  await ensureInitialSuperAdministrator();
});
