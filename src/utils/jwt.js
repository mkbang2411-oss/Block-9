// ===== JWT (HS256) =====
// - Ký/verify bằng jsonwebtoken, CỐ ĐỊNH algorithms:["HS256"] -> từ chối alg "none" và token tự khai thuật toán khác.
// - Claim: sub (id người dùng), tv (tokenVersion), typ ("access" | "mfa"), iss, aud, jti, exp.
// - Payload chỉ gồm định danh; KHÔNG chứa mật khẩu, secret, email, role. Role/chefId luôn đọc lại từ DB (không tin claim).
// - Token "mfa" (challenge sau khi mật khẩu đúng) sống ngắn và CHỈ dùng được ở /api/auth/mfa/verify.
const crypto = require("crypto");
const jwt = require("jsonwebtoken");

const ALG = "HS256";
const ISSUER = "cai-quan-an";
const AUDIENCE = "cai-quan-an-spa";
const MFA_TTL = "5m";

function secret() {
  const s = process.env.JWT_SECRET;
  if (!s || Buffer.byteLength(s) < 32)
    throw new Error("JWT_SECRET phải có ít nhất 32 byte (xem .env.example)");
  return s;
}

// kiểm tra ngay lúc khởi động để thiếu secret thì báo sớm, không đợi tới lúc có người đăng nhập
const assertConfigured = () => void secret();

const accessTtl = () => process.env.JWT_EXPIRES_IN || "15m";

function sign(user, { typ = "access", expiresIn } = {}) {
  return jwt.sign({ tv: user.tokenVersion, typ }, secret(), {
    algorithm: ALG,
    expiresIn: expiresIn || (typ === "mfa" ? MFA_TTL : accessTtl()),
    issuer: ISSUER,
    audience: AUDIENCE,
    subject: String(user.id),
    jwtid: crypto.randomUUID(),
  });
}

const signAccess = (user) => sign(user, { typ: "access" });
const signMfaChallenge = (user) => sign(user, { typ: "mfa" });

// trả { ok:true, payload } | { ok:false, expired:boolean }
function verify(token, typ = "access") {
  try {
    const payload = jwt.verify(token, secret(), {
      algorithms: [ALG],
      issuer: ISSUER,
      audience: AUDIENCE,
    });
    if (payload.typ !== typ || !/^\d{1,9}$/.test(String(payload.sub)))
      return { ok: false, expired: false };
    return { ok: true, payload };
  } catch (e) {
    return { ok: false, expired: e && e.name === "TokenExpiredError" };
  }
}

module.exports = { signAccess, signMfaChallenge, verify, assertConfigured, ALG };
