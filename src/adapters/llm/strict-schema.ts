/**
 * OpenAI strict structured outputs accept only a narrow JSON-schema subset:
 * every property must be listed in `required`, and "absent" must be expressed
 * as an explicit null. Our domain schemas use .default() and .optional(),
 * which zod marks as not-required — strict mode rejects that.
 *
 * strictify() rewrites a schema INTO that subset instead of turning strict
 * mode off:
 *   .default(x)  → inner type          (the model must supply the value)
 *   .optional()  → .nullable()         (the model outputs null when unknown)
 * stripNulls() then removes the nulls from the reply so the ORIGINAL domain
 * schema — defaults, optionals and all — re-validates the data. Zod stays the
 * gate; OpenAI additionally guarantees the shape.
 */
import { z } from "zod";

type AnyDef = { type?: string; innerType?: z.ZodType; shape?: Record<string, z.ZodType>; element?: z.ZodType };
const defOf = (s: z.ZodType): AnyDef => (s as unknown as { def?: AnyDef; _def?: AnyDef }).def ?? (s as unknown as { _def?: AnyDef })._def ?? {};

export function strictify(schema: z.ZodType): z.ZodType {
  const def = defOf(schema);
  switch (def.type) {
    case "default":
      return strictify(def.innerType!);
    case "optional":
    case "nullable":
      return strictify(def.innerType!).nullable();
    case "object": {
      const shape: Record<string, z.ZodType> = {};
      for (const [k, v] of Object.entries(def.shape!)) shape[k] = strictify(v);
      return z.object(shape);
    }
    case "array":
      return z.array(strictify(def.element!));
    default:
      return schema;
  }
}

/** Remove null-valued keys so optional-as-null converts back to "absent". */
export function stripNulls(v: unknown): unknown {
  if (Array.isArray(v)) return v.map(stripNulls);
  if (v && typeof v === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, val] of Object.entries(v)) if (val !== null) out[k] = stripNulls(val);
    return out;
  }
  return v;
}
