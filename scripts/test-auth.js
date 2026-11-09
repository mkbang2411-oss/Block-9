// Kiểm thử tự động JWT + RBAC + ABAC (T1, T2, T3, T4, T6, T8, T9, T10 trong kế hoạch). Chạy: npm run test:auth
// Cần DATABASE_URL (DB thật, tạo dữ liệu thử có hậu tố ngẫu nhiên rồi dọn) và JWT_SECRET. Tự mở server ở cổng ngẫu nhiên.
require("dotenv").config();
process.env.JWT_SECRET = process.env.JWT_SECRET || "test-secret-test-secret-test-secret-123456";
process.env.CORS_ORIGIN = "http://localhost:5173";
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const app = require("../src/app");
const { sequelize, User, Chef, Dish } = require("../src/models");
const { runMigrations, searchReady } = require("../src/utils/db-setup");
const { addMissingColumns } = require("../src/utils/migrate");

let pass = 0, fail = 0;
const check = (name, cond, extra = "") => {
  cond ? pass++ : fail++;
  console.log(`${cond ? "PASS" : "FAIL"}  ${name}${cond ? "" : "  " + extra}`);
};

(async () => {
  await sequelize.sync();
  await addMissingColumns(sequelize, [User, Dish]);
  if (!(await searchReady(sequelize))) await runMigrations(sequelize);
  const server = app.listen(0);
  const base = `http://127.0.0.1:${server.address().port}/api`;
  const call = async (method, path, { token, body, headers = {} } = {}) => {
    const r = await fetch(base + path, {
      method,
      headers: { ...(body ? { "Content-Type": "application/json" } : {}), ...(token ? { Authorization: `Bearer ${token}` } : {}), ...headers },
      body: body ? JSON.stringify(body) : undefined,
    });
    let j = null; try { j = await r.json(); } catch (e) {}
    return { status: r.status, json: j, headers: r.headers };
  };

  const sfx = Date.now().toString(36);
  const PW = "Mk9xTest123";
  const hash = await bcrypt.hash(PW, 4);
  const mk = (role, chefId = null, tag = role) =>
    User.create({ name: "Nguoi Thu", email: `${tag}-${sfx}@t.test`, passwordHash: hash, role, chefId, emailVerifiedAt: new Date() });
  const chefA = await Chef.create({ name: `Bep A ${sfx}` });
  const chefB = await Chef.create({ name: `Bep B ${sfx}` });
  const [viewer, editor, admin] = [await mk("viewer"), await mk("editor", chefA.id), await mk("admin")];
  const pending = await User.create({ name: "Cho Duyet", email: `pending-${sfx}@t.test`, passwordHash: hash, role: "viewer" });
  const dishOf = (chefId, status, n) => Dish.create({ name: `Mon ${n} ${sfx}`, price: 50000, category: "Món chính", chefId, status });
  const dMineDraft = await dishOf(chefA.id, "draft", "mine-draft");
  const dMinePub = await dishOf(chefA.id, "published", "mine-pub");
  const dOtherDraft = await dishOf(chefB.id, "draft", "other-draft");
  const dAdminEdit = await dishOf(chefB.id, "published", "admin-edit");

  const login = async (u, pw = PW) => (await call("POST", "/auth/login", { body: { email: u.email, password: pw } }));
  const tok = async (u) => (await login(u)).json.data.accessToken;
  const [tV, tE, tA] = [await tok(viewer), await tok(editor), await tok(admin)];

  // ---- T1: không token
  let r = await call("GET", "/chefs");
  check("T1 GET /chefs không token -> 401 UNAUTHENTICATED", r.status === 401 && r.json.error.code === "UNAUTHENTICATED", JSON.stringify(r.json));
  r = await call("GET", "/dishes");
  check("T1b GET /dishes công khai vẫn 200 ok:true", r.status === 200 && r.json.ok === true);
  r = await call("GET", "/chefs", { token: tV });
  check("T1c GET /chefs có token -> 200", r.status === 200 && r.json.ok === true, JSON.stringify(r.json).slice(0, 200));

  // ---- T2: token giả
  const [h, p, s] = tA.split(".");
  const flip = (x) => x.slice(0, -1) + (x.slice(-1) === "A" ? "B" : "A");
  r = await call("GET", "/auth/me", { token: `${h}.${p}.${flip(s)}` });
  check("T2 sửa 1 ký tự chữ ký -> 401 UNAUTHENTICATED", r.status === 401 && r.json.error.code === "UNAUTHENTICATED");
  const pl = JSON.parse(Buffer.from(p, "base64url")); pl.sub = String(admin.id); pl.role = "admin";
  r = await call("GET", "/auth/me", { token: `${tV.split(".")[0]}.${Buffer.from(JSON.stringify({ ...pl, sub: String(viewer.id) })).toString("base64url")}.${tV.split(".")[2]}` });
  check("T2 sửa payload (thêm role=admin) giữ chữ ký cũ -> 401", r.status === 401);
  const none = `${Buffer.from('{"alg":"none","typ":"JWT"}').toString("base64url")}.${p}.`;
  r = await call("GET", "/auth/me", { token: none });
  check("T2 alg:none -> 401 UNAUTHENTICATED", r.status === 401 && r.json.error.code === "UNAUTHENTICATED");
  const hs512 = jwt.sign({ tv: 0, typ: "access" }, process.env.JWT_SECRET, { algorithm: "HS512", subject: String(admin.id), issuer: "cai-quan-an", audience: "cai-quan-an-spa" });
  r = await call("GET", "/auth/me", { token: hs512 });
  check("T2 token HS512 (alg khác) -> 401", r.status === 401);
  const mfaTok = require("../src/utils/jwt").signMfaChallenge(admin);
  r = await call("GET", "/chefs", { token: mfaTok });
  check("T11 challenge MFA không gọi được API nghiệp vụ -> 401", r.status === 401);

  // ---- T3: hết hạn
  const exp = jwt.sign({ tv: admin.tokenVersion, typ: "access" }, process.env.JWT_SECRET, { algorithm: "HS256", subject: String(admin.id), issuer: "cai-quan-an", audience: "cai-quan-an-spa", expiresIn: -10 });
  r = await call("GET", "/auth/me", { token: exp });
  check("T3 token hết hạn -> 401 TOKEN_EXPIRED", r.status === 401 && r.json.error.code === "TOKEN_EXPIRED", JSON.stringify(r.json));

  // ---- T4: CORS
  r = await call("OPTIONS", "/chefs", { headers: { Origin: "http://localhost:5173", "Access-Control-Request-Method": "GET", "Access-Control-Request-Headers": "authorization" } });
  check("T4 preflight origin đúng -> 204 + Allow-Headers có Authorization, không Allow-Credentials",
    r.status === 204 && /Authorization/.test(r.headers.get("access-control-allow-headers")) && !r.headers.get("access-control-allow-credentials") && r.headers.get("access-control-allow-origin") === "http://localhost:5173");
  r = await call("OPTIONS", "/chefs", { headers: { Origin: "http://evil.example", "Access-Control-Request-Method": "GET" } });
  check("T4 origin lạ -> 403 CORS_NOT_ALLOWED, không có Allow-Origin", r.status === 403 && !r.headers.get("access-control-allow-origin"));

  // ---- /me + serializer không lộ bí mật
  r = await call("GET", "/auth/me", { token: tE });
  const keys = Object.keys(r.json.data).sort().join(",");
  check("/me trả đúng {avatarUrl,chefId,email,id,mfaEnabled,name,role}, không passwordHash/mfaSecret", keys === "avatarUrl,chefId,email,id,mfaEnabled,name,role" && r.json.data.role === "editor" && r.json.data.chefId === chefA.id, keys);
  const pay = JSON.parse(Buffer.from(tE.split(".")[1], "base64url"));
  check("JWT payload chỉ có định danh (không email/role/passwordHash)", !("email" in pay) && !("role" in pay) && !JSON.stringify(pay).includes("hash") && pay.sub && pay.tv !== undefined && pay.jti && pay.exp);

  // ---- T6: đăng nhập sai / pending / khóa
  r = await login(pending);
  check("T6 tài khoản pending: HTTP 200 ok:false ACCOUNT_NOT_ACTIVATED, không accessToken", r.status === 200 && r.json.ok === false && r.json.error.code === "ACCOUNT_NOT_ACTIVATED" && !JSON.stringify(r.json).includes("accessToken"));
  const victim = await mk("viewer", null, "victim");
  r = await login(victim, "Sai12345x");
  check("T6 sai mật khẩu: HTTP 200 ok:false INVALID_CREDENTIALS (không 401)", r.status === 200 && r.json.error.code === "INVALID_CREDENTIALS");
  await login(victim, "Sai12345x");
  r = await login(victim, "Sai12345x");
  check("T6 sai lần 3 -> details.needCaptcha=true", r.json.error.code === "INVALID_CREDENTIALS" && r.json.error.details && r.json.error.details.needCaptcha === true, JSON.stringify(r.json));
  r = await login(victim, "Sai12345x");
  check("T6 từ lần 4 thiếu CAPTCHA (prod/secret) hoặc dev bỏ qua kiểm tra", [200].includes(r.status));
  for (let i = 0; i < 6; i++) r = await login(victim, "Sai12345x");
  check("T6 sai đủ 10 lần -> 429 RATE_LIMITED + Retry-After + lockedSeconds", r.status === 429 && r.json.error.code === "RATE_LIMITED" && r.headers.get("retry-after") && r.json.error.details.lockedSeconds > 0, `${r.status} ${JSON.stringify(r.json)}`);
  r = await login(victim);
  check("T6 đang khóa: mật khẩu ĐÚNG cũng bị 429", r.status === 429);

  // ---- T8: RBAC
  const body = (n, extra = {}) => ({ name: `Mon moi ${n} ${sfx}`, price: "60000", category: "Món chính", chefId: String(chefA.id), ...extra });
  r = await call("POST", "/dishes", { token: tV, body: body("v") });
  check("T8 viewer POST món -> 403 FORBIDDEN", r.status === 403 && r.json.error.code === "FORBIDDEN");
  r = await call("DELETE", `/dishes/${dMineDraft.id}`, { token: tE });
  check("T8 editor DELETE món -> 403", r.status === 403);
  r = await call("DELETE", `/dishes/${dAdminEdit.id}`, { token: tA });
  check("T8 admin DELETE món -> 200 ok:true", r.status === 200 && r.json.ok === true);
  check("T8 dữ liệu không đổi khi bị 403 (món của editor còn nguyên)", !!(await Dish.findByPk(dMineDraft.id)));
  r = await call("POST", "/dishes", { body: body("anon") });
  check("T8 không token POST -> 401", r.status === 401);

  // ---- T9: ABAC
  const patch = (id, token, b = { description: "sua" }) => call("PATCH", `/dishes/${id}`, { token, body: b });
  r = await patch(dOtherDraft.id, tE);
  check("T9 editor PATCH món đầu bếp khác -> 403", r.status === 403 && r.json.error.code === "FORBIDDEN");
  r = await patch(dMinePub.id, tE);
  check("T9 editor PATCH món của mình nhưng published -> 403", r.status === 403);
  r = await patch(dMineDraft.id, tE);
  check("T9 editor PATCH món của mình + draft -> 200", r.status === 200 && r.json.ok === true, JSON.stringify(r.json));
  r = await patch(dOtherDraft.id, tA);
  check("T9 admin PATCH món người khác -> 200", r.status === 200 && r.json.ok === true, JSON.stringify(r.json));
  r = await patch(99999999, tE);
  check("T9 thứ tự: món không tồn tại -> 404 nghiệp vụ (ok:false NOT_FOUND), không lộ 403", r.status === 200 && r.json.error.code === "NOT_FOUND");
  r = await patch(dMineDraft.id, tV);
  check("T9 viewer PATCH -> 403 (theo role, trước khi đọc bản ghi)", r.status === 403);

  // ---- T10: không tin client
  r = await patch(dMineDraft.id, tE, { chefId: String(chefB.id), status: "published", role: "admin", description: "hack" });
  const after = await Dish.findByPk(dMineDraft.id);
  check("T10 editor gửi chefId khác + status published + role=admin trong body -> bị ép lại (vẫn của mình, vẫn draft)", after.chefId === chefA.id && after.status === "draft", `${after.chefId} ${after.status}`);
  r = await call("POST", "/dishes", { token: tE, body: body("e1", { chefId: String(chefB.id), status: "published" }) });
  check("T10 editor POST với chefId người khác -> tạo với chefId của mình, status draft", r.status === 200 && r.json.ok && r.json.data.chefId === chefA.id && r.json.data.status === "draft", JSON.stringify(r.json).slice(0, 200));
  r = await call("POST", "/chefs", { token: tE, body: { name: "X Chef" } });
  check("T10 editor POST /chefs -> 403", r.status === 403);
  await editor.update({ role: "viewer", tokenVersion: editor.tokenVersion + 1 });
  r = await call("GET", "/auth/me", { token: tE });
  check("T7* đổi role/tokenVersion+1 -> token cũ bị từ chối 401", r.status === 401);

  // dọn
  await Dish.destroy({ where: { chefId: [chefA.id, chefB.id] } });
  await User.destroy({ where: { email: [viewer, editor, admin, pending, victim].map((u) => u.email) } });
  await Chef.destroy({ where: { id: [chefA.id, chefB.id] } });
  server.close(); await sequelize.close();
  console.log(`\n${pass} pass, ${fail} fail`);
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
