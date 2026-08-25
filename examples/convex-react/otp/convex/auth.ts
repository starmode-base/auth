import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { authFor, otpFor, sessionReaderFor } from "./lib";

const token = v.union(v.string(), v.null());

/**
 * Sends an OTP to the identifier. The demo delivers to the backend console.
 */
export const requestOtp = mutation({
  args: { identifier: v.string() },
  handler: (ctx, args) => authFor(ctx).strategies.email.request(args),
});

/**
 * Authenticates with the OTP, which upserts the user and establishes a
 * session. The client keeps the returned token and passes it to every
 * function that needs identity.
 */
export const verifyOtp = mutation({
  args: { identifier: v.string(), otp: v.string() },
  handler: async (ctx, args) => {
    const result = await authFor(ctx).strategies.email.authenticate(args);

    if (!result.success) return { success: false as const };

    return {
      success: true as const,
      isNew: result.data.user.isNew,
      token: result.data.session.token,
    };
  },
});

/**
 * Verifies OTP for the new email, then swaps it on the authenticated user.
 * Requires a valid session token — the OTP proves ownership of the new
 * address.
 */
export const changeEmail = mutation({
  args: { token, identifier: v.string(), otp: v.string() },
  handler: async (ctx, args) => {
    const auth = authFor(ctx);

    const identity = await auth.session.get(args.token);
    if (!identity) return { success: false as const };

    const verified = await otpFor(ctx).verify(args.identifier, args.otp);
    if (!verified) return { success: false as const };

    const userId = ctx.db.normalizeId("users", identity.userId);
    if (!userId) return { success: false as const };

    await ctx.db.patch(userId, { email: args.identifier });
    return { success: true as const };
  },
});

/**
 * Ends the session identified by the token.
 */
export const signOut = mutation({
  args: { token },
  handler: async (ctx, args) => {
    await authFor(ctx).session.end(args.token);
  },
});

/**
 * Deletes every session for the current user.
 */
export const signOutAll = mutation({
  args: { token },
  handler: async (ctx, args) => {
    const identity = await authFor(ctx).session.get(args.token);
    if (!identity) return;

    const sessions = await ctx.db
      .query("sessions")
      .withIndex("by_userId", (q) => q.eq("userId", identity.userId))
      .collect();

    for (const session of sessions) {
      await ctx.db.delete(session._id);
    }
  },
});

/**
 * Returns the current user if the token resolves, or null otherwise.
 * Queries are read-only, so identity comes from the session reader alone.
 */
export const getViewer = query({
  args: { token },
  handler: async (ctx, args) => {
    const identity = await sessionReaderFor(ctx).resolve(args.token);
    if (!identity) return null;

    const userId = ctx.db.normalizeId("users", identity.userId);
    if (!userId) return null;

    const user = await ctx.db.get(userId);
    if (!user) return null;

    return { userId: identity.userId, email: user.email };
  },
});
