// ===== TOTP (RFC 6238, HMAC-SHA1, 6 số, bước 30 giây) — tự cài bằng crypto, tương thích Google Authenticator / Authy / 1Password =====
// - verify chấp nhận bước thời gian hiện tại ± 1 (lệch đồng hồ ~30 giây) và TRẢ VỀ số bước khớp để route lưu vào users.mfaLastStep,
//   từ đó chỉ nhận mã có bước > mfaLastStep (một mã dùng một lần, không dùng lại được).
// - So sánh mã theo thời gian không đổi.
const crypto = require("crypto");

const B32 = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
const STEP_SECONDS = 30;
const DIGITS = 6;

function base32Encode(buf) {
  let bits = 0, value = 0, out = "";
  for (const byte of buf) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      out += B32[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) out += B32[(value << (5 - bits)) & 31];
  return out;
}

function base32Decode(str) {
  const s = String(str).toUpperCase().replace(/=+$/, "");
  let bits = 0, value = 0;
  const out = [];
  for (const ch of s) {
    const i = B32.indexOf(ch);
    if (i < 0) throw new Error("base32 không hợp lệ");
    value = (value << 5) | i;
    bits += 5;
    if (bits >= 8) {
      out.push((value >>> (bits - 8)) & 255);
      bits -= 8;
    }
  }
  return Buffer.from(out);
}

// 160 bit ngẫu nhiên (khuyến nghị RFC 4226) -> 32 ký tự base32
const generateSecret = () => base32Encode(crypto.randomBytes(20));

function hotp(secretBuf, counter, digits = DIGITS) {
  const msg = Buffer.alloc(8);
  msg.writeBigUInt64BE(BigInt(counter));
  const h = crypto.createHmac("sha1", secretBuf).update(msg).digest();
  const o = h[h.length - 1] & 15;
  const bin = ((h[o] & 0x7f) << 24) | (h[o + 1] << 16) | (h[o + 2] << 8) | h[o + 3];
  return String(bin % 10 ** digits).padStart(digits, "0");
}

const stepOf = (timeMs = Date.now()) => Math.floor(timeMs / 1000 / STEP_SECONDS);

// mã tại thời điểm timeMs (dùng cho test / hiển thị thử)
const totpAt = (secretB32, timeMs = Date.now(), digits = DIGITS) => hotp(base32Decode(secretB32), stepOf(timeMs), digits);

// code đúng (trong cửa sổ ± window bước) -> trả số bước khớp; sai -> null
function verifyTotp(secretB32, code, { window = 1, timeMs = Date.now() } = {}) {
  const c = String(code || "").trim();
  if (!/^\d{6}$/.test(c)) return null;
  let key;
  try {
    key = base32Decode(secretB32);
  } catch (e) {
    return null;
  }
  const now = stepOf(timeMs);
  let hit = null;
  for (let s = now - window; s <= now + window; s++) {
    const exp = hotp(key, s);
    // không thoát sớm: thời gian xử lý không phụ thuộc mã khớp ở bước nào
    if (crypto.timingSafeEqual(Buffer.from(exp), Buffer.from(c)) && hit === null) hit = s;
  }
  return hit;
}

// otpauth://totp/Issuer:email?secret=...&issuer=Issuer  (nội dung mã QR)
function otpauthUrl({ issuer, account, secret }) {
  const label = `${encodeURIComponent(issuer)}:${encodeURIComponent(account)}`;
  const q = new URLSearchParams({ secret, issuer, algorithm: "SHA1", digits: String(DIGITS), period: String(STEP_SECONDS) });
  return `otpauth://totp/${label}?${q.toString()}`;
}

module.exports = { generateSecret, verifyTotp, totpAt, stepOf, otpauthUrl, base32Encode, base32Decode, STEP_SECONDS };
