import crypto from "node:crypto";

const SESSION_COOKIE_NAME = "ticketmind_session";
const SESSION_DURATION_MS = Math.max(5 * 60 * 1000, Number(process.env.SESSION_TTL_MS) || 12 * 60 * 60 * 1000);
const PASSWORD_PREFIX = "scrypt";
const SCRYPT_KEY_LENGTH = 64;

function base64UrlEncode(value) {
  return Buffer.from(value)
    .toString("base64")
    .replace(/=/g, "")
    .replace(/\+/g, "-")
    .replace(/\//g, "_");
}

function base64UrlDecode(value) {
  const normalized = String(value || "")
    .replace(/-/g, "+")
    .replace(/_/g, "/");
  const padding = normalized.length % 4 === 0 ? "" : "=".repeat(4 - (normalized.length % 4));
  return Buffer.from(`${normalized}${padding}`, "base64");
}

function getSecret() {
  const baseSecret =
    String(process.env.APP_SECRET || "").trim() ||
    String(process.env.DATABASE_URL || "").trim() ||
    String(process.env.DB_PATH || "").trim() ||
    "ticketmind-local-secret";
  return crypto.createHash("sha256").update(baseSecret).digest();
}

function signPayload(value) {
  return crypto.createHmac("sha256", getSecret()).update(value).digest();
}

function secureCompare(left, right) {
  const leftBuffer = Buffer.from(String(left || ""));
  const rightBuffer = Buffer.from(String(right || ""));
  if (leftBuffer.length !== rightBuffer.length) return false;
  return crypto.timingSafeEqual(leftBuffer, rightBuffer);
}

export function encryptSecret(value) {
  const plainText = String(value || "");
  if (!plainText) return "";

  const iv = crypto.randomBytes(12);
  const key = getSecret();
  const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
  const encrypted = Buffer.concat([cipher.update(plainText, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `enc:${Buffer.concat([iv, tag, encrypted]).toString("base64")}`;
}

export function decryptSecret(value) {
  const encryptedValue = String(value || "").trim();
  if (!encryptedValue) return "";
  if (!encryptedValue.startsWith("enc:")) return encryptedValue;

  const payload = Buffer.from(encryptedValue.slice(4), "base64");
  const iv = payload.subarray(0, 12);
  const tag = payload.subarray(12, 28);
  const encrypted = payload.subarray(28);
  const decipher = crypto.createDecipheriv("aes-256-gcm", getSecret(), iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(encrypted), decipher.final()]).toString("utf8");
}

export function isPasswordHash(value) {
  return String(value || "").startsWith(`${PASSWORD_PREFIX}$`);
}

export function needsPasswordUpgrade(value) {
  const normalized = String(value || "");
  return Boolean(normalized) && !isPasswordHash(normalized);
}

export function hashPassword(value) {
  const plainText = String(value || "");
  if (!plainText) return "";
  if (isPasswordHash(plainText)) return plainText;

  const salt = crypto.randomBytes(16);
  const derivedKey = crypto.scryptSync(plainText, salt, SCRYPT_KEY_LENGTH);
  return `${PASSWORD_PREFIX}$${salt.toString("base64")}$${derivedKey.toString("base64")}`;
}

export function verifyPassword(candidatePassword, storedPassword) {
  const normalizedCandidate = String(candidatePassword || "");
  const normalizedStored = String(storedPassword || "");
  if (!normalizedCandidate || !normalizedStored) return false;

  if (!isPasswordHash(normalizedStored)) {
    return secureCompare(normalizedCandidate, normalizedStored);
  }

  const [, saltBase64, hashBase64] = normalizedStored.split("$");
  if (!saltBase64 || !hashBase64) return false;
  const derivedCandidate = crypto.scryptSync(normalizedCandidate, Buffer.from(saltBase64, "base64"), SCRYPT_KEY_LENGTH);
  const storedHash = Buffer.from(hashBase64, "base64");
  if (derivedCandidate.length !== storedHash.length) return false;
  return crypto.timingSafeEqual(derivedCandidate, storedHash);
}

export function getPasswordFingerprint(passwordValue) {
  return crypto.createHash("sha256").update(String(passwordValue || "")).digest("hex").slice(0, 24);
}

export function createSessionToken(user) {
  const expiresAt = new Date(Date.now() + SESSION_DURATION_MS).toISOString();
  const header = base64UrlEncode(JSON.stringify({ alg: "HS256", typ: "JWT" }));
  const payload = base64UrlEncode(
    JSON.stringify({
      sub: String(user?.id || "").trim(),
      pwd: getPasswordFingerprint(user?.password || ""),
      exp: expiresAt,
    }),
  );
  const body = `${header}.${payload}`;
  const signature = base64UrlEncode(signPayload(body));
  return { token: `${body}.${signature}`, expiresAt };
}

export function verifySessionToken(token) {
  const normalizedToken = String(token || "").trim();
  if (!normalizedToken) return null;

  const [header, payload, signature] = normalizedToken.split(".");
  if (!header || !payload || !signature) return null;

  const body = `${header}.${payload}`;
  const expectedSignature = base64UrlEncode(signPayload(body));
  if (!secureCompare(signature, expectedSignature)) return null;

  try {
    const parsed = JSON.parse(base64UrlDecode(payload).toString("utf8"));
    const expiresAt = new Date(parsed.exp || "");
    if (Number.isNaN(expiresAt.getTime()) || expiresAt.getTime() <= Date.now()) return null;
    return {
      userId: String(parsed.sub || "").trim(),
      passwordFingerprint: String(parsed.pwd || "").trim(),
      expiresAt: expiresAt.toISOString(),
    };
  } catch {
    return null;
  }
}

function parseCookies(rawCookieHeader) {
  return String(rawCookieHeader || "")
    .split(";")
    .map((entry) => entry.trim())
    .filter(Boolean)
    .reduce((accumulator, entry) => {
      const separatorIndex = entry.indexOf("=");
      if (separatorIndex <= 0) return accumulator;
      const key = entry.slice(0, separatorIndex).trim();
      const value = entry.slice(separatorIndex + 1).trim();
      return { ...accumulator, [key]: decodeURIComponent(value) };
    }, {});
}

export function getSessionTokenFromRequest(request) {
  const authorizationHeader = String(request.headers.authorization || "").trim();
  if (authorizationHeader.toLowerCase().startsWith("bearer ")) {
    return authorizationHeader.slice(7).trim();
  }

  const cookies = parseCookies(request.headers.cookie || "");
  return String(cookies[SESSION_COOKIE_NAME] || "").trim();
}

export function createSessionCookie(token, expiresAt) {
  const secureFlag = String(process.env.NODE_ENV || "").trim().toLowerCase() === "production" ? "; Secure" : "";
  return [
    `${SESSION_COOKIE_NAME}=${encodeURIComponent(String(token || ""))}`,
    "Path=/",
    "HttpOnly",
    "SameSite=Lax",
    secureFlag ? "Secure" : "",
    `Expires=${new Date(expiresAt).toUTCString()}`,
    `Max-Age=${Math.max(0, Math.floor((new Date(expiresAt).getTime() - Date.now()) / 1000))}`,
  ]
    .filter(Boolean)
    .join("; ");
}

export function clearSessionCookie() {
  const secureFlag = String(process.env.NODE_ENV || "").trim().toLowerCase() === "production" ? "; Secure" : "";
  return [`${SESSION_COOKIE_NAME}=`, "Path=/", "HttpOnly", "SameSite=Lax", secureFlag ? "Secure" : "", "Expires=Thu, 01 Jan 1970 00:00:00 GMT", "Max-Age=0"]
    .filter(Boolean)
    .join("; ");
}
