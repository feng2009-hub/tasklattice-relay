import { defineHandler } from "nitro";
import { profileInputSchema } from "../../../../api-contracts/schemas";
import { requireAuth, unauthorizedResponse } from "../../../../auth/auth";
import { errorResponse, jsonResponse } from "../../../../http/responses";
import { PersonalProfileService } from "../../../../profiles/personal-profile-service";

export default defineHandler(async (event) => {
  let auth;
  try {
    auth = await requireAuth(event.req);
  } catch (error) {
    return unauthorizedResponse(error);
  }
  try {
    const input = profileInputSchema.parse(await event.req.json());
    return jsonResponse(await new PersonalProfileService().update(auth, input));
  } catch (error) {
    return errorResponse(error);
  }
});
