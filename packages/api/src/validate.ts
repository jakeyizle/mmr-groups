import { zValidator } from "@hono/zod-validator";
import type { ValidationTargets } from "hono";
import type { ZodType } from "zod";

import { apiError } from "./errors";

/** zValidator with the PLAN §8 error shape. */
export function validate<
  T extends ZodType,
  Target extends keyof ValidationTargets,
>(target: Target, schema: T) {
  return zValidator(target, schema, (result, c) => {
    if (!result.success) {
      return apiError(
        c,
        400,
        "invalid",
        "Validation failed",
        result.error.issues,
      );
    }
  });
}
