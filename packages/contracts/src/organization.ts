import { z } from "zod";

export const scopedEntityNameLimits = {
  min: 2,
  max: 80,
} as const;

export const scopedEntityIdLimits = {
  min: 2,
  max: 48,
} as const;

const forbiddenDisplayNameCharacters = /[\/\\\p{Cc}]/u;
const letterOrNumber = /[\p{L}\p{N}]/u;
const scopedEntityIdPattern = /^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/;

export function normalizeScopedEntityName(value: string): string {
  return value
    .normalize("NFKC")
    .trim()
    .replace(/[\p{Zs}\t]+/gu, " ");
}

function createScopedEntityNameSchema(label: "Department" | "Project") {
  return z.string()
    .transform(normalizeScopedEntityName)
    .pipe(z.string()
      .min(
        scopedEntityNameLimits.min,
        `${label} name must contain at least ${scopedEntityNameLimits.min} characters.`,
      )
      .max(
        scopedEntityNameLimits.max,
        `${label} name must contain at most ${scopedEntityNameLimits.max} characters.`,
      )
      .refine(
        (value) => !forbiddenDisplayNameCharacters.test(value),
        `${label} name cannot contain slashes, backslashes, or control characters.`,
      )
      .refine(
        (value) => letterOrNumber.test(value),
        `${label} name must include at least one letter or number.`,
      ));
}

function createScopedEntityIdSchema(label: "Department" | "Project") {
  return z.string()
    .trim()
    .min(
      scopedEntityIdLimits.min,
      `${label} ID must contain at least ${scopedEntityIdLimits.min} characters.`,
    )
    .max(
      scopedEntityIdLimits.max,
      `${label} ID must contain at most ${scopedEntityIdLimits.max} characters.`,
    )
    .regex(
      scopedEntityIdPattern,
      `${label} ID must start and end with a lowercase letter or number and contain only lowercase letters, numbers, or hyphens.`,
    );
}

export const departmentNameSchema = createScopedEntityNameSchema("Department");
export const projectNameSchema = createScopedEntityNameSchema("Project");
export const departmentIdSchema = createScopedEntityIdSchema("Department");
export const projectIdSchema = createScopedEntityIdSchema("Project");

const optionalScopedEntityFilter = z.string()
  .trim()
  .max(scopedEntityIdLimits.max)
  .optional()
  .transform((value) => value || undefined);

export const platformPeopleQuerySchema = z.object({
  departmentId: optionalScopedEntityFilter,
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
  projectId: optionalScopedEntityFilter,
  search: z.string().trim().max(100).default(""),
}).strict();

export type PlatformPeopleQuery = z.infer<typeof platformPeopleQuerySchema>;

export function scopedEntityIdFromName(name: string): string {
  return normalizeScopedEntityName(name)
    .normalize("NFKD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, scopedEntityIdLimits.max);
}
