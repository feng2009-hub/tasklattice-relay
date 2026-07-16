import { defineHandler } from "nitro";
import { jsonResponse } from "../../http/responses";

export default defineHandler(() =>
  jsonResponse({ ok: true, runtime: "openshell" }),
);
