// Kiểm thử API ảnh đại diện (H6 phần backend): POST/DELETE /api/auth/avatar. Chạy: npm run test:avatar
// Cần DATABASE_URL (DB thật, tạo dữ liệu thử có hậu tố ngẫu nhiên rồi dọn) và JWT_SECRET.
// KHÔNG gọi Supabase thật: thay storage.uploadAvatar / removeFile bằng bản giả ghi lại lời gọi
// (processAvatar - cắt vuông 512px, kiểm định dạng - vẫn chạy thật bằng sharp).
require("dotenv").config();
process.env.JWT_SECRET = process.env.JWT_SECRET || "test-secret-test-secret-test-secret-123456";
const bcrypt = require("bcryptjs");
const sharp = require("sharp");
const storage = require("../src/utils/storage");
const app = require("../src/app");
const { sequelize, User } = require("../src/models");
const { addMissingColumns } = require("../src/utils/migrate");

let pass = 0, fail = 0;
const check = (name, cond, extra = "") => {
  cond ? pass++ : fail++;
  console.log(`${cond ? "PASS" : "FAIL"}  ${name}${cond ? "" : "  " + extra}`);
};

// ---- storage giả
const uploaded = [], removed = [];
let failUpload = false;
storage.uploadAvatar = async (buffer, userId) => {
  if (failUpload) throw new Error("Supabase down");
  const path = `avatars/${userId}/${uploaded.length + 1}.webp`;
  uploaded.push({ path, buffer });
  return { path, url: `https://cdn.test/${path}` };
};
storage.removeFile = async (path) => { removed.push(path); };

const png = (w, h, color = { r: 200, g: 60, b: 60 }) =>
  sharp({ create: { width: w, height: h, channels: 3, background: color } }).png().toBuffer();
// GIF 1x1 hợp lệ (định dạng không được phép)
const GIF = Buffer.from("R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7", "base64");

(async () => {
  await sequelize.sync();
  await addMissingColumns(sequelize, [User]);
  const server = app.listen(0);
  const base = `http://127.0.0.1:${server.address().port}/api`;
  const call = async (method, path, { token, body, headers = {} } = {}) => {
    const r = await fetch(base + path, {
      method,
      headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}), ...headers },
      body,
    });
    let j = null; try { j = await r.json(); } catch (e) {}
    return { status: r.status, json: j };
  };
  const form = (buf, { type = "image/png", name = "a.png", field = "avatar", extra = {} } = {}) => {
    const f = new FormData();
    if (buf) f.append(field, new Blob([buf], { type }), name);
    for (const [k, v] of Object.entries(extra)) f.append(k, v);
    return f;
  };

  const sfx = Date.now().toString(36);
  const PW = "Mk9xTest123";
  const hash = await bcrypt.hash(PW, 4);
  const mk = (tag) => User.create({ name: "Nguoi Thu", email: `${tag}-${sfx}@t.test`, passwordHash: hash, role: "viewer", emailVerifiedAt: new Date() });
  const [u1, u2] = [await mk("av1"), await mk("av2")];
  const tok = async (u) => (await call("POST", "/auth/login", { body: JSON.stringify({ email: u.email, password: PW }), headers: { "Content-Type": "application/json" } })).json.data.accessToken;
  const [t1, t2] = [await tok(u1), await tok(u2)];

  // ---- xác thực
  let r = await call("POST", "/auth/avatar", { body: form(await png(300, 300)) });
  check("không token -> 401 UNAUTHENTICATED", r.status === 401 && r.json.error.code === "UNAUTHENTICATED", JSON.stringify(r.json));
  r = await call("DELETE", "/auth/avatar");
  check("DELETE không token -> 401", r.status === 401);
  check("không token thì không chạm Storage", uploaded.length === 0);

  // ---- tải ảnh hợp lệ (ảnh chữ nhật -> cắt vuông 512)
  r = await call("POST", "/auth/avatar", { token: t1, body: form(await png(1200, 700)) });
  check("ảnh PNG hợp lệ -> 200 ok:true", r.status === 200 && r.json.ok === true, JSON.stringify(r.json));
  check("trả về user có avatarUrl", r.json.ok && r.json.data.avatarUrl === `https://cdn.test/avatars/${u1.id}/1.webp`, JSON.stringify(r.json));
  check("đường dẫn Storage nằm trong thư mục của chính user (avatars/<id>/)", uploaded[0] && uploaded[0].path.startsWith(`avatars/${u1.id}/`));
  const meta = uploaded[0] && (await sharp(uploaded[0].buffer).metadata());
  check("server đã cắt vuông 512x512 và đổi sang WEBP", meta && meta.width === 512 && meta.height === 512 && meta.format === "webp", JSON.stringify(meta));
  check("response không lộ avatarPath / passwordHash / tokenVersion", r.json.ok && !("avatarPath" in r.json.data) && !("passwordHash" in r.json.data) && !("tokenVersion" in r.json.data), JSON.stringify(r.json.data));
  r = await call("GET", "/auth/me", { token: t1 });
  check("GET /auth/me trả avatarUrl mới", r.json.ok && r.json.data.avatarUrl === `https://cdn.test/avatars/${u1.id}/1.webp`);
  check("DB lưu avatarUrl + avatarPath", (await User.findByPk(u1.id)).avatarPath === `avatars/${u1.id}/1.webp`);

  // ---- ảnh nhỏ hơn 512 vẫn ra đúng 512 (không méo)
  r = await call("POST", "/auth/avatar", { token: t1, body: form(await png(100, 100)) });
  check("ảnh 100x100 -> 200 (phóng lên 512 vuông)", r.status === 200 && r.json.ok === true, JSON.stringify(r.json));

  // ---- đổi ảnh: ảnh cũ bị xóa khỏi Storage
  check("đổi ảnh: file cũ bị xóa khỏi Storage", removed.includes(`avatars/${u1.id}/1.webp`), JSON.stringify(removed));
  check("đổi ảnh: DB trỏ tới file mới", (await User.findByPk(u1.id)).avatarPath === `avatars/${u1.id}/2.webp`);

  // ---- client không quyết định được avatarUrl / avatarPath / userId
  const before = uploaded.length;
  r = await call("POST", "/auth/avatar", {
    token: t2,
    body: form(await png(200, 200), { extra: { avatarUrl: "https://evil.test/x.png", avatarPath: `avatars/${u1.id}/2.webp`, userId: String(u1.id), id: String(u1.id) } }),
  });
  const u2db = await User.findByPk(u2.id), u1db = await User.findByPk(u1.id);
  check("gửi avatarUrl/avatarPath/userId trong form -> bị bỏ qua", r.json.ok && u2db.avatarUrl === `https://cdn.test/avatars/${u2.id}/${before + 1}.webp` && u2db.avatarPath.startsWith(`avatars/${u2.id}/`), JSON.stringify(u2db.toJSON()));
  check("không ảnh hưởng ảnh của người khác", u1db.avatarPath === `avatars/${u1.id}/2.webp`);

  // ---- dữ liệu sai
  const n = uploaded.length;
  const bad = async (name, formData, codeWanted = "VALIDATION_FAILED", statusWanted = 200) => {
    const x = await call("POST", "/auth/avatar", { token: t1, body: formData });
    const okShape = x.status === statusWanted && x.json.error && x.json.error.code === codeWanted && (statusWanted !== 200 || (x.json.ok === false && x.json.error.fields && x.json.error.fields.avatar));
    check(name, okShape, `${x.status} ${JSON.stringify(x.json)}`);
  };
  await bad("không gửi file -> VALIDATION_FAILED fields.avatar", form(null));
  await bad("file chữ giả làm image/png -> VALIDATION_FAILED fields.avatar", form(Buffer.from("day khong phai anh"), { type: "image/png", name: "x.png" }));
  await bad("file rỗng -> VALIDATION_FAILED", form(Buffer.alloc(0)));
  await bad("GIF (định dạng không cho phép) dù khai image/png -> VALIDATION_FAILED", form(GIF, { type: "image/png", name: "x.png" }));
  await bad("SVG -> VALIDATION_FAILED", form(Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64"><script>alert(1)</script></svg>'), { type: "image/svg+xml", name: "x.svg" }));
  await bad("ảnh quá nhỏ 10x10 -> VALIDATION_FAILED", form(await png(10, 10)));
  await bad("sai tên trường (image thay vì avatar) -> VALIDATION_FAILED", form(await png(200, 200), { field: "image" }));
  const big = await sharp({ create: { width: 2400, height: 2400, channels: 3, noise: { type: "gaussian", mean: 128, sigma: 60 } } }).png().toBuffer();
  check("(chuẩn bị) ảnh thử lớn hơn 3MB", big.length > 3 * 1024 * 1024, String(big.length));
  await bad("ảnh > 3MB -> VALIDATION_FAILED 'Ảnh tối đa 3MB'", form(big));
  r = await call("POST", "/auth/avatar", { token: t1, body: JSON.stringify({ avatar: "x" }), headers: { "Content-Type": "application/json" } });
  check("gửi JSON thay vì multipart -> 415 UNSUPPORTED_MEDIA_TYPE", r.status === 415 && r.json.error.code === "UNSUPPORTED_MEDIA_TYPE", JSON.stringify(r.json));
  check("mọi ảnh lỗi đều bị chặn TRƯỚC khi lên Storage", uploaded.length === n);
  check("ảnh lỗi không đổi dữ liệu user", (await User.findByPk(u1.id)).avatarPath === `avatars/${u1.id}/2.webp`);

  // ---- lỗi Storage: 500, không đổi DB
  failUpload = true;
  r = await call("POST", "/auth/avatar", { token: t1, body: form(await png(200, 200)) });
  failUpload = false;
  check("Storage lỗi -> 500 INTERNAL_ERROR, không lộ chi tiết", r.status === 500 && r.json.error.code === "INTERNAL_ERROR" && !/Supabase/.test(JSON.stringify(r.json)), JSON.stringify(r.json));
  check("Storage lỗi -> DB giữ nguyên ảnh cũ", (await User.findByPk(u1.id)).avatarPath === `avatars/${u1.id}/2.webp`);

  // ---- xóa ảnh
  r = await call("DELETE", "/auth/avatar", { token: t1 });
  check("DELETE -> 200, avatarUrl = null", r.status === 200 && r.json.ok && r.json.data.avatarUrl === null, JSON.stringify(r.json));
  check("DELETE: file bị xóa khỏi Storage", removed.includes(`avatars/${u1.id}/2.webp`));
  const u1end = await User.findByPk(u1.id);
  check("DELETE: DB sạch avatarUrl/avatarPath", u1end.avatarUrl === null && u1end.avatarPath === null);
  r = await call("DELETE", "/auth/avatar", { token: t1 });
  check("DELETE lần 2 (đã không có ảnh) vẫn 200, không lỗi", r.status === 200 && r.json.ok === true);

  // ---- token bị thu hồi thì không đổi được ảnh
  await u2.update({ tokenVersion: u2.tokenVersion + 1 });
  r = await call("POST", "/auth/avatar", { token: t2, body: form(await png(200, 200)) });
  check("token đã bị thu hồi (tokenVersion lệch) -> 401", r.status === 401);

  await User.destroy({ where: { email: [u1.email, u2.email] } });
  server.close(); await sequelize.close();
  console.log(`\n${pass} pass, ${fail} fail`);
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
