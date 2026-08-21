import { definePlugin } from "nitro";
import { applyAuthenticationResponseHeaders } from "../auth/auth";

export default definePlugin((nitro) => {
  nitro.hooks.hook("response", async (response, event) => {
    applyAuthenticationResponseHeaders(event.req, response);
  });
});
