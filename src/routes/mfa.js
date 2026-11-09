// ===== MFA TOTP + mã khôi phục + xác thực lại thao tác nhạy cảm (B19, B20, B21) =====
//
//  Đăng nhập (công khai, không Bearer):
//   POST /api/auth/mfa/verify { challenge, code | recoveryCode }
//        challenge là token loại "mfa" (5 phút) do POST /auth/login trả khi mật khẩu đúng và MFA đang bật.
//        đúng -> { accessToken, tokenType, expiresIn, user, recoveryUsed?, recoveryRemaining? }
//        sai  -> ok:false INVALID_MFA_CODE (HTTP 200) | 429 RATE_LIMITED (khóa 5 phút sau 5 lần sai) | 401 challenge sai/hết hạn
//
//  Quản lý MFA (Bearer access token):
//   GET  /api/mfa/status                                    -> { enabled, setupPending }
//   POST /api/mfa/setup   { }                               tắt MFA: tạo khóa mới -> { secret, otpauthUrl, qrDataUrl }. mfaEnabled vẫn false.
//                         { password, code|recoveryCode }   đang bật (ĐỔI THIẾT BỊ): phải xác thực lại, khóa mới nằm ở chỗ "chờ", khóa cũ vẫn dùng được
//   POST /api/mfa/enable  { code }                          nhập mã 6 số của khóa vừa setup -> bật (hoặc chuyển sang thiết bị mới).
//                         Lần bật đầu: trả 10 recoveryCodes (CHỈ HIỆN MỘT LẦN). tokenVersion+1 -> trả accessToken MỚI, token cũ chết.
//   POST /api/mfa/disable { password, code|recoveryCode }   xác thực lại -> tắt MFA, xóa khóa + toàn bộ mã khôi phục, tokenVersion+1, trả accessToken mới
//   POST /api/mfa/recovery-codes/status     { password, code|recoveryCode }  -> { total, remaining, createdAt }  (DB chỉ giữ hash nên KHÔNG thể xem lại mã gốc)
//   POST /api/mfa/recovery-codes/regenerate { password, code|recoveryCode }  -> { recoveryCodes } nhóm mới, nhóm cũ vô hiệu ngay
//
// Quy tắc an toàn:
//  - Mã TOTP chấp nhận bước thời gian hiện tại ±1; lưu users.mfaLastStep (UPDATE nguyên tử) nên một mã chỉ dùng được một lần.
//  - Mã khôi phục dùng một lần (UPDATE ... WHERE usedAt IS NULL nguyên tử); DB chỉ có HMAC của mã.
//  - Sai quá 5 lần (mã hoặc mật khẩu khi xác thực lại) -> khóa MFA tài khoản 5 phút, kể cả nhập đúng; theo tài khoản, lưu trong DB.
//  - Mã nhập sai ĐỊNH DẠNG (không phải 6 số / không giống mã khôi phục) -> VALIDATION_FAILED, không tính vào số lần sai (gõ nhầm không bị khóa).
//  - Khóa TOTP lưu mã hóa (AES-256-GCM), không bao giờ trả lại qua API sau lúc setup.
const crypto = require("crypto");
const express = require("express");
const bcrypt = require("bcryptjs");
const QRCode = require("qrcode");
const { Op } = require("sequelize");
const { sequelize, User, RecoveryCode } = require("../models");
const { authenticate } = require("../middleware/auth");
const { verify: verifyJwt } = require("../utils/jwt");
const { generateSecret, verifyTotp, otpauthUrl } = require("../utils/totp");
const { encryptSecret, decryptSecret, hashRecovery } = require("../utils/mfa-crypto");
const { rateLimit } = require("../utils/rateLimit");
const { asyncHandler } = require("../utils/format");
const { ApiError } = require("../api/errors");
const { ok } = require("../api/response");
const { tokenPayload } = require("./auth-api");

const router = express.Router();

const MAX_FAILS = 5;
const LOCK_MS = 5 * 60 * 1000;
const RECOVERY_COUNT = 10;
const RECOVERY_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // 32 ký tự, bỏ I O 0 1 dễ nhầm -> 5 bit/ký tự
const RECOVERY_RE = /^[A-HJ-NP-Z2-9]{10}$/;
const ISSUER = process.env.MFA_ISSUER || "Cái Quán Ăn";

const limitMfa = rateLimit({ windowMs: 15 * 60 * 1000, max: 30 });

const body = (req) => (req.body && typeof req.body === "object" ? req.body : {});
const str = (v) => (typeof v === "string" ? v : "");
// có body thì phải là JSON; không có body (vd POST /mfa/setup lần đầu) thì cho qua
// (fetch POST không body vẫn gửi Content-Length: 0 -> coi là không có body)
const jsonIfBody = (req, res, next) =>
  req.headers["content-length"] !== "0" && req.is("application/json") === false
    ? next(new ApiError("UNSUPPORTED_MEDIA_TYPE"))
    : next();
const invalid = (field, message) => new ApiError("VALIDATION_FAILED", { message, fields: { [field]: message } });

// ---------------------------------------------------------------- mã khôi phục
const newRecoveryCode = () => {
  let s = "";
  for (let i = 0; i < 10; i++) s += RECOVERY_ALPHABET[crypto.randomInt(RECOVERY_ALPHABET.length)];
  return s;
};
const formatRecovery = (s) => `${s.slice(0, 5)}-${s.slice(5)}`; // XXXXX-XXXXX
const normRecovery = (v) => str(v).toUpperCase().replace(/[\s-]/g, "");

function makeBatch(userId) {
  const batchId = crypto.randomUUID();
  const plain = Array.from({ length: RECOVERY_COUNT }, newRecoveryCode);
  return {
    codes: plain.map(formatRecovery),
    rows: plain.map((c) => ({ userId, batchId, codeHash: hashRecovery(c) })),
  };
}

// ---------------------------------------------------------------- khóa / đếm sai theo tài khoản
function assertNotLocked(user) {
  if (user.mfaLockedUntil && user.mfaLockedUntil > new Date()) {
    const giay = Math.max(1, Math.ceil((user.mfaLockedUntil - Date.now()) / 1000));
    throw new ApiError("RATE_LIMITED", {
      message: `Bạn đã nhập sai quá nhiều lần. Xác thực hai lớp tạm khóa, vui lòng thử lại sau khoảng ${Math.ceil(giay / 60)} phút.`,
      headers: { "Retry-After": giay },
      extra: { lockedSeconds: giay },
    });
  }
}

// ghi nhận 1 lần sai (tăng bộ đếm bằng UPDATE nguyên tử -> request song song không lách được), đủ 5 lần thì khóa, rồi ném lỗi
async function fail(user, code = "INVALID_MFA_CODE", message) {
  await User.update({ failedMfa: sequelize.literal('"failedMfa" + 1') }, { where: { id: user.id } });
  await user.reload();
  if (user.failedMfa >= MAX_FAILS) {
    await user.update({ failedMfa: 0, mfaLockedUntil: new Date(Date.now() + LOCK_MS) });
    throw new ApiError("RATE_LIMITED", {
      message: "Bạn đã nhập sai 5 lần. Xác thực hai lớp tạm khóa 5 phút.",
      headers: { "Retry-After": LOCK_MS / 1000 },
      extra: { lockedSeconds: LOCK_MS / 1000 },
    });
  }
  throw new ApiError(code, message ? { message } : {});
}

// ---------------------------------------------------------------- kiểm tra mã
// TOTP: đúng + bước thời gian chưa dùng. Chiếm bước bằng UPDATE nguyên tử (mfaLastStep < step) -> 2 request cùng 1 mã chỉ 1 request thắng.
async function checkTotp(user, code) {
  const secret = user.mfaSecret && decryptSecret(user.mfaSecret);
  if (!secret) return false;
  const step = verifyTotp(secret, code);
  if (step === null) return false;
  const [n] = await User.update(
    { mfaLastStep: step },
    { where: { id: user.id, [Op.or]: [{ mfaLastStep: null }, { mfaLastStep: { [Op.lt]: step } }] } },
  );
  return n === 1;
}

// mã khôi phục: đúng + chưa dùng; "dùng" = đánh dấu usedAt bằng UPDATE nguyên tử (dùng lần 2 -> 0 dòng -> sai)
async function checkRecovery(user, code) {
  const [n] = await RecoveryCode.update(
    { usedAt: new Date() },
    { where: { userId: user.id, codeHash: hashRecovery(code), usedAt: null } },
  );
  return n === 1;
}

// Đọc yếu tố thứ hai từ body ({code} hoặc {recoveryCode}); sai định dạng -> VALIDATION_FAILED (không tính lần sai).
// Trả { kind:"totp"|"recovery", good:boolean }
async function secondFactor(user, b) {
  const rc = str(b.recoveryCode).trim();
  if (rc && !str(b.code).trim()) {
    const norm = normRecovery(rc);
    if (!RECOVERY_RE.test(norm)) throw invalid("recoveryCode", "Mã khôi phục gồm 10 ký tự (dạng XXXXX-XXXXX).");
    return { kind: "recovery", good: await checkRecovery(user, norm) };
  }
  const code = str(b.code).trim();
  if (!/^\d{6}$/.test(code)) throw invalid("code", "Vui lòng nhập đủ 6 số (hoặc dùng mã khôi phục).");
  return { kind: "totp", good: await checkTotp(user, code) };
}

// Xác thực lại: MẬT KHẨU + (TOTP hoặc mã khôi phục). Mật khẩu kiểm TRƯỚC để mật khẩu sai không "đốt" mã khôi phục.
// Sai mật khẩu / sai mã đều tính vào bộ đếm khóa (token bị đánh cắp không dùng để dò mật khẩu vô hạn được).
async function reauth(user, b) {
  assertNotLocked(user);
  const password = str(b.password);
  if (!password || password.length > 200) throw invalid("password", "Vui lòng nhập mật khẩu hiện tại.");
  if (!(await bcrypt.compare(password, user.passwordHash))) await fail(user, "INVALID_CREDENTIALS", "Mật khẩu không đúng.");
  const f = await secondFactor(user, b);
  if (!f.good) await fail(user);
  if (user.failedMfa) await user.update({ failedMfa: 0 });
  return f;
}

const requireEnabled = (user) => {
  if (!user.mfaEnabled) throw new ApiError("MFA_NOT_ENABLED");
};

const bumpToken = () => sequelize.literal('"tokenVersion" + 1');

// ================================================================ ĐĂNG NHẬP BƯỚC 2
router.post(
  "/auth/mfa/verify",
  limitMfa,
  jsonIfBody,
  asyncHandler(async (req, res) => {
    const b = body(req);
    const r = verifyJwt(str(b.challenge), "mfa"); // token "access" không dùng được ở đây và ngược lại (typ khác -> từ chối)
    if (!r.ok) throw new ApiError(r.expired ? "TOKEN_EXPIRED" : "UNAUTHENTICATED");
    const user = await User.findByPk(Number(r.payload.sub));
    if (!user || !user.emailVerifiedAt || !user.mfaEnabled || user.tokenVersion !== r.payload.tv)
      throw new ApiError("UNAUTHENTICATED");
    assertNotLocked(user);

    const f = await secondFactor(user, b);
    if (!f.good) await fail(user);

    await user.update({ failedMfa: 0, mfaLockedUntil: null, lastLoginAt: new Date() });
    const data = tokenPayload(user);
    if (f.kind === "recovery") {
      data.recoveryUsed = true;
      data.recoveryRemaining = await RecoveryCode.count({ where: { userId: user.id, usedAt: null } });
    }
    ok(res, data);
  }),
);

// ================================================================ QUẢN LÝ MFA (Bearer)
router.get("/mfa/status", limitMfa, authenticate, (req, res) =>
  ok(res, { enabled: !!req.user.mfaEnabled, setupPending: !!req.user.mfaPendingSecret }),
);

router.post(
  "/mfa/setup",
  limitMfa,
  authenticate,
  jsonIfBody,
  asyncHandler(async (req, res) => {
    const user = req.user;
    if (user.mfaEnabled) await reauth(user, body(req)); // ĐỔI THIẾT BỊ: phải xác thực lại
    const secret = generateSecret();
    // khóa mới chỉ nằm ở "chờ": bỏ dở giữa chừng thì MFA cũ (nếu có) vẫn nguyên
    await user.update({ mfaPendingSecret: encryptSecret(secret) });
    const url = otpauthUrl({ issuer: ISSUER, account: user.email, secret });
    const qrDataUrl = await QRCode.toDataURL(url, { margin: 1, width: 256, errorCorrectionLevel: "M" });
    res.set("Cache-Control", "no-store");
    ok(res, { secret, otpauthUrl: url, qrDataUrl });
  }),
);

router.post(
  "/mfa/enable",
  limitMfa,
  authenticate,
  jsonIfBody,
  asyncHandler(async (req, res) => {
    const user = req.user;
    const code = str(body(req).code).trim();
    if (!/^\d{6}$/.test(code)) throw invalid("code", "Vui lòng nhập đủ 6 số.");
    if (!user.mfaPendingSecret) throw new ApiError("MFA_SETUP_REQUIRED");
    assertNotLocked(user);

    const pending = user.mfaPendingSecret;
    const secret = decryptSecret(pending);
    const step = secret ? verifyTotp(secret, code) : null;
    if (step === null) await fail(user);

    const first = !user.mfaEnabled;
    const batch = first ? makeBatch(user.id) : null;
    await sequelize.transaction(async (t) => {
      // chiếm khóa "chờ" bằng UPDATE có điều kiện: 2 request cùng lúc chỉ 1 request thắng
      const [n] = await User.update(
        {
          mfaSecret: pending,
          mfaPendingSecret: null,
          mfaEnabled: true,
          mfaLastStep: step,
          failedMfa: 0,
          mfaLockedUntil: null,
          tokenVersion: bumpToken(),
        },
        { where: { id: user.id, mfaPendingSecret: pending }, transaction: t },
      );
      if (n !== 1) throw new ApiError("MFA_SETUP_REQUIRED");
      if (first) {
        await RecoveryCode.destroy({ where: { userId: user.id }, transaction: t });
        await RecoveryCode.bulkCreate(batch.rows, { transaction: t });
      }
    });
    await user.reload();
    // tokenVersion+1: mọi token cũ (kể cả token đang gọi API này) chết -> trả token mới cho phiên hiện tại
    ok(res, { ...tokenPayload(user), recoveryCodes: first ? batch.codes : null });
  }),
);

router.post(
  "/mfa/disable",
  limitMfa,
  authenticate,
  jsonIfBody,
  asyncHandler(async (req, res) => {
    const user = req.user;
    requireEnabled(user);
    await reauth(user, body(req));
    await sequelize.transaction(async (t) => {
      await user.update(
        {
          mfaEnabled: false,
          mfaSecret: null,
          mfaPendingSecret: null,
          mfaLastStep: null,
          failedMfa: 0,
          mfaLockedUntil: null,
          tokenVersion: bumpToken(),
        },
        { transaction: t },
      );
      await RecoveryCode.destroy({ where: { userId: user.id }, transaction: t });
    });
    await user.reload();
    ok(res, tokenPayload(user));
  }),
);

router.post(
  "/mfa/recovery-codes/status",
  limitMfa,
  authenticate,
  jsonIfBody,
  asyncHandler(async (req, res) => {
    const user = req.user;
    requireEnabled(user);
    await reauth(user, body(req));
    const rows = await RecoveryCode.findAll({ where: { userId: user.id }, attributes: ["usedAt", "createdAt"] });
    res.set("Cache-Control", "no-store");
    ok(res, {
      total: rows.length,
      remaining: rows.filter((x) => !x.usedAt).length,
      createdAt: rows.length ? new Date(Math.min(...rows.map((x) => x.createdAt))) : null,
    });
  }),
);

router.post(
  "/mfa/recovery-codes/regenerate",
  limitMfa,
  authenticate,
  jsonIfBody,
  asyncHandler(async (req, res) => {
    const user = req.user;
    requireEnabled(user);
    await reauth(user, body(req));
    const batch = makeBatch(user.id);
    await sequelize.transaction(async (t) => {
      await RecoveryCode.destroy({ where: { userId: user.id }, transaction: t }); // nhóm cũ vô hiệu ngay
      await RecoveryCode.bulkCreate(batch.rows, { transaction: t });
    });
    res.set("Cache-Control", "no-store");
    ok(res, { recoveryCodes: batch.codes });
  }),
);

module.exports = router;
