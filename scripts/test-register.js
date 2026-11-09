// Kiểm thử Đợt 2: đăng ký 3 bước (OTP), quên/đặt lại mật khẩu, khóa OTP, thu hồi token. Chạy: npm run test:register
// Mail không gửi thật: bật DEV_PRINT_MAIL=1 rồi bắt console.log để lấy OTP / link.
require("dotenv").config();
process.env.JWT_SECRET = process.env.JWT_SECRET || "test-secret-test-secret-test-secret-123456";
process.env.DEV_PRINT_MAIL = "1";
process.env.NODE_ENV = "development";
process.env.CHEF_INVITE_CODE = "ma-moi-thu-nghiem";
delete process.env.RECAPTCHA_SECRET_KEY; // dev: bỏ qua kiểm tra CAPTCHA
delete process.env.SMTP_HOST; delete process.env.SMTP_USER; delete process.env.RESEND_API_KEY;
let mailLog = "";
const origLog = console.log;
console.log = (...a) => { const s = a.join(" "); if (s.includes("DEV_PRINT_MAIL=1")) mailLog += s + "\n"; else origLog(...a); };
const app = require("../src/app");
const { sequelize, User, RegisterOtp, PasswordReset } = require("../src/models");

let pass = 0, fail = 0;
const check = (n, c, x = "") => { c ? pass++ : fail++; origLog(`${c ? "PASS" : "FAIL"}  ${n}${c ? "" : "  " + x}`); };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

(async () => {
  await sequelize.sync();
  const srv = app.listen(0);
  const base = `http://127.0.0.1:${srv.address().port}/api`;
  const call = async (method, path, b, token) => {
    const r = await fetch(base + path, { method, headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) }, body: b ? JSON.stringify(b) : undefined });
    let j = null; try { j = await r.json(); } catch (e) {}
    return { status: r.status, json: j, headers: r.headers };
  };
  const sfx = Date.now().toString(36);
  const email = `reg-${sfx}@t.test`, email2 = `inv-${sfx}@t.test`;
  const PW = "Mk9xTest123";
  const lastOtp = () => { const m = [...mailLog.matchAll(/\b(\d{6})\b/g)]; return m.length ? m[m.length - 1][1] : null; };

  // --- bước 1 + 2 + 3
  let r = await call("POST", "/auth/register/otp", { email: "khong-hop-le" });
  check("B13 email sai -> VALIDATION_FAILED fields.email", r.json.ok === false && r.json.error.fields && r.json.error.fields.email);
  r = await call("POST", "/auth/register/otp", { email });
  check("B13 bước 1: ok + cooldown 60", r.json.ok === true && r.json.data.cooldown === 60, JSON.stringify(r.json));
  const otp = lastOtp();
  check("B13 OTP 6 số được 'gửi' (DEV_PRINT_MAIL) và KHÔNG nằm trong response/DB", !!otp && !JSON.stringify(r.json).includes(otp) && !(await RegisterOtp.findOne({ where: { email } })).otpHash.includes(otp));
  r = await call("POST", "/auth/register/verify", { email, otp: otp === "000000" ? "111111" : "000000" });
  check("B13 OTP sai -> OTP_INVALID (HTTP 200 ok:false)", r.status === 200 && r.json.error.code === "OTP_INVALID");
  r = await call("POST", "/auth/register", { email, ticket: "a".repeat(64), name: "Nguyen Van A", password: PW, passwordConfirm: PW });
  check("B13 bước 3 không có vé hợp lệ -> TICKET_INVALID", r.json.error.code === "TICKET_INVALID");
  r = await call("POST", "/auth/register/verify", { email, otp });
  const ticket = r.json.data && r.json.data.ticket;
  check("B13 bước 2: OTP đúng -> ticket 64 hex", /^[a-f0-9]{64}$/.test(ticket || ""), JSON.stringify(r.json));
  r = await call("POST", "/auth/register/verify", { email, otp });
  check("B13 OTP dùng lại -> OTP_INVALID", r.json.error && r.json.error.code === "OTP_INVALID");
  r = await call("POST", "/auth/register", { email, ticket, name: "Nguyen Van A", password: "123", passwordConfirm: "123" });
  check("B13 mật khẩu yếu -> VALIDATION_FAILED fields.password, vé chưa bị đốt", r.json.error.fields && r.json.error.fields.password);
  r = await call("POST", "/auth/register", { email, ticket, name: "Nguyen Van A", password: PW, passwordConfirm: PW, role: "admin", chefId: 1 });
  check("B13 bước 3 OK, không trả accessToken", r.json.ok === true && !JSON.stringify(r.json).includes("accessToken"), JSON.stringify(r.json));
  let u = await User.findOne({ where: { email } });
  check("B13 role luôn viewer (bỏ qua role=admin client gửi), chefId null, đã xác minh email", u.role === "viewer" && u.chefId === null && !!u.emailVerifiedAt);
  r = await call("POST", "/auth/register", { email, ticket, name: "Nguyen Van A", password: PW, passwordConfirm: PW });
  check("B13 vé dùng 1 lần -> dùng lại bị TICKET_INVALID", r.json.error.code === "TICKET_INVALID");
  r = await call("POST", "/auth/login", { email, password: PW });
  check("B13 đăng nhập được bằng tài khoản mới (viewer)", r.json.ok && r.json.data.user.role === "viewer");

  // --- email đã có tài khoản: cùng phản hồi
  await RegisterOtp.destroy({ where: { email } });
  r = await call("POST", "/auth/register/otp", { email });
  check("B13 email đã có tài khoản vẫn trả y hệt {ok, cooldown} (không lộ)", r.json.ok === true && r.json.data.cooldown === 60);

  // --- mã mời
  await call("POST", "/auth/register/otp", { email: email2 });
  const otp2 = lastOtp();
  const t2 = (await call("POST", "/auth/register/verify", { email: email2, otp: otp2 })).json.data.ticket;
  r = await call("POST", "/auth/register", { email: email2, ticket: t2, name: "Tran Thi B", password: PW, passwordConfirm: PW, inviteCode: "sai" });
  check("B13 mã mời sai -> fields.inviteCode (không âm thầm hạ quyền)", r.json.error && r.json.error.fields.inviteCode);
  r = await call("POST", "/auth/register", { email: email2, ticket: t2, name: "Tran Thi B", password: PW, passwordConfirm: PW, inviteCode: "ma-moi-thu-nghiem" });
  u = await User.findOne({ where: { email: email2 } });
  check("B13 mã mời đúng -> editor, chefId null (admin gán sau)", r.json.ok && u.role === "editor" && u.chefId === null);

  // --- khóa OTP
  const email3 = `lock-${sfx}@t.test`;
  await call("POST", "/auth/register/otp", { email: email3 });
  let last;
  for (let i = 0; i < 5; i++) last = await call("POST", "/auth/register/verify", { email: email3, otp: "000001" });
  check("T12* sai OTP 5 lần -> 429 RATE_LIMITED + Retry-After", last.status === 429 && last.json.error.code === "RATE_LIMITED" && last.headers.get("retry-after"), `${last.status}`);
  r = await call("POST", "/auth/register/otp", { email: email3 });
  check("B13 xin mã mới khi đang khóa vẫn 429 (không mở khóa)", r.status === 429);

  // --- quên / đặt lại mật khẩu
  const tokOld = (await call("POST", "/auth/login", { email, password: PW })).json.data.accessToken;
  mailLog = "";
  r = await call("POST", "/auth/forgot-password", { email });
  const r2 = await call("POST", "/auth/forgot-password", { email: `khong-co-${sfx}@t.test` });
  check("B14 email có / không có tài khoản: cùng phản hồi", JSON.stringify(r.json) === JSON.stringify(r2.json) && r.json.ok);
  await sleep(1500);
  const link = (mailLog.match(/reset-password\?token=([a-f0-9]{64})/) || [])[1];
  check("B14 link email trỏ về trang SPA /reset-password?token=", !!link);
  const dbRow = await PasswordReset.findOne({ where: { userId: u ? (await User.findOne({ where: { email } })).id : 0, usedAt: null } });
  check("B14 DB chỉ lưu hash của token", dbRow && dbRow.tokenHash !== link && dbRow.tokenHash.length === 64);
  r = await call("GET", `/auth/reset-password/check?token=${link}`);
  check("B14 check token hợp lệ + header no-store/no-referrer", r.json.ok && r.headers.get("referrer-policy") === "no-referrer" && r.headers.get("cache-control") === "no-store");
  r = await call("GET", `/auth/reset-password/check?token=${"b".repeat(64)}`);
  check("B14 token lạ -> INVALID_RESET_TOKEN", r.json.error.code === "INVALID_RESET_TOKEN");
  r = await call("POST", "/auth/reset-password", { token: link, password: "yeu", passwordConfirm: "yeu" });
  check("B14 mật khẩu mới yếu -> VALIDATION_FAILED, token chưa bị đốt", r.json.error.fields && r.json.error.fields.password);
  const NEW = "Moi9xTest456";
  r = await call("POST", "/auth/reset-password", { token: link, password: NEW, passwordConfirm: NEW });
  check("B14 đổi mật khẩu thành công, không trả token", r.json.ok === true && !JSON.stringify(r.json).includes("accessToken"));
  r = await call("POST", "/auth/reset-password", { token: link, password: NEW, passwordConfirm: NEW });
  check("B14 link dùng lần 2 -> INVALID_RESET_TOKEN (dòng giữ lại với usedAt)", r.json.error.code === "INVALID_RESET_TOKEN" && (await PasswordReset.count({ where: { tokenHash: dbRow.tokenHash } })) === 1);
  r = await call("GET", "/auth/me", null, tokOld);
  check("T7 token cũ bị từ chối sau khi đặt lại mật khẩu (401)", r.status === 401);
  r = await call("POST", "/auth/login", { email, password: PW });
  check("T7 mật khẩu cũ không còn đăng nhập được", r.json.ok === false && r.json.error.code === "INVALID_CREDENTIALS");
  r = await call("POST", "/auth/login", { email, password: NEW });
  check("T7 mật khẩu mới đăng nhập được", r.json.ok === true);
  await sleep(300);
  check("B14 có gửi mail 'mật khẩu đã thay đổi'", /thay đổi|đã đổi/i.test(mailLog));

  // --- MFA không bị tắt khi reset (kiểm tra cờ giữ nguyên)
  await User.update({ mfaEnabled: true, mfaSecret: "x" }, { where: { email } });
  mailLog = ""; await PasswordReset.destroy({ where: { userId: (await User.findOne({ where: { email } })).id } });
  await call("POST", "/auth/forgot-password", { email: email }); // cooldown theo email trong RAM vẫn cho phép (<5)
  await sleep(1500);
  const link2 = (mailLog.match(/token=([a-f0-9]{64})/) || [])[1];
  await call("POST", "/auth/reset-password", { token: link2, password: PW, passwordConfirm: PW });
  u = await User.findOne({ where: { email } });
  r = await call("POST", "/auth/login", { email, password: PW });
  check("B14 reset KHÔNG tắt MFA: đăng nhập tiếp theo vẫn đòi MFA, chưa có accessToken", u.mfaEnabled === true && r.json.data && r.json.data.next === "mfa" && !r.json.data.accessToken, JSON.stringify(r.json));

  await PasswordReset.destroy({ where: { userId: u.id } });
  await User.destroy({ where: { email: [email, email2] } });
  await RegisterOtp.destroy({ where: { email: [email, email2, email3] } });
  srv.close(); await sequelize.close();
  origLog(`\n${pass} pass, ${fail} fail`);
  process.exit(fail ? 1 : 0);
})().catch((e) => { origLog(e); process.exit(1); });
