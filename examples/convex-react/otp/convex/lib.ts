/**
 * Adapter construction over the invocation-scoped ctx. Convex hands database
 * access to each function invocation, so write-capable auth is built inside
 * mutation handlers and queries use the session reader alone.
 */
import {
  makeAuth,
  makeOpaqueSession,
  makeOpaqueSessionResolver,
  makeOtp,
  makeOtpStrategy,
} from "@starmode/auth2";
import type { Otp, SessionReadStorage, SessionStorage } from "@starmode/auth2";
import type { MutationCtx, QueryCtx } from "./_generated/server";

const SESSION_TTL = 30 * 24 * 60 * 60 * 1000;
const OTP_TTL = 10 * 60 * 1000;
const OTP_ATTEMPTS = 3;

function sessionReadStorage(ctx: QueryCtx): SessionReadStorage {
  return {
    get: async (sessionId) => {
      const doc = await ctx.db
        .query("sessions")
        .withIndex("by_sessionId", (q) => q.eq("sessionId", sessionId))
        .unique();

      return doc === null
        ? null
        : {
            sessionId: doc.sessionId,
            userId: doc.userId,
            expiresAt: new Date(doc.expiresAt),
          };
    },
  };
}

function sessionStorage(ctx: MutationCtx): SessionStorage {
  return {
    ...sessionReadStorage(ctx),

    store: async (record) => {
      const existing = await ctx.db
        .query("sessions")
        .withIndex("by_sessionId", (q) => q.eq("sessionId", record.sessionId))
        .unique();

      const doc = {
        sessionId: record.sessionId,
        userId: record.userId,
        expiresAt: record.expiresAt.getTime(),
      };

      if (existing === null) {
        await ctx.db.insert("sessions", doc);
      } else {
        await ctx.db.patch(existing._id, doc);
      }
    },

    delete: async (sessionId) => {
      const existing = await ctx.db
        .query("sessions")
        .withIndex("by_sessionId", (q) => q.eq("sessionId", sessionId))
        .unique();

      if (existing !== null) {
        await ctx.db.delete(existing._id);
      }
    },
  };
}

export function otpFor(ctx: MutationCtx): Otp {
  return makeOtp({
    storage: {
      store: async (record) => {
        const existing = await ctx.db
          .query("otps")
          .withIndex("by_identifier", (q) =>
            q.eq("identifier", record.identifier),
          )
          .unique();

        const doc = {
          identifier: record.identifier,
          otp: record.otp,
          expiresAt: record.expiresAt.getTime(),
          attempts: record.attempts,
        };

        if (existing === null) {
          await ctx.db.insert("otps", doc);
        } else {
          await ctx.db.patch(existing._id, doc);
        }
      },

      take: async (identifier) => {
        const doc = await ctx.db
          .query("otps")
          .withIndex("by_identifier", (q) => q.eq("identifier", identifier))
          .unique();

        if (doc === null) return null;

        await ctx.db.delete(doc._id);

        return {
          identifier: doc.identifier,
          otp: doc.otp,
          expiresAt: new Date(doc.expiresAt),
          attempts: doc.attempts,
        };
      },
    },
    delivery: {
      send: async (identifier, otp) => {
        console.log(`[OTP] ${identifier}: ${otp}`);
      },
    },
    ttl: OTP_TTL,
    attempts: OTP_ATTEMPTS,
  });
}

async function upsertUser(ctx: MutationCtx, email: string) {
  const existing = await ctx.db
    .query("users")
    .withIndex("by_email", (q) => q.eq("email", email))
    .unique();

  if (existing !== null) {
    const userId: string = existing._id;
    return { userId, isNew: false };
  }

  const userId: string = await ctx.db.insert("users", { email });
  return { userId, isNew: true };
}

export function authFor(ctx: MutationCtx) {
  const emailOtp = otpFor(ctx);

  return makeAuth(
    makeOpaqueSession({ storage: sessionStorage(ctx), ttl: SESSION_TTL }),
    (kernel) => ({
      email: makeOtpStrategy(kernel, {
        request: async ({ identifier }) => {
          await emailOtp.request(identifier);
          return { success: true };
        },
        authenticate: async ({ identifier, otp }) => {
          if (!(await emailOtp.verify(identifier, otp))) {
            return { success: false, error: "invalid_otp" };
          }

          return { success: true, data: await upsertUser(ctx, identifier) };
        },
      }),
    }),
  );
}

export function sessionReaderFor(ctx: QueryCtx) {
  return makeOpaqueSessionResolver({ storage: sessionReadStorage(ctx) });
}
