import { defineHandler } from "nitro";
import { publicAuthConfig } from "../../../../auth/auth";
import { jsonResponse, problemResponse } from "../../../../http/responses";

export default defineHandler(() => {
  try {
    return jsonResponse(publicAuthConfig());
  } catch (error) {
    return problemResponse(
      500,
      error instanceof Error ? error.message : "Invalid auth configuration.",
      { code: "auth_configuration_error" },
    );
  }
});
