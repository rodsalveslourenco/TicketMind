import crypto from "node:crypto";

function getSecret() {
  const baseSecret =
    String(process.env.APP_SECRET || "").trim() ||
    String(process.env.DATABASE_URL || "").trim() ||
    String(process.env.DB_PATH || "").trim() ||
    "ticketmind-local-secret";
  return crypto.createHash("sha256").update(baseSecret).digest();
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
