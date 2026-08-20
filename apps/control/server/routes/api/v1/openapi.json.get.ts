import { defineHandler } from "nitro";
import { openApiDocument } from "../../../api-contracts/openapi";
import { jsonResponse } from "../../../http/responses";

export default defineHandler(() => jsonResponse(openApiDocument));
