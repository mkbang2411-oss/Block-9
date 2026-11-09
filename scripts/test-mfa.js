// Kiểm thử MFA TOTP + recovery code + xác thực lại (B19-B21; T11, T12, T13, T7 phần MFA). Chạy: npm run test:mfa
// Cần DATABASE_URL (DB thật; tạo dữ liệu thử có hậu tố ngẫu nhiên rồi dọn) và JWT_SECRET. Tự mở server ở cổng ngẫu nhiên.
// Mỗi nhóm test dùng 1 IP giả (X-Forwarded-For + TRUST_PROXY=1) để không đụng giới hạn theo IP của nhóm khác.
require("dotenv").config();
process.env.JWT_SECRET = process.env.JWT_SECRET || "test-secret-test-secret-test-secret-123456";
process.env.CORS_ORIGIN = "http://localhost:5173";
process.env.TRUST_PROXY = "1";
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const app = require("../src/app");
const { sequelize, User, Dish, RecoveryCode } = require("../src/models");
const { runMigrations, searchReady } = require("../src/utils/db-setup");
const { addMissingColumns } = require("../src/utils/migrate");
const totp = require("../src/utils/totp");
const { encryptSecret, decryptSecret } = require("../src/utils/mfa-crypto");
const { signMfaChallenge } = require("../src/utils/jwt");

let pass = 0, fail = 0;
const check = (name, cond, extra = "") => {
  cond ? pass++ : fail++;
  console.log(`${cond ? "PASS" : "FAIL"}  ${name}${cond ? "" : "  " + extra}`);
};
const J = (x) => JSON.stringify(x).slice(0, 220);

(async () => {
  await sequelize.sync();
  await addMissingColumns(sequelize, [User, Dish]);
  if (!(await searchReady(sequelize))) await runMigrations(sequelize);
  const server = app.listen(0);
  const base = `http://127.0.0.1:${server.address().port}/api`;
  let IP = "10.9.0.1";
  const useIp = (n) => (IP = `10.9.0.${n}`);
  const call = async (method, path, { token, body, headers = {} } = {}) => {
    const r = await fetch(base + path, {
      method,
      headers: {
        "X-Forwarded-For": IP,
        ...(body ? { "Content-Type": "application/json" } : {}),
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...headers,
      },
      body: body ? JSON.stringify(body) : undefined,
    });
    let j = null;
    try { j = await r.json(); } catch (e) {}
    return { status: r.status, json: j, headers: r.headers };
  };

  const sfx = Date.now().toString(36);
  const PW = "Mk9xTest123";
  const hash = await bcrypt.hash(PW, 4);
  const mk = (tag, role = "viewer") => User.create({ name: "Nguoi Thu", email: `${tag}-${sfx}@t.test`, passwordHash: hash, role, emailVerifiedAt: new Date() });
  const made = [];
  const mkU = async (tag, role) => { const u = await mk(tag, role); made.push(u); return u; };
  const login = (u, pw = PW) => call("POST", "/auth/login", { body: { email: u.email, password: pw } });
  const tok = async (u) => (await login(u)).json.data.accessToken;
  // "thời gian trôi đi": đặt lại bước đã dùng về quá khứ rồi lấy mã hiện tại (test chạy nhanh hơn 30 giây/mã)
  const fresh = async (u, secret) => { await User.update({ mfaLastStep: totp.stepOf() - 10 }, { where: { id: u.id } }); return totp.totpAt(secret); };
  const row = (u) => User.findByPk(u.id);

  // ================= 0) đơn vị: TOTP đúng chuẩn RFC 6238, mã hóa secret
  const rfc = totp.base32Encode(Buffer.from("12345678901234567890"));
  const vec = [[59, "287082"], [1111111109, "081804"], [1111111111, "050471"], [1234567890, "005924"], [2000000000, "279037"], [20000000000, "353130"]];
  check("RFC 6238: 6 vector chuẩn (SHA1, 6 số) đều khớp", vec.every(([t, c]) => totp.totpAt(rfc, t * 1000) === c));
  check("verifyTotp: cho phép ±1 bước, từ chối ±2 bước", totp.verifyTotp(rfc, "287082", { timeMs: 59000 + 30000 }) !== null && totp.verifyTotp(rfc, "287082", { timeMs: 59000 + 90000 }) === null);
  check("verifyTotp: mã không phải 6 số -> null", totp.verifyTotp(rfc, "12345", { timeMs: 59000 }) === null && totp.verifyTotp(rfc, "abcdef") === null);
  const box = encryptSecret(rfc);
  check("mã hóa secret: giải được, không chứa bản rõ, bị sửa 1 byte thì giải thất bại", decryptSecret(box) === rfc && !box.includes(rfc) && decryptSecret(box.slice(0, -3) + "AAA") === null);
  check("otpauth URL đúng định dạng", /^otpauth:\/\/totp\/.+\?.*secret=[A-Z2-7]{32}/.test(totp.otpauthUrl({ issuer: "Quan", account: "a@b.c", secret: totp.generateSecret() })));

  // ================= 1) setup + enable
  useIp(1);
  const u1 = await mkU("mfa1", "editor");
  let t1 = await tok(u1);
  let r = await call("POST", "/mfa/setup");
  check("T-setup không token -> 401 UNAUTHENTICATED", r.status === 401 && r.json.error.code === "UNAUTHENTICATED");
  r = await call("GET", "/mfa/status", { token: t1 });
  check("status ban đầu: { enabled:false, setupPending:false }", J(r.json.data) === J({ enabled: false, setupPending: false }), J(r.json));
  r = await call("POST", "/mfa/setup", { token: t1 });
  const S1 = r.json && r.json.data && r.json.data.secret;
  check("setup: trả secret base32 + otpauthUrl + QR PNG (data URL)", r.status === 200 && /^[A-Z2-7]{32}$/.test(S1) && r.json.data.otpauthUrl.includes(S1) && r.json.data.qrDataUrl.startsWith("data:image/png;base64,"), J(r.json));
  let d = await row(u1);
  check("setup: mfaEnabled vẫn false; mfaSecret rỗng; khóa chờ được MÃ HÓA (không phải bản rõ)", d.mfaEnabled === false && !d.mfaSecret && d.mfaPendingSecret && d.mfaPendingSecret !== S1 && !d.mfaPendingSecret.includes(S1));
  r = await call("GET", "/mfa/status", { token: t1 });
  check("status sau setup: setupPending:true", r.json.data.setupPending === true && r.json.data.enabled === false);
  r = await login(u1);
  check("setup xong nhưng CHƯA enable: đăng nhập vẫn ra accessToken thẳng (MFA chưa bật)", r.json.ok && !!r.json.data.accessToken);

  r = await call("POST", "/mfa/enable", { token: t1, body: { code: "12ab" } });
  check("enable: mã sai định dạng -> VALIDATION_FAILED fields.code", r.json.ok === false && r.json.error.code === "VALIDATION_FAILED" && !!r.json.error.fields.code);
  r = await call("POST", "/mfa/enable", { token: t1, body: { code: "000000" === totp.totpAt(S1) ? "000001" : "000000" } });
  check("enable: sai mã -> ok:false INVALID_MFA_CODE (HTTP 200, không 401)", r.status === 200 && r.json.error.code === "INVALID_MFA_CODE", J(r.json));
  check("enable: sai định dạng KHÔNG tính vào số lần sai, sai mã thật mới +1", (await row(u1)).failedMfa === 1);
  r = await call("POST", "/mfa/enable", { token: t1, body: { code: totp.totpAt(S1) } });
  const rec1 = r.json && r.json.data && r.json.data.recoveryCodes;
  check("enable đúng mã: ok, accessToken MỚI + 10 mã khôi phục dạng XXXXX-XXXXX", r.status === 200 && r.json.ok && !!r.json.data.accessToken && Array.isArray(rec1) && rec1.length === 10 && rec1.every((c) => /^[A-HJ-NP-Z2-9]{5}-[A-HJ-NP-Z2-9]{5}$/.test(c)) && new Set(rec1).size === 10, J(r.json));
  const t1new = r.json.data.accessToken;
  r = await call("GET", "/auth/me", { token: t1 });
  check("enable: token cũ bị thu hồi (tokenVersion+1) -> 401", r.status === 401);
  r = await call("GET", "/auth/me", { token: t1new });
  check("enable: token mới dùng được, /me.mfaEnabled=true, không lộ secret", r.json.ok && r.json.data.mfaEnabled === true && Object.keys(r.json.data).sort().join() === "avatarUrl,chefId,email,id,mfaEnabled,name,role");
  d = await row(u1);
  check("DB: mfaEnabled, mfaSecret mã hóa giải ra đúng secret, khóa chờ xóa, failedMfa=0", d.mfaEnabled && decryptSecret(d.mfaSecret) === S1 && !d.mfaPendingSecret && d.failedMfa === 0);
  const rows1 = await RecoveryCode.findAll({ where: { userId: u1.id } });
  check("DB: 10 dòng recovery_codes, chỉ có HASH (không có mã gốc), chưa dùng", rows1.length === 10 && rows1.every((x) => !x.usedAt && /^[a-f0-9]{64}$/.test(x.codeHash) && !rec1.some((c) => x.codeHash.toLowerCase().includes(c.replace("-", "").toLowerCase()))));
  r = await call("POST", "/mfa/enable", { token: t1new, body: { code: totp.totpAt(S1) } });
  check("enable lần 2 khi không có phiên setup -> MFA_SETUP_REQUIRED", r.json.ok === false && r.json.error.code === "MFA_SETUP_REQUIRED");

  // ================= 2) T11: đăng nhập chưa xong MFA
  r = await login(u1);
  const ch1 = r.json.data && r.json.data.challenge;
  check("T11 mật khẩu đúng + MFA bật -> next:'mfa' + challenge, KHÔNG có accessToken", r.json.ok && r.json.data.next === "mfa" && !!ch1 && !JSON.stringify(r.json).includes("accessToken"), J(r.json));
  for (const p of ["/chefs", "/auth/me", "/mfa/status"]) {
    r = await call("GET", p, { token: ch1 });
    check(`T11 challenge gọi ${p} -> 401 UNAUTHENTICATED`, r.status === 401 && r.json.error.code === "UNAUTHENTICATED");
  }
  r = await call("POST", "/auth/mfa/verify", { body: { challenge: t1new, code: totp.totpAt(S1) } });
  check("T11 access token KHÔNG dùng được làm challenge ở /mfa/verify -> 401", r.status === 401);
  r = await call("POST", "/auth/mfa/verify", { body: { challenge: "abc.def.ghi", code: totp.totpAt(S1) } });
  check("T11 challenge giả -> 401 UNAUTHENTICATED", r.status === 401 && r.json.error.code === "UNAUTHENTICATED");
  const expiredCh = jwt.sign({ tv: d.tokenVersion, typ: "mfa" }, process.env.JWT_SECRET, { algorithm: "HS256", subject: String(u1.id), issuer: "cai-quan-an", audience: "cai-quan-an-spa", expiresIn: -10 });
  r = await call("POST", "/auth/mfa/verify", { body: { challenge: expiredCh, code: totp.totpAt(S1) } });
  check("T11 challenge hết hạn -> 401 TOKEN_EXPIRED", r.status === 401 && r.json.error.code === "TOKEN_EXPIRED");
  r = await call("POST", "/auth/mfa/verify", { body: { challenge: ch1, code: "12" } });
  check("verify: thiếu/sai định dạng mã -> VALIDATION_FAILED, chưa có accessToken", r.json.ok === false && r.json.error.code === "VALIDATION_FAILED");
  r = await call("POST", "/auth/mfa/verify", { body: { challenge: ch1, code: await fresh(u1, S1) === "000000" ? "000001" : "000000" } });
  check("verify: sai mã -> HTTP 200 ok:false INVALID_MFA_CODE, không accessToken", r.status === 200 && r.json.error.code === "INVALID_MFA_CODE" && !JSON.stringify(r.json).includes("accessToken"));

  // ================= 3) verify đúng + T12 dùng lại mã
  let code = await fresh(u1, S1);
  r = await call("POST", "/auth/mfa/verify", { body: { challenge: ch1, code } });
  check("verify đúng mã -> accessToken + user", r.status === 200 && r.json.ok && !!r.json.data.accessToken && r.json.data.user.email === u1.email, J(r.json));
  const tOk = r.json.data.accessToken;
  r = await call("GET", "/chefs", { token: tOk });
  check("sau MFA: gọi API nghiệp vụ được (/chefs 200)", r.status === 200 && r.json.ok);
  r = await call("POST", "/auth/mfa/verify", { body: { challenge: ch1, code } });
  check("T12 nhập lại ĐÚNG mã TOTP vừa dùng -> bị từ chối INVALID_MFA_CODE", r.json.ok === false && r.json.error.code === "INVALID_MFA_CODE", J(r.json));
  d = await row(u1);
  check("T12 DB: mfaLastStep = bước của mã vừa dùng", Number(d.mfaLastStep) === totp.stepOf() || Number(d.mfaLastStep) === totp.stepOf() - 1 || Number(d.mfaLastStep) === totp.stepOf() + 1);
  r = await call("POST", "/auth/mfa/verify", { body: { challenge: ch1, code: totp.totpAt(S1, Date.now() - 30000) } });
  check("T12 mã của bước TRƯỚC bước đã dùng -> từ chối (không lùi được)", r.json.ok === false && r.json.error.code === "INVALID_MFA_CODE");
  await User.update({ mfaLastStep: totp.stepOf() - 10, failedMfa: 0 }, { where: { id: u1.id } });
  r = await call("POST", "/auth/mfa/verify", { body: { challenge: ch1, code: totp.totpAt(S1, Date.now() + 90000) } });
  check("T12 mã lệch 3 bước (ngoài cửa sổ ±1) -> từ chối", r.json.ok === false && r.json.error.code === "INVALID_MFA_CODE");
  await User.update({ failedMfa: 0 }, { where: { id: u1.id } });

  // song song: 6 request cùng 1 mã hợp lệ -> đúng 1 request thành công (UPDATE nguyên tử trên mfaLastStep)
  useIp(2);
  code = await fresh(u1, S1);
  let rs = await Promise.all(Array.from({ length: 6 }, () => call("POST", "/auth/mfa/verify", { body: { challenge: ch1, code } })));
  check("T12 6 request song song cùng 1 mã -> đúng 1 thành công", rs.filter((x) => x.json && x.json.ok).length === 1, rs.map((x) => x.json && x.json.ok).join());
  await User.update({ failedMfa: 0, mfaLockedUntil: null }, { where: { id: u1.id } });

  // ================= 4) T12: mã khôi phục dùng 1 lần; sai quá giới hạn -> khóa
  useIp(3);
  const ch2 = (await login(u1)).json.data.challenge;
  const rc = rec1[0];
  r = await call("POST", "/auth/mfa/verify", { body: { challenge: ch2, recoveryCode: rc.toLowerCase().replace("-", " ") } });
  check("recovery code (gõ thường, bỏ gạch) -> chấp nhận, trả recoveryUsed + recoveryRemaining=9", r.json.ok && !!r.json.data.accessToken && r.json.data.recoveryUsed === true && r.json.data.recoveryRemaining === 9, J(r.json));
  r = await call("POST", "/auth/mfa/verify", { body: { challenge: ch2, recoveryCode: rc } });
  check("T12 dùng mã khôi phục lần 2 -> INVALID_MFA_CODE", r.json.ok === false && r.json.error.code === "INVALID_MFA_CODE");
  check("T12 DB: mã đã dùng có usedAt (không bị xóa)", (await RecoveryCode.count({ where: { userId: u1.id, usedAt: { [require("sequelize").Op.ne]: null } } })) === 1);
  r = await call("POST", "/auth/mfa/verify", { body: { challenge: ch2, recoveryCode: "ZZZZZ-ZZZZZ" } });
  check("recovery code không tồn tại (đúng định dạng) -> INVALID_MFA_CODE", r.json.error.code === "INVALID_MFA_CODE");
  r = await call("POST", "/auth/mfa/verify", { body: { challenge: ch2, recoveryCode: "abc" } });
  check("recovery code sai định dạng -> VALIDATION_FAILED fields.recoveryCode", r.json.error.code === "VALIDATION_FAILED" && !!r.json.error.fields.recoveryCode);
  // song song cùng 1 mã khôi phục
  useIp(4);
  const ch3 = (await login(u1)).json.data.challenge;
  rs = await Promise.all(Array.from({ length: 6 }, () => call("POST", "/auth/mfa/verify", { body: { challenge: ch3, recoveryCode: rec1[1] } })));
  check("T12 6 request song song cùng 1 mã khôi phục -> đúng 1 thành công", rs.filter((x) => x.json && x.json.ok).length === 1, rs.map((x) => x.json && x.json.ok).join());
  await User.update({ failedMfa: 0, mfaLockedUntil: null }, { where: { id: u1.id } });

  useIp(5);
  const ch4 = (await login(u1)).json.data.challenge;
  await User.update({ failedMfa: 0, mfaLockedUntil: null }, { where: { id: u1.id } });
  const bad = totp.totpAt(S1, Date.now() + 600000) === totp.totpAt(S1) ? "111111" : totp.totpAt(S1, Date.now() + 600000);
  let last;
  for (let i = 0; i < 5; i++) last = await call("POST", "/auth/mfa/verify", { body: { challenge: ch4, code: bad } });
  check("T12 sai 5 lần -> 429 RATE_LIMITED + Retry-After + details.lockedSeconds", last.status === 429 && last.json.error.code === "RATE_LIMITED" && !!last.headers.get("retry-after") && last.json.error.details.lockedSeconds > 0, `${last.status} ${J(last.json)}`);
  r = await call("POST", "/auth/mfa/verify", { body: { challenge: ch4, code: await fresh(u1, S1) } });
  check("T12 đang khóa: nhập ĐÚNG mã cũng bị 429", r.status === 429);
  r = await call("POST", "/auth/mfa/verify", { body: { challenge: ch4, recoveryCode: rec1[2] } });
  check("T12 đang khóa: mã khôi phục đúng cũng bị 429 (và KHÔNG bị tiêu hao)", r.status === 429 && !(await RecoveryCode.findOne({ where: { userId: u1.id, usedAt: { [require("sequelize").Op.ne]: null } }, order: [["id", "DESC"]] })).usedAt === false);
  d = await row(u1);
  check("T12 DB: mfaLockedUntil ở tương lai (khóa theo tài khoản, lưu DB)", d.mfaLockedUntil && d.mfaLockedUntil > new Date());
  await User.update({ mfaLockedUntil: new Date(Date.now() - 1000), failedMfa: 0 }, { where: { id: u1.id } });
  r = await call("POST", "/auth/mfa/verify", { body: { challenge: ch4, code: await fresh(u1, S1) } });
  check("hết khóa: nhập đúng mã -> vào được", r.json.ok && !!r.json.data.accessToken, J(r.json));
  const tU1 = r.json.data.accessToken;

  // challenge cũ chết khi đổi tokenVersion (đổi mật khẩu / đổi role)
  useIp(6);
  const ch5 = (await login(u1)).json.data.challenge;
  await User.update({ tokenVersion: sequelize.literal('"tokenVersion" + 1') }, { where: { id: u1.id } });
  r = await call("POST", "/auth/mfa/verify", { body: { challenge: ch5, code: await fresh(u1, S1) } });
  check("T7 challenge phát trước khi tokenVersion+1 -> 401 (không dùng được)", r.status === 401 && r.json.error.code === "UNAUTHENTICATED");
  const tU1b = await (async () => { const c = (await login(u1)).json.data.challenge; return (await call("POST", "/auth/mfa/verify", { body: { challenge: c, code: await fresh(u1, S1) } })).json.data.accessToken; })();

  // ================= 5) T13: thao tác nhạy cảm phải xác thực lại
  useIp(7);
  const tokS = tU1b;
  const post = (path, b, token = tokS) => call("POST", path, { token, body: b });
  const remaining = () => RecoveryCode.count({ where: { userId: u1.id, usedAt: null } });
  const before = await remaining();
  for (const [name, path] of [["tắt MFA", "/mfa/disable"], ["xem recovery code", "/mfa/recovery-codes/status"], ["tạo lại recovery code", "/mfa/recovery-codes/regenerate"]]) {
    r = await post(path, {});
    check(`T13 ${name}: chỉ có token, KHÔNG mật khẩu/mã -> VALIDATION_FAILED`, r.json.ok === false && r.json.error.code === "VALIDATION_FAILED" && !!r.json.error.fields.password, J(r.json));
    r = await post(path, { password: PW });
    check(`T13 ${name}: có mật khẩu nhưng thiếu mã -> VALIDATION_FAILED fields.code`, r.json.error.code === "VALIDATION_FAILED" && !!r.json.error.fields.code);
  }
  await User.update({ failedMfa: 0 }, { where: { id: u1.id } });
  r = await post("/mfa/disable", { password: "Sai12345x", code: await fresh(u1, S1) });
  check("T13 sai mật khẩu -> INVALID_CREDENTIALS (HTTP 200), MFA vẫn bật", r.status === 200 && r.json.error.code === "INVALID_CREDENTIALS" && (await row(u1)).mfaEnabled === true);
  r = await post("/mfa/disable", { password: "Sai12345x", recoveryCode: rec1[3] });
  check("T13 sai mật khẩu + mã khôi phục ĐÚNG -> mã khôi phục KHÔNG bị tiêu hao", r.json.error.code === "INVALID_CREDENTIALS" && (await remaining()) === before);
  r = await post("/mfa/disable", { password: PW, code: totp.totpAt(S1, Date.now() + 600000) === totp.totpAt(S1) ? "222222" : totp.totpAt(S1, Date.now() + 600000) });
  check("T13 đúng mật khẩu, sai mã -> INVALID_MFA_CODE, MFA vẫn bật", r.json.error.code === "INVALID_MFA_CODE" && (await row(u1)).mfaEnabled === true);
  await User.update({ failedMfa: 0 }, { where: { id: u1.id } });
  r = await post("/mfa/recovery-codes/status", { password: PW, code: await fresh(u1, S1) });
  check("T13 xem recovery (đã xác thực lại): { total:10, remaining, createdAt }, KHÔNG có mã gốc", r.json.ok && r.json.data.total === 10 && r.json.data.remaining === before && !!r.json.data.createdAt && !JSON.stringify(r.json).match(/[A-HJ-NP-Z2-9]{5}-[A-HJ-NP-Z2-9]{5}/), J(r.json));
  const oldRc = rec1[4];
  r = await post("/mfa/recovery-codes/regenerate", { password: PW, code: await fresh(u1, S1) });
  const rec2 = r.json.data && r.json.data.recoveryCodes;
  check("T13 tạo lại recovery (đã xác thực lại): 10 mã MỚI khác hẳn nhóm cũ", r.json.ok && rec2.length === 10 && !rec2.some((c) => rec1.includes(c)), J(r.json));
  check("DB: nhóm cũ bị xóa, chỉ còn 10 mã mới chưa dùng", (await RecoveryCode.count({ where: { userId: u1.id } })) === 10 && (await remaining()) === 10);
  useIp(8);
  const ch6 = (await login(u1)).json.data.challenge;
  r = await call("POST", "/auth/mfa/verify", { body: { challenge: ch6, recoveryCode: oldRc } });
  check("nhóm cũ vô hiệu: mã khôi phục cũ (chưa dùng) bị từ chối", r.json.error.code === "INVALID_MFA_CODE");
  r = await call("POST", "/auth/mfa/verify", { body: { challenge: ch6, recoveryCode: rec2[0] } });
  check("nhóm mới: mã khôi phục mới dùng được", r.json.ok && r.json.data.recoveryRemaining === 9);
  await User.update({ failedMfa: 0, mfaLockedUntil: null }, { where: { id: u1.id } });

  // ================= 6) đổi thiết bị (xác thực lại, khóa cũ vẫn dùng đến khi xác nhận khóa mới)
  useIp(9);
  const tD = await (async () => { const c = (await login(u1)).json.data.challenge; return (await call("POST", "/auth/mfa/verify", { body: { challenge: c, code: await fresh(u1, S1) } })).json.data.accessToken; })();
  r = await call("POST", "/mfa/setup", { token: tD });
  check("đổi thiết bị: setup khi đang bật mà KHÔNG xác thực lại -> VALIDATION_FAILED, chưa tạo khóa mới", r.json.ok === false && r.json.error.code === "VALIDATION_FAILED" && !(await row(u1)).mfaPendingSecret);
  r = await call("POST", "/mfa/setup", { token: tD, body: { password: PW, code: await fresh(u1, S1) } });
  const S2 = r.json.data && r.json.data.secret;
  check("đổi thiết bị: xác thực lại xong -> khóa mới + QR", r.json.ok && /^[A-Z2-7]{32}$/.test(S2) && S2 !== S1, J(r.json));
  d = await row(u1);
  check("đổi thiết bị: khóa cũ vẫn là khóa đang dùng, khóa mới nằm ở 'chờ'", decryptSecret(d.mfaSecret) === S1 && decryptSecret(d.mfaPendingSecret) === S2 && d.mfaEnabled);
  const chOld = (await login(u1)).json.data.challenge;
  r = await call("POST", "/auth/mfa/verify", { body: { challenge: chOld, code: await fresh(u1, S1) } });
  check("bỏ dở giữa chừng: thiết bị CŨ vẫn đăng nhập được", r.json.ok && !!r.json.data.accessToken);
  r = await call("POST", "/mfa/enable", { token: tD, body: { code: totp.totpAt(S2) } });
  // tD là token cũ nên enable phải 401? tD phát trước lần đăng nhập thứ hai nhưng tokenVersion chưa đổi -> vẫn hợp lệ
  const tNew = r.json.data && r.json.data.accessToken;
  check("đổi thiết bị: nhập đúng mã khóa MỚI -> chuyển khóa, recoveryCodes=null (giữ nhóm cũ), token mới", r.json.ok && !!tNew && r.json.data.recoveryCodes === null, J(r.json));
  useIp(10);
  let chN = (await login(u1)).json.data.challenge;
  r = await call("POST", "/auth/mfa/verify", { body: { challenge: chN, code: await fresh(u1, S1) === totp.totpAt(S2) ? "333333" : totp.totpAt(S1) } });
  check("sau khi đổi: mã của thiết bị CŨ bị từ chối", r.json.ok === false && r.json.error.code === "INVALID_MFA_CODE");
  await User.update({ failedMfa: 0 }, { where: { id: u1.id } });
  r = await call("POST", "/auth/mfa/verify", { body: { challenge: chN, code: await fresh(u1, S2) } });
  check("sau khi đổi: mã của thiết bị MỚI được chấp nhận", r.json.ok && !!r.json.data.accessToken, J(r.json));
  r = await call("POST", "/auth/mfa/verify", { body: { challenge: (await login(u1)).json.data.challenge, recoveryCode: rec2[1] } });
  check("sau khi đổi: mã khôi phục cũ (chưa dùng) vẫn còn hiệu lực", r.json.ok);
  await User.update({ failedMfa: 0, mfaLockedUntil: null }, { where: { id: u1.id } });

  // ================= 7) tắt MFA
  useIp(11);
  const tDis = await (async () => { const c = (await login(u1)).json.data.challenge; return (await call("POST", "/auth/mfa/verify", { body: { challenge: c, code: await fresh(u1, S2) } })).json.data.accessToken; })();
  r = await call("POST", "/mfa/disable", { token: tDis, body: { password: PW, code: await fresh(u1, S2) } });
  const tAfterDisable = r.json.data && r.json.data.accessToken;
  check("tắt MFA (đã xác thực lại): ok + accessToken mới", r.json.ok && !!tAfterDisable, J(r.json));
  r = await call("GET", "/auth/me", { token: tDis });
  check("tắt MFA: token cũ bị thu hồi -> 401", r.status === 401);
  d = await row(u1);
  check("DB: mfaEnabled=false, mfaSecret/khóa chờ/mfaLastStep rỗng, xóa hết mã khôi phục", !d.mfaEnabled && !d.mfaSecret && !d.mfaPendingSecret && d.mfaLastStep === null && (await RecoveryCode.count({ where: { userId: u1.id } })) === 0);
  r = await login(u1);
  check("tắt MFA: đăng nhập lại ra accessToken thẳng", r.json.ok && !!r.json.data.accessToken && !r.json.data.next);
  r = await call("POST", "/mfa/disable", { token: tAfterDisable, body: { password: PW, code: "123456" } });
  check("tắt khi MFA không bật -> MFA_NOT_ENABLED", r.json.ok === false && r.json.error.code === "MFA_NOT_ENABLED");
  for (const p of ["/mfa/recovery-codes/status", "/mfa/recovery-codes/regenerate"]) {
    r = await call("POST", p, { token: tAfterDisable, body: { password: PW, code: "123456" } });
    check(`${p} khi MFA không bật -> MFA_NOT_ENABLED`, r.json.error.code === "MFA_NOT_ENABLED");
  }
  r = await call("POST", "/auth/mfa/verify", { body: { challenge: signMfaChallenge(await row(u1)), code: "123456" } });
  check("challenge của tài khoản đã tắt MFA -> 401 (không biến thành đường vào)", r.status === 401);

  // ================= 8) quyền & rò rỉ
  useIp(12);
  const u2 = await mkU("mfa2", "admin");
  const t2 = await tok(u2);
  r = await call("POST", "/mfa/setup", { token: t2 });
  const S3 = r.json.data.secret;
  r = await call("POST", "/mfa/enable", { token: t2, body: { code: totp.totpAt(S3) } });
  const all = JSON.stringify(r.json);
  check("admin cũng đi qua MFA như mọi role: enable ok", r.json.ok && r.json.data.recoveryCodes.length === 10);
  const t2new = r.json.data.accessToken;
  r = await call("GET", "/auth/me", { token: t2new });
  check("không API nào trả mfaSecret/mfaPendingSecret/codeHash/passwordHash", !/mfaSecret|mfaPendingSecret|codeHash|passwordHash|mfaLastStep/.test(JSON.stringify(r.json) + all));
  r = await call("POST", "/mfa/enable", { token: "x.y.z", body: { code: "123456" } });
  check("enable với token rác -> 401", r.status === 401);
  r = await fetch(base + "/mfa/setup", { method: "POST", headers: { "X-Forwarded-For": IP, "Content-Type": "text/plain", Authorization: `Bearer ${t2new}` }, body: "x" });
  check("body không phải JSON -> 415 UNSUPPORTED_MEDIA_TYPE", r.status === 415);

  // ================= 9) giới hạn theo IP
  useIp(13);
  let st = 0;
  for (let i = 0; i < 32; i++) st = (await call("GET", "/mfa/status")).status;
  check("rate limit theo IP: quá 30 lượt/15 phút -> 429 RATE_LIMITED", st === 429);

  // dọn (recovery_codes xóa theo tài khoản: ON DELETE CASCADE)
  await User.destroy({ where: { id: made.map((u) => u.id) } });
  server.close();
  await sequelize.close();
  console.log(`\n${pass} pass, ${fail} fail`);
  process.exit(fail ? 1 : 0);
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
