// ===== Bảo vệ bí mật MFA trong DB =====
// - mfaSecret (khóa TOTP) KHÔNG lưu dạng rõ: mã hóa AES-256-GCM (iv 12 byte + tag 16 byte + ciphertext, base64).
//   Lộ DB đơn thuần thì chưa dựng lại được mã 6 số.
// - Mã recovery chỉ lưu HMAC-SHA256(khóa, mã đã chuẩn hóa): khóa nằm ngoài DB nên không dò ngược offline được dù mã chỉ ~50 bit.
// - Khóa: MFA_ENCRYPTION_KEY (khuyến nghị, >= 32 byte). Không đặt thì dẫn xuất từ JWT_SECRET (HKDF) cho tiện dev.
//   CẢNH BÁO: đổi khóa này sau khi đã có người bật MFA thì mọi secret/recovery cũ vô dụng -> phải đặt khóa riêng khi chạy thật và không đổi.
const crypto = require("crypto");

function rootKey() {
  const k = process.env.MFA_ENCRYPTION_KEY || process.env.JWT_SECRET;
  if (!k || Buffer.byteLength(k) < 32) throw new Error("Cần MFA_ENCRYPTION_KEY hoặc JWT_SECRET >= 32 byte để dùng MFA");
  return k;
}
const derive = (info) => Buffer.from(crypto.hkdfSync("sha256", rootKey(), "cai-quan-an-mfa", info, 32));

function encryptSecret(plain) {
  const iv = crypto.randomBytes(12);
  const c = crypto.createCipheriv("aes-256-gcm", derive("secret-box"), iv);
  const ct = Buffer.concat([c.update(String(plain), "utf8"), c.final()]);
  return Buffer.concat([iv, c.getAuthTag(), ct]).toString("base64");
}

// giải mã thất bại (sai khóa / dữ liệu bị sửa) -> null
function decryptSecret(blob) {
  try {
    const b = Buffer.from(String(blob), "base64");
    const d = crypto.createDecipheriv("aes-256-gcm", derive("secret-box"), b.subarray(0, 12));
    d.setAuthTag(b.subarray(12, 28));
    return Buffer.concat([d.update(b.subarray(28)), d.final()]).toString("utf8");
  } catch (e) {
    return null;
  }
}

const hashRecovery = (normalized) => crypto.createHmac("sha256", derive("recovery-hmac")).update(normalized).digest("hex");

module.exports = { encryptSecret, decryptSecret, hashRecovery };
