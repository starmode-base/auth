import { z } from "zod";

/**
 * Client-side form gating. The server truth is the Convex function
 * validators.
 */
export const requestOtpSchema = z.object({
  identifier: z.email(),
});

export const verifyOtpSchema = z.object({
  identifier: z.email(),
  otp: z.string().length(6),
});
