import { defineHandler } from "nitro";
import { auth } from "../../../auth/better-auth";

export default defineHandler((event) => auth().handler(event.req));
