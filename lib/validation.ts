import { z } from "zod";
export const recentQuery = z.object({
  mode: z.enum(["hype", "focus", "chill"]).optional(),
  source: z
    .enum(["auto", "on_repeat", "top", "recent", "repeat_derived"])
    .optional(),
  pl_offset: z.coerce.number().min(0).max(2000).optional(),
  pl_page: z.coerce.number().min(0).max(40).optional(),
  or_id: z
    .string()
    .regex(/[0-9A-Za-z]{22}/)
    .optional(), // playlist id
});
