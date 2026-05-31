import { SignJWT, jwtVerify } from "jose";
import type { JwtPayload } from "./types.ts";

export async function verifyGoogleToken(
  code: string,
  codeVerifier: string,
  clientId: string,
  redirectUri: string
): Promise<{ sub: string; email: string }> {
  const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id:     clientId,
      redirect_uri:  redirectUri,
      grant_type:    "authorization_code",
      code_verifier: codeVerifier,
    }),
  });

  if (!tokenRes.ok) {
    const err = await tokenRes.text();
    throw new Error(`Google token exchange failed: ${err}`);
  }

  const tokens = await tokenRes.json() as { id_token?: string };
  if (!tokens.id_token) throw new Error("No id_token in Google response");

  const [, payloadB64] = tokens.id_token.split(".");
  const payload = JSON.parse(atob(payloadB64));

  if (payload.aud !== clientId) throw new Error("Token audience mismatch");

  return { sub: payload.sub as string, email: payload.email as string };
}

export async function issueJwt(
  sub: string,
  email: string,
  secret: string
): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign", "verify"]
  );

  return new SignJWT({ sub, email })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("30d")
    .sign(key);
}

export async function verifyJwt(
  token: string,
  secret: string
): Promise<JwtPayload> {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign", "verify"]
  );

  const { payload } = await jwtVerify(token, key);
  return payload as unknown as JwtPayload;
}

export async function authMiddleware(
  request: Request,
  secret: string
): Promise<JwtPayload | null> {
  const auth = request.headers.get("Authorization");
  if (!auth?.startsWith("Bearer ")) return null;

  try {
    return await verifyJwt(auth.slice(7), secret);
  } catch {
    return null;
  }
}
