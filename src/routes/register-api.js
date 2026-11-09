// ===== Đăng ký (3 bước, OTP email) + quên / đặt lại mật khẩu: /api/auth/* =====
// Port từ routes/auth.js của Block 8: logic giữ nguyên, đổi sang JSON { ok, data } / mã lỗi API, bỏ cookie/CSRF/redirect.
//   POST /register/otp   { email, recaptcha }                       bước 1: CAPTCHA TRƯỚC, rồi gửi OTP 6 số. Email đã có tài khoản vẫn trả y hệt ({cooldown}) -> không dò được email
//   POST /register/verify{ email, otp }                             bước 2: đúng -> { ticket } dùng 1 lần
//   POST /register      { email, ticket, name, password, passwordConfirm, inviteCode? }
//                                                                  bước 3: tạo tài khoản ĐÃ xác minh. role luôn "viewer"; đúng CHEF_INVITE_CODE -> "editor" (chefId do admin gán sau). BỎ QUA role client gửi.
//                                                                  Không trả accessToken: đăng ký xong phải đăng nhập.
//   POST /forgot-password{ email }                                  luôn { cooldown }, việc gửi mail chạy nền (cùng nội dung + cùng độ trễ dù email có hay không)
//   GET  /reset-password/check?token=                               chỉ ĐỌC: token còn hiệu lực -> { valid:true }, ngược lại INVALID_RESET_TOKEN
//   POST /reset-password { token, password, passwordConfirm }       đổi mật khẩu, tokenVersion+1 (mọi JWT cũ chết), mở khóa, gửi mail "đã đổi". Không cấp token, KHÔNG tắt MFA.
// Lỗi: dữ liệu sai -> VALIDATION_FAILED (+fields) | OTP_INVALID | TICKET_INVALID | INVALID_RESET_TOKEN (HTTP 200, ok:false) | quá giới hạn -> 429 RATE_LIMITED + Retry-After | gửi mail hỏng -> 502 EMAIL_SEND_FAILED
const crypto = require("crypto");
const express = require("express");
const bcrypt = require("bcryptjs");
const { Op } = require("sequelize");
const { sequelize, User, PasswordReset, RegisterOtp } = require("../models");
const { randomToken, sha256, safeEqual } = require("../utils/security");
const { sendMail, otpEmailContent, resetLinkEmailContent, existsEmailContent, passwordChangedEmailContent } = require("../utils/mailer");
const { verifyRecaptcha } = require("../utils/recaptcha");
const { rateLimit, keyLimiter } = require("../utils/rateLimit");
const { asyncHandler } = require("../utils/format");
const V = require("../utils/validators");
const { ApiError } = require("../api/errors");
const { ok } = require("../api/response");

const router = express.Router();
const { normEmail } = V;

const BCRYPT_COST = 12;
const RESEND_COOLDOWN_MS = 60 * 1000;
const REGISTER_OTP_MINUTES = 5;
const RESET_LINK_MINUTES = 30;
const OTP_MAX_TRIES = 5;
const OTP_LOCK_MINUTES = 15;
const OTP_MAX_SENDS = 5;
const OTP_SEND_WINDOW_MS = 60 * 60 * 1000;
const TICKET_MINUTES = 15;
const TOKEN_RE = /^[a-f0-9]{64}$/;
const HOUR = 60 * 60 * 1000;

const limitOtp = rateLimit({ windowMs: HOUR, max: 15 });
const limitVerify = rateLimit({ windowMs: 15 * 60 * 1000, max: 30 });
const limitRegister = rateLimit({ windowMs: HOUR, max: 10 });
const limitForgot = rateLimit({ windowMs: HOUR, max: 10 });
const limitReset = rateLimit({ windowMs: 15 * 60 * 1000, max: 20 });
const limitForgotEmail = keyLimiter({ windowMs: HOUR, max: 5 });

// SPA chạy cùng origin với API: link trong email trỏ về trang SPA /reset-password?token=
const baseUrl = (req) => (process.env.APP_URL ? process.env.APP_URL.replace(/\/+$/, "") : `${req.protocol}://${req.get("host")}`);
const newOtp = () => String(crypto.randomInt(0, 1000000)).padStart(6, "0");
const otpHashReg = (email, otp) => sha256(`reg:${email}:${otp}`);
const invalid = (field, message) => new ApiError("VALIDATION_FAILED", { message, fields: { [field]: message } });
const tooMany = (ms, msg) =>
  new ApiError("RATE_LIMITED", {
    message: `${msg} Vui lòng thử lại sau ${Math.max(1, Math.ceil(ms / 60000))} phút.`,
    headers: { "Retry-After": Math.max(1, Math.ceil(ms / 1000)) },
  });
const jsonOnly = (req, res, next) => (req.is("application/json") ? next() : next(new ApiError("UNSUPPORTED_MEDIA_TYPE")));
const body = (req) => (req.body && typeof req.body === "object" ? req.body : {});
const str = (v) => (typeof v === "string" ? v : "");

// ---------------------------------------------------------------- BƯỚC 1
router.post(
  "/register/otp",
  limitOtp,
  jsonOnly,
  asyncHandler(async (req, res) => {
    const email = normEmail(str(body(req).email));
    const eEmail = V.validateEmail(email);
    if (eEmail) throw invalid("email", eEmail);

    // CAPTCHA qua TRƯỚC mọi thao tác khác: bot không có token thì không bắt được server gửi mail
    if (!(await verifyRecaptcha(body(req).recaptcha, req.ip, req.hostname)))
      throw invalid("captcha", "Vui lòng xác nhận bạn không phải người máy.");

    const now = new Date();
    const nowMs = now.getTime();
    const COOLDOWN = { cooldown: RESEND_COOLDOWN_MS / 1000 };

    let old = await RegisterOtp.findOne({ where: { email } });
    let resetAttempts = false;
    let sendCount = 1;
    let windowStart = now;
    if (old) {
      if (old.lockedUntil && old.lockedUntil.getTime() > nowMs)
        throw tooMany(old.lockedUntil.getTime() - nowMs, "Bạn đã nhập sai mã quá nhiều lần.");
      resetAttempts = !!old.lockedUntil;
      if (nowMs - old.sentAt.getTime() < RESEND_COOLDOWN_MS) return ok(res, COOLDOWN);
      const ws = (old.sendWindowStart || old.sentAt).getTime();
      if (nowMs - ws < OTP_SEND_WINDOW_MS) {
        if (old.sendCount >= OTP_MAX_SENDS)
          throw tooMany(ws + OTP_SEND_WINDOW_MS - nowMs, "Bạn đã yêu cầu mã quá nhiều lần.");
        sendCount = old.sendCount + 1;
        windowStart = new Date(ws);
      }
    }

    // email đã có tài khoản: không có OTP thật, chỉ gửi thư "bạn đã có tài khoản"; email mới: OTP thật
    const existing = await User.findOne({ where: { email } });
    const hasAccount = !!(existing && existing.emailVerifiedAt);
    const otp = hasAccount ? null : newOtp();
    const fields = {
      otpHash: otp ? otpHashReg(email, otp) : sha256(randomToken()),
      expiresAt: new Date(nowMs + REGISTER_OTP_MINUTES * 60 * 1000),
      sentAt: now,
      ticketHash: null,
      ticketExpires: null,
      sendCount,
      sendWindowStart: windowStart,
    };
    // gửi lại mã KHÔNG làm attempts về 0 (chỉ hết khóa mới reset)
    if (resetAttempts) {
      fields.attempts = 0;
      fields.lockedUntil = null;
    }

    // ghi nguyên tử: 2 request song song chỉ 1 request giành được lượt gửi
    if (old) {
      const [claimed] = await RegisterOtp.update(fields, { where: { id: old.id, sentAt: old.sentAt } });
      if (!claimed) return ok(res, COOLDOWN);
    } else {
      try {
        await RegisterOtp.create({ email, ...fields });
      } catch (err) {
        if (err.name === "SequelizeUniqueConstraintError") return ok(res, COOLDOWN);
        throw err;
      }
    }

    try {
      if (hasAccount) await sendMail({ to: email, ...existsEmailContent({ name: existing.name, baseUrl: baseUrl(req) }) });
      else await sendMail({ to: email, ...otpEmailContent({ name: "", otp, minutes: REGISTER_OTP_MINUTES, baseUrl: baseUrl(req) }) });
    } catch (err) {
      console.error("Gửi email đăng ký thất bại:", err.message);
      // không xóa dòng (sẽ reset bộ đếm): chỉ vô hiệu OTP vừa tạo và cho gửi lại ngay
      await RegisterOtp.update({ otpHash: sha256(randomToken()), expiresAt: now, sentAt: new Date(0) }, { where: { email } });
      throw new ApiError("EMAIL_SEND_FAILED");
    }
    ok(res, COOLDOWN);
  }),
);

// ---------------------------------------------------------------- BƯỚC 2
router.post(
  "/register/verify",
  limitVerify,
  jsonOnly,
  asyncHandler(async (req, res) => {
    const email = normEmail(str(body(req).email));
    const otp = str(body(req).otp).trim();
    if (V.validateEmail(email)) throw invalid("email", "Email không hợp lệ.");
    if (!V.OTP_RE.test(otp)) throw invalid("otp", "Vui lòng nhập đủ 6 số.");

    const LOCKED = "Bạn đã nhập sai mã quá nhiều lần.";
    const now = new Date();
    const row = await RegisterOtp.findOne({ where: { email } });
    if (!row) throw new ApiError("OTP_INVALID");
    if (row.lockedUntil && row.lockedUntil > now) throw tooMany(row.lockedUntil - now, LOCKED);
    if (row.ticketHash || row.expiresAt < now || row.attempts >= OTP_MAX_TRIES) throw new ApiError("OTP_INVALID");

    // giành 1 lượt thử bằng MỘT câu UPDATE nguyên tử: 100 request song song cũng chỉ có tối đa 5 lượt so OTP
    const col = sequelize.getQueryInterface().quoteIdentifier("attempts");
    const [claimed] = await RegisterOtp.update(
      { attempts: sequelize.literal(`${col} + 1`) },
      { where: { id: row.id, otpHash: row.otpHash, ticketHash: null, attempts: { [Op.lt]: OTP_MAX_TRIES } } },
    );
    if (!claimed) {
      await row.reload();
      if (row.lockedUntil && row.lockedUntil > now) throw tooMany(row.lockedUntil - now, LOCKED);
      throw new ApiError("OTP_INVALID");
    }
    if (!safeEqual(row.otpHash, otpHashReg(email, otp))) {
      await row.reload();
      if (row.attempts >= OTP_MAX_TRIES) {
        await RegisterOtp.update({ lockedUntil: new Date(Date.now() + OTP_LOCK_MINUTES * 60 * 1000) }, { where: { id: row.id, lockedUntil: null } });
        throw tooMany(OTP_LOCK_MINUTES * 60 * 1000, LOCKED);
      }
      throw new ApiError("OTP_INVALID");
    }
    // OTP đúng: vô hiệu OTP, cấp vé dùng 1 lần cho bước 3 (chỉ 1 request song song nhận được vé)
    const ticket = randomToken();
    const [issued] = await RegisterOtp.update(
      { otpHash: sha256(randomToken()), ticketHash: sha256(ticket), ticketExpires: new Date(Date.now() + TICKET_MINUTES * 60 * 1000) },
      { where: { id: row.id, ticketHash: null } },
    );
    if (!issued) throw new ApiError("OTP_INVALID");
    ok(res, { ticket });
  }),
);

// ---------------------------------------------------------------- BƯỚC 3
router.post(
  "/register",
  limitRegister,
  jsonOnly,
  asyncHandler(async (req, res) => {
    const b = body(req);
    const email = normEmail(str(b.email));
    const ticket = str(b.ticket);
    const name = str(b.name).trim().replace(/\s+/g, " ");
    const password = str(b.password);
    const passwordConfirm = str(b.passwordConfirm);
    const inviteCode = str(b.inviteCode).trim(); // KHÔNG đọc b.role / b.chefId: quyền không do client quyết định

    const row = V.validateEmail(email) ? null : await RegisterOtp.findOne({ where: { email } });
    if (!row || !row.ticketHash || !row.ticketExpires || row.ticketExpires < new Date() || !TOKEN_RE.test(ticket) || !safeEqual(row.ticketHash, sha256(ticket)))
      throw new ApiError("TICKET_INVALID");

    const fields = {};
    const eName = V.validateName(name);
    if (eName) fields.name = eName;
    let role = "viewer";
    if (inviteCode) {
      const expected = process.env.CHEF_INVITE_CODE || "";
      if (!expected || !safeEqual(sha256(inviteCode), sha256(expected))) fields.inviteCode = "Mã mời không đúng.";
      else role = "editor";
    }
    const ePass = V.validatePassword(password, { email, name });
    if (ePass) fields.password = ePass;
    else if (password !== passwordConfirm) fields.passwordConfirm = "Mật khẩu nhập lại chưa khớp.";
    if (Object.keys(fields).length) throw new ApiError("VALIDATION_FAILED", { message: "Dữ liệu chưa hợp lệ.", fields });

    const passwordHash = await bcrypt.hash(password, BCRYPT_COST);
    const user = await User.findOne({ where: { email } });
    if (user && user.emailVerifiedAt) throw new ApiError("ALREADY_EXISTS", { message: "Email này đã có tài khoản." });
    // chiếm vé bằng DELETE có điều kiện: 2 request song song cùng vé chỉ 1 request thắng
    const claimed = await RegisterOtp.destroy({ where: { id: row.id, ticketHash: row.ticketHash } });
    if (!claimed) throw new ApiError("TICKET_INVALID");
    try {
      if (user)
        await user.update({ name, role, chefId: null, passwordHash, emailVerifiedAt: new Date(), failedLogins: 0, windowStart: null, lockedUntil: null });
      else await User.create({ name, email, role, passwordHash, emailVerifiedAt: new Date() });
    } catch (err) {
      if (err.name === "SequelizeUniqueConstraintError") throw new ApiError("ALREADY_EXISTS", { message: "Email này đã có tài khoản." });
      throw err;
    }
    ok(res, null);
  }),
);

// ---------------------------------------------------------------- QUÊN MẬT KHẨU
// Phần tốn thời gian (tra DB, tạo token, GỬI MAIL) chạy NỀN sau khi đã trả lời -> email có/không có tài khoản cùng phản hồi và cùng độ trễ
async function guiLinkDatLai(email, base) {
  const user = await User.findOne({ where: { email } });
  if (!user || !user.emailVerifiedAt) return;
  const old = await PasswordReset.findOne({ where: { userId: user.id, usedAt: null }, order: [["sentAt", "DESC"]] });
  if (old && Date.now() - old.sentAt.getTime() < RESEND_COOLDOWN_MS) return;
  const token = randomToken();
  await PasswordReset.destroy({ where: { userId: user.id, usedAt: null } }); // mỗi người 1 link chưa dùng; dòng đã dùng giữ làm bằng chứng
  await PasswordReset.create({ userId: user.id, tokenHash: sha256(token), expiresAt: new Date(Date.now() + RESET_LINK_MINUTES * 60 * 1000), sentAt: new Date() });
  await sendMail({
    to: user.email,
    ...resetLinkEmailContent({ name: user.name, link: `${base}/reset-password?token=${token}`, minutes: RESET_LINK_MINUTES, baseUrl: base }),
  });
}

router.post(
  "/forgot-password",
  limitForgot,
  jsonOnly,
  asyncHandler(async (req, res) => {
    const email = normEmail(str(body(req).email));
    const eEmail = V.validateEmail(email);
    if (eEmail) throw invalid("email", eEmail);
    const cho = limitForgotEmail(email);
    if (cho) throw tooMany(cho, "Bạn đã yêu cầu đặt lại mật khẩu quá nhiều lần.");
    guiLinkDatLai(email, baseUrl(req)).catch((err) => console.error("Gửi link đặt lại mật khẩu thất bại:", err.message));
    ok(res, { cooldown: RESEND_COOLDOWN_MS / 1000 });
  }),
);

// token còn hiệu lực -> dòng PasswordReset; sai định dạng / không có / hết hạn / đã dùng -> null. CHỈ ĐỌC.
const findReset = (token) =>
  TOKEN_RE.test(token)
    ? PasswordReset.findOne({ where: { tokenHash: sha256(token), usedAt: null, expiresAt: { [Op.gt]: new Date() } } })
    : null;
const noTrace = (req, res, next) => {
  res.set({ "Cache-Control": "no-store", "Referrer-Policy": "no-referrer" });
  next();
};

router.get(
  "/reset-password/check",
  limitReset,
  noTrace,
  asyncHandler(async (req, res) => {
    if (!(await findReset(str(req.query.token)))) throw new ApiError("INVALID_RESET_TOKEN");
    ok(res, { valid: true });
  }),
);

router.post(
  "/reset-password",
  limitReset,
  noTrace,
  jsonOnly,
  asyncHandler(async (req, res) => {
    const b = body(req);
    const token = str(b.token);
    const password = str(b.password);
    const passwordConfirm = str(b.passwordConfirm);
    const row = await findReset(token);
    if (!row) throw new ApiError("INVALID_RESET_TOKEN");
    const user = await User.findByPk(row.userId);
    if (!user) throw new ApiError("INVALID_RESET_TOKEN");

    const fields = {};
    const ePass = V.validatePassword(password, { email: user.email, name: user.name });
    if (ePass) fields.password = ePass;
    else if (password !== passwordConfirm) fields.passwordConfirm = "Mật khẩu nhập lại chưa khớp.";
    if (Object.keys(fields).length) throw new ApiError("VALIDATION_FAILED", { message: "Dữ liệu chưa hợp lệ.", fields });

    const passwordHash = await bcrypt.hash(password, BCRYPT_COST);
    // 1 giao dịch: chiếm token (UPDATE có điều kiện usedAt IS NULL -> 2 request cùng lúc chỉ 1 thắng), đổi mật khẩu, mở khóa,
    // tokenVersion+1 => mọi JWT đang sống của tài khoản bị từ chối. KHÔNG đụng tới MFA.
    const dungDuoc = await sequelize.transaction(async (t) => {
      const [n] = await PasswordReset.update({ usedAt: new Date() }, { where: { id: row.id, usedAt: null, expiresAt: { [Op.gt]: new Date() } }, transaction: t });
      if (n !== 1) return false;
      await user.update({ passwordHash, failedLogins: 0, windowStart: null, lockedUntil: null, tokenVersion: user.tokenVersion + 1 }, { transaction: t });
      return true;
    });
    if (!dungDuoc) throw new ApiError("INVALID_RESET_TOKEN");

    sendMail({ to: user.email, ...passwordChangedEmailContent({ name: user.name, baseUrl: baseUrl(req), when: new Date() }) }).catch((err) =>
      console.error("Gửi email 'mật khẩu đã thay đổi' thất bại:", err.message),
    );
    ok(res, null);
  }),
);

module.exports = router;
