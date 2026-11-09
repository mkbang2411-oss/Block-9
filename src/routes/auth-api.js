// ===== /api/auth/* (JWT) =====
//   POST /api/auth/login   { email, password, recaptcha? }
//        -> ok:true  { accessToken, tokenType:"Bearer", expiresIn, user }            (chưa bật MFA)
//        -> ok:true  { next:"mfa", challenge }                                      (đã bật MFA: CHƯA có accessToken; xem /api/auth/mfa/verify)
//        -> ok:false INVALID_CREDENTIALS (error.details.needCaptcha) | CAPTCHA_REQUIRED | ACCOUNT_NOT_ACTIVATED   (HTTP 200)
//        -> 429 RATE_LIMITED (tài khoản đang bị khóa, kèm details.lockedSeconds, hoặc quá giới hạn theo IP)
//   GET  /api/auth/me      Bearer -> { id, name, email, role, chefId, mfaEnabled }
//   POST /api/auth/logout  Bearer (tùy chọn) -> client xóa token; server trả ok. Token vẫn sống đến khi hết hạn (access 15 phút).
//   POST /api/auth/avatar  Bearer, multipart/form-data, trường "avatar" (JPG/PNG/WEBP <= 3MB) -> ok:true user (có avatarUrl)
//        server tự cắt vuông 512px + WEBP rồi lưu Supabase; ảnh lỗi/sai định dạng -> ok:false VALIDATION_FAILED fields.avatar
//   DELETE /api/auth/avatar Bearer -> ok:true user (avatarUrl = null)
// Chống dò mật khẩu: cửa sổ 15 phút kể từ lần sai ĐẦU TIÊN; sai từ 3 lần -> bắt CAPTCHA; sai 10 lần -> khóa 5 phút.
// Email không có tài khoản cũng bị đếm (RAM) và vẫn chạy bcrypt với hash giả -> không dò được email nào đã đăng ký.
const express = require("express");
const multer = require("multer");
const bcrypt = require("bcryptjs");
const { User } = require("../models");
const { authenticate } = require("../middleware/auth");
const { signAccess, signMfaChallenge } = require("../utils/jwt");
const { verifyRecaptcha } = require("../utils/recaptcha");
const { rateLimit } = require("../utils/rateLimit");
const { normEmail } = require("../utils/validators");
const { asyncHandler } = require("../utils/format");
const { ApiError } = require("../api/errors");
const { ok } = require("../api/response");
const serialize = require("../api/serializers");
const storage = require("../utils/storage"); // gọi qua object (storage.uploadAvatar) để test thay được bản giả

const router = express.Router();

const BCRYPT_COST = 12;
const FAIL_WINDOW_MS = 15 * 60 * 1000;
const CAPTCHA_AFTER = 3;
const LOCK_AFTER = 10;
const LOCK_MS = 5 * 60 * 1000;
const DUMMY_HASH = bcrypt.hashSync("khong-ton-tai", BCRYPT_COST);

const limitLogin = rateLimit({ windowMs: 15 * 60 * 1000, max: 30 });

// bộ đếm cho email không có tài khoản (RAM)
const ghostFails = new Map();
setInterval(() => {
  const now = Date.now();
  for (const [k, v] of ghostFails)
    if ((!v.lockedUntil || v.lockedUntil <= now) && now - v.at > 60 * 60 * 1000) ghostFails.delete(k);
}, 15 * 60 * 1000).unref();

const activeFails = (st) =>
  st.windowStart && Date.now() - new Date(st.windowStart).getTime() < FAIL_WINDOW_MS ? st.fails : 0;

// "15m" | "900" | "5s" -> giây (để trả expiresIn cho SPA)
function ttlSeconds() {
  const v = process.env.JWT_EXPIRES_IN || "15m";
  const m = /^(\d+)\s*([smhd]?)$/.exec(v);
  if (!m) return 900;
  return Number(m[1]) * ({ "": 1, s: 1, m: 60, h: 3600, d: 86400 }[m[2]]);
}
const tokenPayload = (user) => ({
  accessToken: signAccess(user),
  tokenType: "Bearer",
  expiresIn: ttlSeconds(),
  user: serialize.user(user),
});

// ---------------------------------------------------------------- đăng nhập
router.post(
  "/login",
  limitLogin,
  asyncHandler(async (req, res) => {
    if (!req.is("application/json")) throw new ApiError("UNSUPPORTED_MEDIA_TYPE");
    const body = req.body || {};
    const email = normEmail(body.email);
    const password = typeof body.password === "string" ? body.password : "";
    if (!email || !password || password.length > 200)
      throw new ApiError("VALIDATION_FAILED", {
        message: "Vui lòng nhập email và mật khẩu.",
        fields: {
          ...(!email && { email: "Vui lòng nhập email" }),
          ...(!password && { password: "Vui lòng nhập mật khẩu" }),
        },
      });

    const user = await User.findOne({ where: { email } });
    const raw = user
      ? { fails: user.failedLogins, windowStart: user.windowStart, lockedUntil: user.lockedUntil }
      : ghostFails.get(email) || { fails: 0, windowStart: null, lockedUntil: null };
    const st = { ...raw, fails: activeFails(raw) };

    // đang khóa: từ chối ngay, dù mật khẩu đúng hay sai
    if (st.lockedUntil && st.lockedUntil > new Date()) {
      const giay = Math.max(1, Math.ceil((st.lockedUntil - Date.now()) / 1000));
      throw new ApiError("RATE_LIMITED", {
        message: `Bạn đã nhập sai quá nhiều lần. Vui lòng thử lại sau khoảng ${Math.ceil(giay / 60)} phút.`,
        headers: { "Retry-After": giay },
        extra: { lockedSeconds: giay },
      });
    }

    // sai từ 3 lần: PHẢI qua CAPTCHA trước khi server kiểm tra mật khẩu
    if (st.fails >= CAPTCHA_AFTER) {
      const token = body.recaptcha || body["g-recaptcha-response"];
      if (!(await verifyRecaptcha(token, req.ip, req.hostname)))
        throw new ApiError("CAPTCHA_REQUIRED", { extra: { needCaptcha: true } });
    }

    // luôn chạy bcrypt (kể cả email không tồn tại) để thời gian xử lý như nhau
    const match = await bcrypt.compare(password, user ? user.passwordHash : DUMMY_HASH);

    if (!user || !match) {
      const fails = st.fails + 1;
      const khoa = fails >= LOCK_AFTER;
      const lockedUntil = khoa ? new Date(Date.now() + LOCK_MS) : null;
      const windowStart = st.fails === 0 ? new Date() : raw.windowStart;
      if (user)
        await user.update({
          failedLogins: khoa ? 0 : fails,
          windowStart: khoa ? null : windowStart,
          lockedUntil,
        });
      else {
        if (ghostFails.size > 20000) ghostFails.clear();
        ghostFails.set(email, {
          fails: khoa ? 0 : fails,
          windowStart: khoa ? null : windowStart,
          lockedUntil,
          at: Date.now(),
        });
      }
      if (khoa)
        throw new ApiError("RATE_LIMITED", {
          message: "Bạn đã nhập sai 10 lần. Đăng nhập tạm khóa 5 phút, vui lòng thử lại sau.",
          headers: { "Retry-After": LOCK_MS / 1000 },
          extra: { lockedSeconds: LOCK_MS / 1000 },
        });
      // cùng 1 thông báo cho "email không tồn tại" và "sai mật khẩu"
      throw new ApiError("INVALID_CREDENTIALS", { extra: { needCaptcha: fails >= CAPTCHA_AFTER } });
    }

    // mật khẩu đúng nhưng tài khoản pending -> KHÔNG cấp token
    if (!user.emailVerifiedAt) throw new ApiError("ACCOUNT_NOT_ACTIVATED");

    await user.update({ failedLogins: 0, windowStart: null, lockedUntil: null });

    // đã bật MFA: chỉ trả challenge (sống ngắn), CHƯA có accessToken
    if (user.mfaEnabled)
      return ok(res, { next: "mfa", challenge: signMfaChallenge(user) });

    await user.update({ lastLoginAt: new Date() });
    ok(res, tokenPayload(user));
  }),
);

// ---------------------------------------------------------------- người dùng hiện tại
router.get("/me", authenticate, (req, res) => ok(res, serialize.user(req.user)));

// ---------------------------------------------------------------- đăng xuất
// JWT không lưu trên server nên "đăng xuất" = client xóa token. Muốn thu hồi ngay: tokenVersion + 1 (đổi mật khẩu/khóa/đổi role).
router.post("/logout", (req, res) => ok(res, null));

// ---------------------------------------------------------------- ảnh đại diện
const limitAvatar = rateLimit({ windowMs: 60 * 60 * 1000, max: 20 });
const AVATAR_MAX_BYTES = 3 * 1024 * 1024;
const avatarUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: AVATAR_MAX_BYTES, files: 1, fields: 5, parts: 8 },
});
// lỗi multer (quá lớn, sai tên trường...) -> VALIDATION_FAILED fields.avatar, không để thành 500
const nhanAvatar = (req, res, next) => {
  if (!req.is("multipart/form-data"))
    return next(
      new ApiError("UNSUPPORTED_MEDIA_TYPE", { message: "Content-Type phải là multipart/form-data (trường \"avatar\")." }),
    );
  avatarUpload.single("avatar")(req, res, (err) => {
    if (!err) return next();
    const msg =
      err.code === "LIMIT_FILE_SIZE" ? "Ảnh tối đa 3MB" : "Không đọc được ảnh, vui lòng thử lại";
    next(new ApiError("VALIDATION_FAILED", { message: msg, fields: { avatar: msg } }));
  });
};

// xóa file cũ/mới dở dang: lỗi dọn dẹp chỉ ghi log, không làm hỏng request đã thành công
const cleanupFile = (path) =>
  storage.removeFile(path).catch((e) => console.error("[avatar] không xóa được file Storage:", path, e.message));

router.post(
  "/avatar",
  limitAvatar,
  authenticate,
  nhanAvatar,
  asyncHandler(async (req, res) => {
    if (!req.file)
      throw new ApiError("VALIDATION_FAILED", {
        message: "Vui lòng chọn ảnh đại diện.",
        fields: { avatar: "Vui lòng chọn ảnh đại diện" },
      });
    // kiểm theo NỘI DUNG ảnh (không tin mimetype/đuôi file do client khai)
    const r = await storage.processAvatar(req.file.buffer);
    if (r.error) throw new ApiError("VALIDATION_FAILED", { message: r.error, fields: { avatar: r.error } });

    const up = await storage.uploadAvatar(r.buffer, req.user.id); // lỗi Storage -> 500 qua bộ xử lý lỗi chung
    const oldPath = req.user.avatarPath;
    try {
      await req.user.update({ avatarUrl: up.url, avatarPath: up.path });
    } catch (e) {
      await cleanupFile(up.path); // ghi DB lỗi thì không để lại file mồ côi
      throw e;
    }
    if (oldPath && oldPath !== up.path) await cleanupFile(oldPath);
    ok(res, serialize.user(req.user));
  }),
);

router.delete(
  "/avatar",
  authenticate,
  asyncHandler(async (req, res) => {
    const oldPath = req.user.avatarPath;
    await req.user.update({ avatarUrl: null, avatarPath: null });
    if (oldPath) await cleanupFile(oldPath);
    ok(res, serialize.user(req.user));
  }),
);

module.exports = router;
module.exports.tokenPayload = tokenPayload;
