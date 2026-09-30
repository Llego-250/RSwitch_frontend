// Thin client for the FastAPI backend (backend/app). Base URL comes from
// VITE_API_URL; the bearer token is the one AuthContext stored after login.

export const API_URL = (import.meta.env.VITE_API_URL as string | undefined) ?? "http://localhost:8000";

const STORAGE_KEY = "rdip_auth_session";

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

export function getToken(): string | null {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    return saved ? (JSON.parse(saved).token ?? null) : null;
  } catch {
    return null;
  }
}

async function request(path: string, init: RequestInit = {}, token = getToken()): Promise<Response> {
  const headers = new Headers(init.headers);
  if (token) headers.set("Authorization", `Bearer ${token}`);
  if (init.body && !(init.body instanceof FormData) && !(init.body instanceof URLSearchParams)) {
    headers.set("Content-Type", "application/json");
  }
  let res: Response;
  try {
    res = await fetch(`${API_URL}${path}`, { ...init, headers });
  } catch {
    throw new ApiError(0, `Can't reach the RDIP API at ${API_URL}. Is the backend running?`);
  }
  if (!res.ok) {
    let detail = res.statusText;
    try {
      const body = await res.json();
      detail = typeof body.detail === "string" ? body.detail : JSON.stringify(body.detail);
    } catch {
      /* non-JSON error body */
    }
    if (res.status === 401 && !path.startsWith("/auth/token") && !path.startsWith("/auth/mfa/verify")) {
      window.dispatchEvent(new Event("rdip:unauthorized"));
    }
    throw new ApiError(res.status, detail);
  }
  return res;
}

export const api = {
  get: async <T>(path: string, token?: string | null): Promise<T> => (await request(path, {}, token ?? getToken())).json(),
  post: async <T>(path: string, body?: unknown): Promise<T> =>
    (await request(path, { method: "POST", body: body instanceof FormData ? body : JSON.stringify(body ?? {}) })).json(),
  patch: async <T>(path: string, body: unknown): Promise<T> =>
    (await request(path, { method: "PATCH", body: JSON.stringify(body) })).json(),
  /** Downloads a file endpoint through the browser (keeps the auth header). */
  download: async (path: string, fallbackName: string) => {
    const res = await request(path);
    const disposition = res.headers.get("Content-Disposition") ?? "";
    const name = /filename="?([^"]+)"?/.exec(disposition)?.[1] ?? fallbackName;
    const url = URL.createObjectURL(await res.blob());
    const a = document.createElement("a");
    a.href = url;
    a.download = name;
    a.click();
    URL.revokeObjectURL(url);
  },
  /** Step 1: password. Either a session token, or an MFA-scoped token when
   *  the account has two-factor enabled. */
  login: async (email: string, password: string): Promise<LoginResult> => {
    const res = await request(
      "/auth/token",
      { method: "POST", body: new URLSearchParams({ username: email, password }) },
      null,
    );
    return res.json();
  },
  /** Step 2 (only when mfa_required): TOTP or recovery code. */
  verifyMfa: async (mfaToken: string, code: string): Promise<string> => {
    const res = await request("/auth/mfa/verify", { method: "POST", body: JSON.stringify({ mfa_token: mfaToken, code }) }, null);
    return (await res.json()).access_token;
  },
  put: async <T>(path: string, body: unknown): Promise<T> =>
    (await request(path, { method: "PUT", body: JSON.stringify(body) })).json(),
  delete: async <T>(path: string): Promise<T> => (await request(path, { method: "DELETE" })).json(),
};

export type LoginResult =
  | { mfa_required: true; mfa_token: string }
  | { mfa_required: false; mfa_setup_required: boolean; access_token: string };

export const errorMessage = (e: unknown) => (e instanceof Error ? e.message : "Something went wrong");
