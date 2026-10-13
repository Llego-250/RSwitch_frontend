// Thin client for the FastAPI backend (backend/app). Base URL comes from
// VITE_API_URL; the bearer token is the one AuthContext stored after login.
//
// Every request reports how long the user has been idle (X-RDIP-Idle), so
// background polling never keeps a session alive (REQ-AUTH-005). Errors are
// turned into the SRS §20.1 user-facing messages, keeping §20.2 field-level
// validation details for inline form errors.

export const API_URL = (import.meta.env.VITE_API_URL as string | undefined) ?? "http://localhost:8000";

const STORAGE_KEY = "rdip_auth_session";
const ACTIVITY_KEY = "rdip_last_activity";

// SRS §20.1
export const STATUS_MESSAGES: Record<number, string> = {
  400: "The request could not be understood. Please check your input and try again.",
  401: "You must be logged in to access this page.",
  403: "You do not have permission to perform this action.",
  404: "The requested record could not be found.",
  409: "This record already exists or conflicts with an existing entry.",
  413: "The uploaded file exceeds the 50 MB maximum size.",
  422: "The file did not pass validation. See the error report below.",
  429: "Too many requests. Please wait a moment before trying again.",
  500: "Something went wrong on our end. The technical team has been notified.",
  503: "The service is temporarily unavailable. Please try again in a few minutes.",
};

/** One §20.2 validation problem. File validation adds row/column. */
export interface FieldError {
  field: string;
  rule?: string;
  message: string;
  row?: number;
  column?: string;
}

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
    /** Raw `detail` from the response body. */
    public detail?: unknown,
    /** §20.2 problems, for inline field errors. */
    public fields: FieldError[] = [],
    /** Machine-readable reason, e.g. "session_idle", "account_locked". */
    public code?: string,
  ) {
    super(message);
  }

  /** The message for one input, if the server flagged it. */
  fieldError(field: string): string | undefined {
    return this.fields.find((f) => f.field === field || f.field.endsWith(`.${field}`))?.message;
  }
}

// Sign-in style flows where the server's own wording is the user message
// (e.g. "Incorrect email or password", "This account is locked…").
const AUTH_FLOW_PATHS = ["/auth/login", "/auth/token", "/auth/mfa/", "/auth/password/", "/auth/invite", "/auth/change-password"];

function toFieldErrors(detail: unknown): FieldError[] {
  if (!Array.isArray(detail)) return [];
  return detail
    .filter((d): d is Record<string, unknown> => !!d && typeof d === "object")
    .map((d) => ({
      field: String(d.field ?? (Array.isArray(d.loc) ? d.loc.filter((p) => p !== "body").join(".") : "")),
      rule: d.rule !== undefined ? String(d.rule) : d.type !== undefined ? String(d.type) : undefined,
      message: String(d.message ?? d.msg ?? "Invalid value"),
      row: typeof d.row === "number" ? d.row : undefined,
      column: typeof d.column === "string" ? d.column : undefined,
    }));
}

function userMessage(status: number, path: string, detail: unknown, code?: string): string {
  const serverText = typeof detail === "string" && detail.trim() ? detail : undefined;
  if (serverText && (AUTH_FLOW_PATHS.some((p) => path.startsWith(p)) || (status === 401 && code))) return serverText;
  if ([400, 409, 422].includes(status)) {
    if (serverText) return serverText;
    const fields = toFieldErrors(detail);
    // Form problems read best as their own messages; a file's row-level
    // report keeps the §20.1 wording and is rendered from `fields`.
    if (fields.length && fields.every((f) => f.row === undefined)) {
      return Array.from(new Set(fields.map((f) => f.message))).join(" ");
    }
    return STATUS_MESSAGES[status];
  }
  if (STATUS_MESSAGES[status]) return STATUS_MESSAGES[status];
  if (status >= 500) return STATUS_MESSAGES[500];
  return serverText ?? STATUS_MESSAGES[400];
}

// ---- activity (REQ-AUTH-005) ------------------------------------------------

let lastActivityWrite = 0;

/** Called on every real user interaction (mouse, keyboard, touch, navigation). */
export function markActivity() {
  const now = Date.now();
  if (now - lastActivityWrite < 2_000) return;
  lastActivityWrite = now;
  try {
    localStorage.setItem(ACTIVITY_KEY, String(now));
  } catch {
    /* storage unavailable */
  }
}

/** Last real interaction across all tabs (ms since epoch). */
export function lastActivity(): number {
  try {
    const v = Number(localStorage.getItem(ACTIVITY_KEY));
    return Number.isFinite(v) && v > 0 ? v : Date.now();
  } catch {
    return Date.now();
  }
}

export function idleSeconds(): number {
  return Math.max(0, Math.floor((Date.now() - lastActivity()) / 1000));
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
  headers.set("X-RDIP-Idle", String(idleSeconds()));
  if (init.body && !(init.body instanceof FormData) && !(init.body instanceof URLSearchParams)) {
    headers.set("Content-Type", "application/json");
  }
  let res: Response;
  try {
    res = await fetch(`${API_URL}${path}`, { ...init, headers });
  } catch {
    throw new ApiError(0, STATUS_MESSAGES[503]);
  }
  if (!res.ok) {
    let detail: unknown;
    let code: string | undefined;
    try {
      const body = await res.json();
      detail = body.detail;
      code = typeof body.code === "string" ? body.code : undefined;
    } catch {
      /* non-JSON error body */
    }
    const message = userMessage(res.status, path, detail, code);
    if (res.status === 401 && token && !AUTH_FLOW_PATHS.some((p) => path.startsWith(p)) && path !== "/auth/logout") {
      window.dispatchEvent(new CustomEvent("rdip:unauthorized", { detail: { code, message } }));
    }
    if (res.status === 403 && code === "mfa_setup_required") {
      window.dispatchEvent(new Event("rdip:mfa-setup-required"));
    }
    throw new ApiError(res.status, message, detail, toFieldErrors(detail), code);
  }
  return res;
}

const json = async <T>(res: Response): Promise<T> => (res.status === 204 ? (undefined as T) : res.json());

export const api = {
  get: async <T>(path: string, token?: string | null): Promise<T> => json<T>(await request(path, {}, token ?? getToken())),
  post: async <T>(path: string, body?: unknown): Promise<T> =>
    json<T>(await request(path, { method: "POST", body: body instanceof FormData ? body : JSON.stringify(body ?? {}) })),
  patch: async <T>(path: string, body: unknown): Promise<T> =>
    json<T>(await request(path, { method: "PATCH", body: JSON.stringify(body) })),
  put: async <T>(path: string, body?: unknown): Promise<T> =>
    json<T>(await request(path, { method: "PUT", body: JSON.stringify(body ?? {}) })),
  delete: async <T>(path: string): Promise<T> => json<T>(await request(path, { method: "DELETE" })),
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
  /** §19.1 step 1: password (plus a trusted-device token, if this browser has one). */
  login: async (email: string, password: string, deviceToken?: string | null): Promise<LoginResult> => {
    const res = await request(
      "/auth/login",
      { method: "POST", body: JSON.stringify({ email, password, device_token: deviceToken ?? null }) },
      null,
    );
    return res.json();
  },
  /** §19.1 step 2 (only when mfa_required): TOTP or recovery code. */
  verifyMfa: async (mfaToken: string, code: string, trustDevice: boolean): Promise<SessionResult> => {
    const res = await request(
      "/auth/mfa/verify",
      { method: "POST", body: JSON.stringify({ mfa_token: mfaToken, code, trust_device: trustDevice }) },
      null,
    );
    return res.json();
  },
  /** §19.1: invalidates the session server-side. Never throws. */
  logout: async (token: string | null) => {
    if (!token) return;
    try {
      await request("/auth/logout", { method: "POST" }, token);
    } catch {
      /* already signed out */
    }
  },
};

export interface SessionResult {
  mfa_required: false;
  mfa_setup_required: boolean;
  access_token: string;
  session_timeout_minutes: number;
  /** Only when "Trust this device" was ticked. */
  device_token?: string;
}

export type LoginResult = { mfa_required: true; mfa_token: string } | SessionResult;

/** Resolve a template path against the API (e.g. the organization logo URL). */
export const apiUrl = (path: string) => (path.startsWith("http") ? path : `${API_URL}${path}`);

export const errorMessage = (e: unknown) => (e instanceof Error ? e.message : STATUS_MESSAGES[500]);

/** Field → message map from an error, for inline form errors (§20.2). */
export const fieldErrors = (e: unknown): Record<string, string> => {
  if (!(e instanceof ApiError)) return {};
  const out: Record<string, string> = {};
  for (const f of e.fields) {
    const key = f.field.split(".").pop() ?? f.field;
    if (!out[key]) out[key] = f.message;
    if (!out[f.field]) out[f.field] = f.message;
  }
  return out;
};
