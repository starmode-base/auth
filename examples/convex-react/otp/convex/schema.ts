import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export default defineSchema({
  users: defineTable({
    email: v.string(),
  }).index("by_email", ["email"]),

  sessions: defineTable({
    sessionId: v.string(),
    userId: v.string(),
    expiresAt: v.number(),
  })
    .index("by_sessionId", ["sessionId"])
    .index("by_userId", ["userId"]),

  otps: defineTable({
    identifier: v.string(),
    otp: v.string(),
    expiresAt: v.number(),
    attempts: v.number(),
  }).index("by_identifier", ["identifier"]),
});
