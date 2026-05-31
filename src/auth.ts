import { invoke } from "@tauri-apps/api/core";
import { once } from "@tauri-apps/api/event";
import { openUrl } from "@tauri-apps/plugin-opener";

const OAUTH_CALLBACK_EVENT = "oauth-callback";
const _isAndroid = navigator.userAgent.includes("Android");

// Waits for OAuth callback URL — uses Tauri event (desktop) or file polling on focus (Android)
function _waitForOAuthCallback(): Promise<string> {
  return new Promise<string>((resolve, reject) => {
    let settled = false;
    const settle = (url: string) => {
      if (settled) return;
      settled = true;
      unlistenEvent();
      window.removeEventListener("focus", onFocus);
      resolve(url);
    };

    const timeout = setTimeout(() => {
      if (settled) return;
      settled = true;
      unlistenEvent();
      window.removeEventListener("focus", onFocus);
      reject(new Error("Login timeout — return to the app after signing in"));
    }, 5 * 60 * 1000);

    // Tauri event — reliable on desktop, may fail on Android background
    let unlistenEvent = () => {};
    once<string>(OAUTH_CALLBACK_EVENT, ({ payload }) => {
      clearTimeout(timeout);
      settle(payload);
    }).then((fn) => { unlistenEvent = fn; });

    // Android fallback: poll pending-oauth.txt when app regains focus
    const onFocus = async () => {
      if (settled) return;
      const cmd = _isAndroid ? "read_pending_oauth_android" : "read_pending_oauth";
      const url = await invoke<string | null>(cmd).catch(() => null);
      if (url) { clearTimeout(timeout); settle(url); }
    };
    window.addEventListener("focus", onFocus);
  });
}

const GOOGLE_CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID as string;
export const WORKER_URL = import.meta.env.VITE_WORKER_URL as string;

export interface AuthSession {
  token:     string;
  email:     string;
  expiresAt: number;
}

// ── PKCE helpers ──────────────────────────────────────────────────────────────

function generateCodeVerifier(): string {
  const array = new Uint8Array(48);
  crypto.getRandomValues(array);
  return btoa(String.fromCharCode(...array))
    .replace(/\+/g, "-").replace(/\//g, "_").replace(/=/g, "");
}

async function generateCodeChallenge(verifier: string): Promise<string> {
  const data = new TextEncoder().encode(verifier);
  const hash = await crypto.subtle.digest("SHA-256", data);
  return btoa(String.fromCharCode(...new Uint8Array(hash)))
    .replace(/\+/g, "-").replace(/\//g, "_").replace(/=/g, "");
}

// ── Session storage ───────────────────────────────────────────────────────────

export async function loadSession(): Promise<AuthSession | null> {
  try {
    const dir  = await invoke<string>("get_userdata_dir");
    const text = await invoke<string | null>("read_text_file", { path: `${dir}/auth.json` });
    if (!text) return null;
    const session = JSON.parse(text) as AuthSession;
    if (session.expiresAt < Date.now()) return null;
    return session;
  } catch {
    return null;
  }
}

export async function saveSession(session: AuthSession): Promise<void> {
  const dir = await invoke<string>("get_userdata_dir");
  await invoke<void>("write_text_file", {
    path:    `${dir}/auth.json`,
    content: JSON.stringify(session, null, 2),
  });
}

export async function clearSession(): Promise<void> {
  try {
    const dir = await invoke<string>("get_userdata_dir");
    await invoke<void>("delete_file", { path: `${dir}/auth.json` });
  } catch { /* already gone */ }
}

// ── Google OAuth PKCE flow ────────────────────────────────────────────────────

export async function signInWithGoogle(): Promise<AuthSession> {
  const codeVerifier  = generateCodeVerifier();
  const codeChallenge = await generateCodeChallenge(codeVerifier);

  // Loopback works on both desktop and Android (same-device localhost)
  const port = await invoke<number>("start_oauth_listener");
  const redirectUri = `http://127.0.0.1:${port}/callback`;

  const callbackPromise = _waitForOAuthCallback();

  const params = new URLSearchParams({
    client_id:             GOOGLE_CLIENT_ID,
    redirect_uri:          redirectUri,
    response_type:         "code",
    scope:                 "openid email",
    code_challenge:        codeChallenge,
    code_challenge_method: "S256",
    prompt:                "select_account",
  });

  await openUrl(`https://accounts.google.com/o/oauth2/v2/auth?${params}`);

  const callbackUrl = await callbackPromise;

  const parsed = new URL(callbackUrl);
  const code   = parsed.searchParams.get("code");
  if (!code) throw new Error("No authorization code in callback URL");

  const res = await fetch(`${WORKER_URL}/auth/google`, {
    method:  "POST",
    headers: { "Content-Type": "application/json" },
    body:    JSON.stringify({ code, codeVerifier, redirectUri }),
  });

  if (!res.ok) {
    const body = await res.json().catch(() => ({})) as { detail?: string };
    throw new Error(`Worker auth failed: ${res.status} — ${body.detail ?? "unknown"}`);
  }

  const { token, email } = await res.json() as { token: string; email: string };

  const session: AuthSession = {
    token,
    email,
    expiresAt: Date.now() + 30 * 24 * 60 * 60 * 1000,
  };

  await saveSession(session);
  return session;
}

export async function signOut(): Promise<void> {
  const session = await loadSession();
  if (session) {
    try {
      await fetch(`${WORKER_URL}/sync`, {
        method:  "DELETE",
        headers: { Authorization: `Bearer ${session.token}` },
      });
    } catch { /* network error saat logout — tetap hapus lokal */ }
  }
  await clearSession();
}
