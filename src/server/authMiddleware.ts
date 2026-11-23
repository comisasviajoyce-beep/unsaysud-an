import crypto from "crypto";
import fs from "fs";
import path from "path";
import express from "express";

const DATA_DIR = path.join(process.cwd(), "data");
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

const SUPER_ADMIN_FILE = path.join(DATA_DIR, "super_admin.json");
const SECRET_FILE = path.join(DATA_DIR, ".session_secret");

export const MERCHANT_COOKIE_NAME = "unsay_merchant_session";
export const ADMIN_COOKIE_NAME = "unsay_admin_session";
const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days persistent session

function getSessionSecret(): string {
  if (process.env.SESSION_SECRET && process.env.SESSION_SECRET.length >= 32) {
    return process.env.SESSION_SECRET;
  }
  try {
    if (fs.existsSync(SECRET_FILE)) {
      const existing = fs.readFileSync(SECRET_FILE, "utf-8").trim();
      if (existing.length >= 32) return existing;
    }
    const generated = crypto.randomBytes(48).toString("hex");
    fs.writeFileSync(SECRET_FILE, generated, { encoding: "utf-8", mode: 0o600 });
    return generated;
  } catch {
    // Fallback to process-scoped random secret
    if (!(globalThis as any).__unsayRuntimeSecret) {
      (globalThis as any).__unsayRuntimeSecret = crypto.randomBytes(48).toString("hex");
    }
    return (globalThis as any).__unsayRuntimeSecret;
  }
}

export function hashSecret(secret: string, existingSalt?: string): { hash: string; salt: string } {
  const salt = existingSalt || crypto.randomBytes(16).toString("hex");
  const hash = crypto.scryptSync(secret, salt, 64).toString("hex");
  return { hash, salt };
}

export function verifySecret(secret: string, storedHash: string, storedSalt: string): boolean {
  try {
    if (!secret || !storedHash || !storedSalt) return false;
    const computedHash = crypto.scryptSync(secret, storedSalt, 64).toString("hex");
    return crypto.timingSafeEqual(Buffer.from(storedHash, "hex"), Buffer.from(computedHash, "hex"));
  } catch {
    return false;
  }
}

export interface MerchantSessionPayload {
  role: "merchant";
  ownerId: string;
  stallName: string;
  stallNo: string;
  username: string;
  exp: number;
}

export interface AdminSessionPayload {
  role: "admin";
  adminId: string;
  username: string;
  name: string;
  email: string;
  exp: number;
}

type SessionPayload = MerchantSessionPayload | AdminSessionPayload;

export function signSessionToken(payload: Omit<MerchantSessionPayload, "exp"> | Omit<AdminSessionPayload, "exp">): string {
  const secret = getSessionSecret();
  const fullPayload = {
    ...payload,
    exp: Date.now() + SESSION_TTL_MS
  };
  const encoded = Buffer.from(JSON.stringify(fullPayload), "utf-8").toString("base64url");
  const sig = crypto.createHmac("sha256", secret).update(encoded).digest("base64url");
  return `${encoded}.${sig}`;
}

export function verifySessionToken<T extends SessionPayload>(token: string | undefined, expectedRole: T["role"]): T | null {
  if (!token || typeof token !== "string") return null;
  const parts = token.split(".");
  if (parts.length !== 2) return null;
  const [encoded, sig] = parts;
  if (!encoded || !sig) return null;

  try {
    const secret = getSessionSecret();
    const expectedSig = crypto.createHmac("sha256", secret).update(encoded).digest("base64url");
    const sigBuf = Buffer.from(sig, "utf-8");
    const expectedBuf = Buffer.from(expectedSig, "utf-8");
    if (sigBuf.length !== expectedBuf.length || !crypto.timingSafeEqual(sigBuf, expectedBuf)) {
      return null;
    }

    const parsed = JSON.parse(Buffer.from(encoded, "base64url").toString("utf-8")) as T;
    if (!parsed || parsed.role !== expectedRole || typeof parsed.exp !== "number" || parsed.exp < Date.now()) {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

export function parseCookies(req: express.Request): Record<string, string> {
  const header = req.headers.cookie;
  const result: Record<string, string> = {};
  if (!header) return result;
  header.split(";").forEach((pair) => {
    const idx = pair.indexOf("=");
    if (idx === -1) return;
    const key = pair.slice(0, idx).trim();
    const val = pair.slice(idx + 1).trim();
    try {
      result[key] = decodeURIComponent(val);
    } catch {
      result[key] = val;
    }
  });
  return result;
}

function isSecureRequest(req: express.Request): boolean {
  if (req.secure) return true;
  const proto = String(req.headers["x-forwarded-proto"] || "").toLowerCase();
  return proto.includes("https");
}

export function setSessionCookie(req: express.Request, res: express.Response, name: string, token: string) {
  const maxAgeSec = Math.floor(SESSION_TTL_MS / 1000);
  const secure = isSecureRequest(req);
  const parts = [
    `${name}=${encodeURIComponent(token)}`,
    `Path=/`,
    `Max-Age=${maxAgeSec}`,
    `HttpOnly`
  ];
  if (secure) {
    parts.push("SameSite=None", "Secure", "Partitioned");
  } else {
    parts.push("SameSite=Lax");
  }
  res.append("Set-Cookie", parts.join("; "));
}

export function clearSessionCookie(req: express.Request, res: express.Response, name: string) {
  const secure = isSecureRequest(req);
  const parts = [
    `${name}=`,
    `Path=/`,
    `Max-Age=0`,
    `HttpOnly`
  ];
  if (secure) {
    parts.push("SameSite=None", "Secure", "Partitioned");
  } else {
    parts.push("SameSite=Lax");
  }
  res.append("Set-Cookie", parts.join("; "));
}

export function getMerchantSession(req: express.Request): MerchantSessionPayload | null {
  const cookies = parseCookies(req);
  return verifySessionToken<MerchantSessionPayload>(cookies[MERCHANT_COOKIE_NAME], "merchant");
}

export function getAdminSession(req: express.Request): AdminSessionPayload | null {
  const cookies = parseCookies(req);
  const session = verifySessionToken<AdminSessionPayload>(cookies[ADMIN_COOKIE_NAME], "admin");
  if (!session) return null;
  const adminRecord = getSuperAdmin();
  if (!adminRecord || adminRecord.id !== session.adminId) return null;
  return session;
}

export function verifyCsrfForCookieMutation(req: express.Request): boolean {
  const method = req.method.toUpperCase();
  if (method === "GET" || method === "HEAD" || method === "OPTIONS") return true;
  if (req.headers["x-requested-with"] === "XMLHttpRequest") return true;

  const origin = req.headers.origin;
  const host = req.headers["x-forwarded-host"] || req.headers.host;
  if (origin && host) {
    try {
      const originHost = new URL(String(origin)).host;
      return originHost === String(host);
    } catch {
      return false;
    }
  }
  return false;
}

export function requireMerchant(
  req: express.Request,
  res: express.Response,
  expectedStallName?: string
): MerchantSessionPayload | null {
  if (!verifyCsrfForCookieMutation(req)) {
    res.status(403).json({ error: "Security check failed. Please refresh the page and try again." });
    return null;
  }
  const session = getMerchantSession(req);
  if (!session) {
    res.status(401).json({ error: "Merchant authentication required. Please log in to your stall account." });
    return null;
  }
  if (expectedStallName && session.stallName !== expectedStallName) {
    res.status(403).json({ error: "Unauthorized: You can only access and modify your own stall." });
    return null;
  }
  return session;
}

export function requireSuperAdmin(req: express.Request, res: express.Response): AdminSessionPayload | null {
  if (!verifyCsrfForCookieMutation(req)) {
    res.status(403).json({ error: "Security check failed. Please refresh the page and try again." });
    return null;
  }
  const session = getAdminSession(req);
  if (!session) {
    res.status(401).json({ error: "Super Administrator authentication required." });
    return null;
  }
  return session;
}

// ============================================================================
// SINGLE SUPER ADMINISTRATOR PERSISTENT STORE
// ============================================================================

export interface SuperAdminRecord {
  id: string;
  name: string;
  username: string;
  email: string;
  passwordHash: string;
  passwordSalt: string;
  pinHash?: string;
  pinSalt?: string;
  createdAt: string;
  updatedAt: string;
}

let cachedSuperAdmin: SuperAdminRecord | null | undefined = undefined;

export function getSuperAdmin(): SuperAdminRecord | null {
  if (cachedSuperAdmin !== undefined) return cachedSuperAdmin;
  try {
    if (fs.existsSync(SUPER_ADMIN_FILE)) {
      const raw = fs.readFileSync(SUPER_ADMIN_FILE, "utf-8").trim();
      if (!raw) {
        cachedSuperAdmin = null;
        return null;
      }
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed === "object" && parsed.id && parsed.username && parsed.passwordHash) {
        cachedSuperAdmin = parsed as SuperAdminRecord;
        return cachedSuperAdmin;
      }
    }
  } catch (err) {
    console.error("Failed to load super admin record:", err);
  }
  cachedSuperAdmin = null;
  return null;
}

export function reloadSuperAdminFromDisk(): SuperAdminRecord | null {
  cachedSuperAdmin = undefined;
  return getSuperAdmin();
}

export function isSuperAdminRegistered(): boolean {
  return getSuperAdmin() !== null;
}

export function createSingleSuperAdmin(params: {
  name: string;
  username: string;
  email: string;
  password: string;
  pin?: string;
}): { success: boolean; admin?: Omit<SuperAdminRecord, "passwordHash" | "passwordSalt" | "pinHash" | "pinSalt">; error?: string; status?: number } {
  // Atomic check on disk + memory to guarantee ONLY ONE Super Admin can ever exist
  if (reloadSuperAdminFromDisk() !== null) {
    return {
      success: false,
      status: 403,
      error: "A Super Administrator account already exists. Additional administrator registrations are permanently locked."
    };
  }

  const name = params.name.trim();
  const username = params.username.trim().toLowerCase();
  const email = params.email.trim().toLowerCase();

  if (name.length < 2) {
    return { success: false, status: 400, error: "Administrator full name must be at least 2 characters." };
  }
  if (!/^[a-zA-Z0-9._-]{3,32}$/.test(username)) {
    return { success: false, status: 400, error: "Username must be 3–32 characters using letters, numbers, dots, underscores, or hyphens." };
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return { success: false, status: 400, error: "Please enter a valid email address." };
  }
  if (!params.password || params.password.length < 8) {
    return { success: false, status: 400, error: "Super Admin password must be at least 8 characters long." };
  }

  let pinHash: string | undefined;
  let pinSalt: string | undefined;
  if (params.pin && params.pin.trim()) {
    const cleanPin = params.pin.trim();
    if (!/^\d{4,6}$/.test(cleanPin)) {
      return { success: false, status: 400, error: "Security PIN must be 4 to 6 digits." };
    }
    const p = hashSecret(cleanPin);
    pinHash = p.hash;
    pinSalt = p.salt;
  }

  const pw = hashSecret(params.password);
  const now = new Date().toISOString();
  const record: SuperAdminRecord = {
    id: `superadmin_${crypto.randomBytes(8).toString("hex")}`,
    name,
    username,
    email,
    passwordHash: pw.hash,
    passwordSalt: pw.salt,
    pinHash,
    pinSalt,
    createdAt: now,
    updatedAt: now
  };

  try {
    fs.writeFileSync(SUPER_ADMIN_FILE, JSON.stringify(record, null, 2), { encoding: "utf-8", flag: "wx" });
  } catch (err: any) {
    if (err && err.code === "EEXIST") {
      reloadSuperAdminFromDisk();
      return {
        success: false,
        status: 403,
        error: "A Super Administrator account already exists. Additional administrator registrations are locked."
      };
    }
    return { success: false, status: 500, error: "Failed to persist Super Administrator account." };
  }

  cachedSuperAdmin = record;
  return {
    success: true,
    admin: {
      id: record.id,
      name: record.name,
      username: record.username,
      email: record.email,
      createdAt: record.createdAt,
      updatedAt: record.updatedAt
    }
  };
}

export function verifySuperAdminCredentials(params: {
  identifier?: string;
  password?: string;
  pin?: string;
}): { success: boolean; admin?: { id: string; username: string; name: string; email: string; role: "admin" }; error?: string } {
  const record = getSuperAdmin();
  if (!record) {
    return {
      success: false,
      error: "No Super Administrator has been registered yet. Complete initial Super Admin registration first."
    };
  }

  if (params.pin && params.pin.trim()) {
    if (!record.pinHash || !record.pinSalt) {
      return { success: false, error: "PIN login is not configured for this Super Admin account. Use username/email and password." };
    }
    if (!verifySecret(params.pin.trim(), record.pinHash, record.pinSalt)) {
      return { success: false, error: "Invalid Super Administrator security PIN." };
    }
    return {
      success: true,
      admin: {
        id: record.id,
        username: record.username,
        name: record.name,
        email: record.email,
        role: "admin"
      }
    };
  }

  const id = String(params.identifier || "").trim().toLowerCase();
  const pw = String(params.password || "");
  if (!id || !pw) {
    return { success: false, error: "Please enter your administrator username or email and password." };
  }

  const matchesIdentifier = id === record.username.toLowerCase() || id === record.email.toLowerCase();
  if (!matchesIdentifier || !verifySecret(pw, record.passwordHash, record.passwordSalt)) {
    return { success: false, error: "Invalid administrator username/email or password." };
  }

  return {
    success: true,
    admin: {
      id: record.id,
      username: record.username,
      name: record.name,
      email: record.email,
      role: "admin"
    }
  };
}
