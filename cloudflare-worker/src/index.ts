import { Hono } from "hono";
import { cors } from "hono/cors";
import type { Env, SyncPayload } from "./types.ts";
import { verifyGoogleToken, issueJwt, authMiddleware } from "./auth.ts";
import { upsertUser, getSyncData, putSyncData, deleteUserData } from "./sync.ts";

const app = new Hono<{ Bindings: Env }>();

app.use("*", cors({ origin: "*" }));

app.post("/auth/google", async (c) => {
  const body = await c.req.json<{ code: string; codeVerifier: string }>();

  if (!body.code || !body.codeVerifier) {
    return c.json({ error: "Missing code or codeVerifier" }, 400);
  }

  try {
    const { sub, email } = await verifyGoogleToken(
      body.code,
      body.codeVerifier,
      c.env.GOOGLE_CLIENT_ID
    );

    await upsertUser(c.env.DB, sub, email);
    const token = await issueJwt(sub, email, c.env.WORKER_SECRET);

    // Return server timestamp so client can use it as lastSyncedAt (Gap 4 fix)
    return c.json({ token, email, serverTime: Date.now() });
  } catch (err) {
    console.error("Auth error:", err);
    return c.json({ error: "Authentication failed" }, 401);
  }
});

app.get("/sync", async (c) => {
  const user = await authMiddleware(c.req.raw, c.env.WORKER_SECRET);
  if (!user) return c.json({ error: "Unauthorized" }, 401);

  const data = await getSyncData(c.env.DB, user.sub);
  return c.json({ data, serverTime: Date.now() });
});

app.put("/sync", async (c) => {
  const user = await authMiddleware(c.req.raw, c.env.WORKER_SECRET);
  if (!user) return c.json({ error: "Unauthorized" }, 401);

  const payload = await c.req.json<SyncPayload & { expected_last_modified_at?: number }>();

  // Validate basic structure (Gap 13 fix)
  if (
    !Array.isArray(payload.collection) ||
    !Array.isArray(payload.wishlist) ||
    !Array.isArray(payload.locations)
  ) {
    return c.json({ error: "Invalid payload structure" }, 400);
  }

  // Optimistic locking (Gap 5 fix): check expected_last_modified_at if provided
  if (payload.expected_last_modified_at !== undefined) {
    const current = await getSyncData(c.env.DB, user.sub);
    if (current && current.last_modified_at !== payload.expected_last_modified_at) {
      return c.json({ error: "Conflict", serverTime: Date.now() }, 409);
    }
  }

  await putSyncData(c.env.DB, user.sub, payload);
  return c.json({ ok: true, serverTime: Date.now() });
});

app.delete("/sync", async (c) => {
  const user = await authMiddleware(c.req.raw, c.env.WORKER_SECRET);
  if (!user) return c.json({ error: "Unauthorized" }, 401);

  await deleteUserData(c.env.DB, user.sub);
  return c.json({ ok: true });
});

export default app;
