import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { openUrl } from "@tauri-apps/plugin-opener";

const GOOGLE_CLIENT_ID = "67040759438-p4utnf2bdnucnc5p2t5asmd81q3o99j3.apps.googleusercontent.com";
export const WORKER_URL = "https://vg-collection-sync.rahmanmarwan8.workers.dev";

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

  const params = new URLSearchParams({
    client_id:             GOOGLE_CLIENT_ID,
    redirect_uri:          "vgcollection://auth/callback",
    response_type:         "code",
    scope:                 "openid email",
    code_challenge:        codeChallenge,
    code_challenge_method: "S256",
    prompt:                "select_account",
  });

  const authUrl = `https://accounts.google.com/o/oauth2/v2/auth?${params}`;
  await openUrl(authUrl);

  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      unlisten();
      reject(new Error("Login timeout — tidak ada callback dalam 5 menit"));
    }, 5 * 60 * 1000);

    let unlisten: () => void;

    listen<string>("deep-link://new-url", async ({ payload: url }) => {
      clearTimeout(timeout);
      unlisten();

      try {
        const parsed = new URL(url);
        const code   = parsed.searchParams.get("code");
        if (!code) throw new Error("No authorization code in callback URL");

        const res = await fetch(`${WORKER_URL}/auth/google`, {
          method:  "POST",
          headers: { "Content-Type": "application/json" },
          body:    JSON.stringify({ code, codeVerifier }),
        });

        if (!res.ok) {
          // Gap 2: detect 401 → session expired
          throw new Error(`Worker auth failed: ${res.status}`);
        }

        const { token, email } = await res.json() as { token: string; email: string };

        const session: AuthSession = {
          token,
          email,
          expiresAt: Date.now() + 30 * 24 * 60 * 60 * 1000,
        };

        await saveSession(session);
        resolve(session);
      } catch (err) {
        reject(err);
      }
    }).then((fn) => { unlisten = fn; });
  });
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
