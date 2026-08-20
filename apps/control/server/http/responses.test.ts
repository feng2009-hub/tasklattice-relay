import { describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { problemDetailsSchema } from "../api-contracts/schemas";
import { errorResponse, problemResponse } from "./responses";

describe("business API problem responses", () => {
  it("returns RFC 9457 content with no wildcard credential CORS", async () => {
    const response = problemResponse(404, "Instance not found.");
    expect(response.status).toBe(404);
    expect(response.headers.get("content-type")).toContain("application/problem+json");
    expect(response.headers.get("access-control-allow-origin")).toBeNull();
    expect(problemDetailsSchema.safeParse(await response.json()).success).toBe(true);
  });

  it("serializes Zod issues as structured validation errors", async () => {
    const failure = z.object({ name: z.string().min(3) }).safeParse({ name: "x" });
    if (failure.success) throw new Error("Expected validation to fail.");
    const response = errorResponse(failure.error);
    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({
      code: "validation_failed",
      errors: [{ path: "/name" }],
      status: 400,
    });
  });

  it("does not log expected client errors", () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => undefined);
    errorResponse(new Error("Resource not found."));
    expect(error).not.toHaveBeenCalled();
    error.mockRestore();
  });
});
