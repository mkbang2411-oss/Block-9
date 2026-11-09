// ===== REST API (JSON) =====  gắn tại /api, khớp hợp đồng trong API.md (đề: REST API và SPA)
//   GET    /api/health
//   POST   /api/auth/login | GET /api/auth/me | POST /api/auth/logout   (JWT, xem src/routes/auth-api.js)
//   POST   /api/auth/mfa/verify | /api/mfa/{setup,enable,disable,recovery-codes/*} | GET /api/mfa/status   (MFA, xem src/routes/mfa.js)
//   GET    /api/options                      công khai: categories, units, limits
//   GET    /api/dishes[/:id]                 công khai   ?q=&sort=&category=&available=&minPrice=&maxPrice=&page=&focus= | ?all=true
//   GET    /api/chefs[/:id], /api/ingredients[/:id]   viewer/editor/admin (Bearer)   (?q=&sort=&specialty= | ?unit=&page=&focus=)
//   POST   /api/:resource                    admin -> { ok:true, data: bản ghi mới }. Món ăn: multipart (có ảnh); còn lại: JSON
//   PATCH  /api/:resource/:id                admin -> { ok:true, data: bản ghi sau sửa }. Trường nào không gửi thì giữ nguyên
//                                            (món ăn không gửi ảnh = giữ ảnh cũ)
//   DELETE /api/:resource/:id                admin -> { ok:true, data:null } (bị chặn -> ok:false, RESOURCE_IN_USE)
// Mọi kết quả thành công và lỗi nghiệp vụ đều HTTP 200 (ok:true / ok:false); sai URL /api -> 404; hỏng hệ thống -> 500.
// Hình dạng phản hồi + mã lỗi: src/api/response.js, src/api/errors.js
const express = require("express");
const multer = require("multer");
const sharp = require("sharp");
const resources = require("../admin/resources");
const { requirePermission } = require("../middleware/auth");
const { actionOf } = require("./../api/permissions");
const { sequelize } = require("../models");
const { CATEGORIES, UNITS, LIMITS } = require("../constants");
const { parseId, asyncHandler } = require("../utils/format");
const { parseListQuery, runList } = require("../utils/list-query");
const { uploadImage, removeImage, EXT } = require("../utils/storage");
const { ApiError } = require("../api/errors");
const { ok } = require("../api/response");
const {
  requestId,
  cors,
  apiNotFound,
  apiErrorHandler,
} = require("../api/middleware");
const serialize = require("../api/serializers");

const router = express.Router();

router.use(requestId);
router.use(cors);
router.use(express.json({ limit: "100kb" }));

// mọi tài nguyên dùng chung mã NOT_FOUND, chỉ khác câu thông báo
const NOT_FOUND_MSG = {
  dishes: "Không tìm thấy món ăn.",
  chefs: "Không tìm thấy đầu bếp.",
  ingredients: "Không tìm thấy nguyên liệu.",
};
const notFound = (r) =>
  new ApiError("NOT_FOUND", { message: NOT_FOUND_MSG[r.key] });
const SERIALIZER = {
  dishes: serialize.dish,
  chefs: serialize.chef,
  ingredients: serialize.ingredient,
};

// ---------------------------------------------------------------- health
router.get(
  "/health",
  asyncHandler(async (req, res) => {
    try {
      await sequelize.authenticate();
    } catch (e) {
      console.error(`[api ${req.requestId}] health: DB không phản hồi`, e);
      throw new ApiError("DB_UNAVAILABLE");
    }
    ok(res, { status: "ok", database: "up" });
  }),
);

// ---------------------------------------------------------------- auth (JWT)
router.use("/auth", require("./auth-api"));
router.use("/auth", require("./register-api")); // đăng ký 3 bước + quên/đặt lại mật khẩu
router.use(require("./mfa")); // MFA TOTP: /auth/mfa/verify (đăng nhập bước 2) + /mfa/* (setup, enable, disable, recovery codes)

// ---------------------------------------------------------------- dữ liệu dùng chung cho form
router.get("/options", (req, res) =>
  ok(res, { categories: CATEGORIES, units: UNITS, limits: LIMITS }),
);

// ---------------------------------------------------------------- upload ảnh (chỉ món ăn)
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 3 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (!EXT[file.mimetype]) req.loiAnh = "Chỉ nhận ảnh JPG, PNG hoặc WEBP";
    cb(null, !!EXT[file.mimetype]);
  },
});
// lỗi ảnh không làm sập request mà đưa vào fields.image
const nhanAnh = (req, res, next) => {
  if (!req.is("multipart/form-data")) return next();
  upload.single("image")(req, res, (err) => {
    if (err)
      req.loiAnh =
        err.code === "LIMIT_FILE_SIZE"
          ? "Ảnh tối đa 3MB"
          : "Không đọc được ảnh, vui lòng thử lại";
    next();
  });
};

// ---------------------------------------------------------------- helpers
// id sai kiểu (abc, -1, 1.5...) được kiểm tra TRƯỚC khi chạm DB và xử lý như "không tìm thấy bản ghi"
function getId(req, r) {
  const id = parseId(req.params.id);
  if (!id) throw notFound(r);
  return id;
}

// Ép body (JSON hoặc multipart) về dạng "form" mà r.parse() dùng chung với bản cũ đang hiểu,
// đồng thời báo lỗi kiểu dữ liệu sai theo từng trường.
function toForm(r, body) {
  const form = {};
  const typeErrors = {};
  for (const f of r.fields) {
    if (f.type === "image" || !(f.name in body)) continue;
    const v = body[f.name];
    if (f.type === "checkbox") {
      if (v === true || v === "true" || v === "on") form[f.name] = "on";
      else if (v === false || v === "false" || v === "off")
        form[f.name] = "off";
      else typeErrors[f.name] = "Phải là true hoặc false";
    } else if (f.type === "multiselect") {
      const arr = Array.isArray(v) ? v : v === undefined || v === "" ? [] : [v]; // multipart: 1 giá trị = chuỗi
      if (arr.some((x) => typeof x !== "number" && typeof x !== "string"))
        typeErrors[f.name] = "Phải là một mảng id";
      else form[f.name] = arr.map(String);
    } else if (v === null) {
      form[f.name] = "";
    } else if (typeof v === "string" || typeof v === "number") {
      form[f.name] = String(v);
    } else {
      typeErrors[f.name] = "Giá trị không hợp lệ (cần chuỗi hoặc số)";
    }
  }
  return { form, typeErrors };
}

// kiểm tra file ảnh đọc được thật sự (đúng mimetype nhưng file hỏng -> VALIDATION_FAILED fields.image thay vì 500)
async function checkImage(file) {
  try {
    await sharp(file.buffer).metadata();
    return null;
  } catch (e) {
    return "Không đọc được ảnh, vui lòng chọn file ảnh khác";
  }
}

// Bản ghi hiện có -> dạng "form" (để PATCH: trường không gửi thì lấy lại giá trị cũ, rồi validate lại toàn bộ)
function recordToForm(r, record) {
  const v = r.toValues(record);
  if ("available" in v) v.available = v.available ? "on" : "off";
  return v;
}

function loadOne(r, id, options = {}) {
  return r.model.findByPk(id, { include: r.include, ...options });
}

// ---------------------------------------------------------------- ABAC cho món ăn
// Quyết định theo THUỘC TÍNH của bản ghi đọc từ DB và của req.user (đọc từ DB qua authenticate),
// KHÔNG BAO GIỜ theo role/chefId/status do client gửi trong body.
//   admin  : sửa mọi món
//   editor : chỉ sửa món có chefId = user.chefId VÀ status = draft
const canModifyDish = (user, dish) =>
  user.role === "admin" ||
  (user.role === "editor" &&
    user.chefId != null &&
    dish.chefId === user.chefId &&
    dish.status === "draft");
const forbidden = (message) => new ApiError("FORBIDDEN", message ? { message } : {});

// ---------------------------------------------------------------- CRUD cho từng resource
Object.values(resources).forEach((r) => {
  const base = `/${r.key}`;
  const toJson = SERIALIZER[r.key];
  const isDishes = r.key === "dishes";
  // RBAC: GET /dishes công khai; đầu bếp/nguyên liệu: viewer trở lên; ghi: theo bảng quyền (src/api/permissions.js).
  // Quyền được kiểm tra TRƯỚC khi đọc dữ liệu: 401 (chưa/sai token) -> 403 (role không đủ) -> 404 -> (ABAC) 403.
  const readGuard = isDishes ? [] : [].concat(requirePermission(actionOf(r.key, "read")));

  // ----- danh sách: ?q=&page= | ?all=true. Không có dữ liệu -> 200 + mảng rỗng (KHÔNG trả 404)
  router.get(
    base,
    ...readGuard,
    asyncHandler(async (req, res) => {
      // đọc + kiểm tra ?q ?sort ?category ?available ?minPrice ?maxPrice ?specialty ?unit (xem utils/list-query.js)
      const p = parseListQuery(r.key, req.query);
      if (Object.keys(p.errors).length)
        throw new ApiError("VALIDATION_FAILED", { fields: p.errors });

      // Query 1 (nhẹ): chỉ lấy id của trang cần trả - search/filter/sort/phân trang đều chạy bằng SQL trên TOÀN BỘ bảng
      const r1 = await runList(sequelize, r.key, p, {
        all: req.query.all === "true",
        focus: parseId(req.query.focus),
      });
      const total = r1.total;
      const pageIds = r1.ids;
      let meta = { total, sort: p.sort, sortBy: p.sortBy, sortOrder: p.sortOrder, mode: p.mode };
      if (req.query.all !== "true")
        meta = { ...meta, page: r1.page, perPage: r1.pageSize, pageSize: r1.pageSize, totalPages: r1.totalPages };

      // Query 2: nạp đầy đủ (kèm quan hệ) chỉ cho các bản ghi cần trả, giữ đúng thứ tự đã sắp xếp
      const rows = pageIds.length
        ? await r.model.findAll({ where: { id: pageIds }, include: r.include })
        : [];
      const pos = new Map(pageIds.map((id, i) => [id, i]));
      rows.sort((a, b) => pos.get(a.id) - pos.get(b.id));
      ok(res, rows.map(toJson), { meta });
    }),
  );

  // ----- chi tiết: id sai định dạng hoặc không có -> 200 + ok:false + NOT_FOUND
  router.get(
    `${base}/:id`,
    ...readGuard,
    asyncHandler(async (req, res) => {
      const record = await loadOne(r, getId(req, r));
      if (!record) throw notFound(r);
      ok(res, toJson(record));
    }),
  );

  // ----- đọc + kiểm tra dữ liệu gửi lên (dùng chung cho POST và PATCH)
  // PATCH (có record): trường không gửi giữ giá trị cũ; chỉ các trường khai báo trong r.fields mới được đọc
  // (không bao giờ bê nguyên request body vào lệnh ghi DB) và tất cả đều qua r.parse để validate.
  async function readInput(req, record) {
    const input = { ...(req.body || {}) };
    // ABAC: editor luôn bị ép đầu bếp = chefId của mình và status = draft (giá trị client gửi bị bỏ qua)
    if (isDishes && req.user.role === "editor") {
      input.chefId = String(req.user.chefId);
      input.status = "draft";
    }
    const { form: sent, typeErrors } = toForm(r, input);
    const form = record ? { ...recordToForm(r, record), ...sent } : sent;
    const { errors, data } = await r.parse(form, record);
    const all = { ...errors, ...typeErrors };
    if (isDishes) {
      if (req.loiAnh) all.image = req.loiAnh;
      else if (req.file) {
        const bad = await checkImage(req.file);
        if (bad) all.image = bad;
      }
    }
    if (Object.keys(all).length)
      throw new ApiError("VALIDATION_FAILED", {
        message: "Dữ liệu chưa hợp lệ.",
        fields: all,
      });
    return data;
  }

  // ----- thêm mới
  router.post(
    base,
    requirePermission(actionOf(r.key, "create")),
    isDishes ? nhanAnh : (req, res, next) => next(),
    asyncHandler(async (req, res) => {
      if (!isDishes && !req.is("application/json"))
        throw new ApiError("UNSUPPORTED_MEDIA_TYPE");
      if (isDishes && req.user.role === "editor" && req.user.chefId == null)
        throw forbidden("Tài khoản editor chưa được gán đầu bếp (chefId) nên chưa thể tạo món.");
      const data = await readInput(req, null);
      let img = null;
      if (isDishes && req.file) {
        img = await uploadImage(req.file);
        data.imageUrl = img.url;
        data.imagePath = img.path;
      }
      try {
        // transaction: tạo món + gán nguyên liệu là MỘT khối, lỗi giữa chừng thì hoàn tác cả hai
        const created = await sequelize.transaction(async (t) => {
          const rec = await r.model.create(data, { transaction: t });
          if (isDishes)
            await rec.setIngredients(data.ingredientIds, { transaction: t });
          return loadOne(r, rec.id, { transaction: t });
        });
        ok(res, toJson(created));
      } catch (e) {
        if (img) removeImage(img.path).catch(() => {}); // lưu DB lỗi thì dọn ảnh vừa tải lên
        throw e;
      }
    }),
  );

  // ----- sửa một phần (PATCH)
  router.patch(
    `${base}/:id`,
    requirePermission(actionOf(r.key, "update")),
    isDishes ? nhanAnh : (req, res, next) => next(),
    asyncHandler(async (req, res) => {
      if (!isDishes && !req.is("application/json"))
        throw new ApiError("UNSUPPORTED_MEDIA_TYPE");
      const id = getId(req, r);
      const record = await loadOne(r, id);
      if (!record) throw notFound(r);
      if (isDishes && !canModifyDish(req.user, record))
        throw forbidden("Bạn chỉ được sửa món nháp (draft) của đầu bếp mình phụ trách.");
      const data = await readInput(req, record);

      const oldPath = record.imagePath;
      let img = null;
      if (isDishes && req.file) {
        img = await uploadImage(req.file); // không gửi ảnh = data không có imageUrl -> giữ ảnh cũ
        data.imageUrl = img.url;
        data.imagePath = img.path;
      }
      let updated;
      try {
        updated = await sequelize.transaction(async (t) => {
          if (isDishes) {
            // đọc lại bản ghi và KHÓA dòng trong transaction: nếu giữa chừng món đã bị đổi sang published / đổi đầu bếp thì chặn
            const fresh = await r.model.findByPk(id, { transaction: t, lock: t.LOCK.UPDATE });
            if (!fresh) throw notFound(r);
            if (!canModifyDish(req.user, fresh))
              throw forbidden("Bạn chỉ được sửa món nháp (draft) của đầu bếp mình phụ trách.");
          }
          await record.update(data, { transaction: t });
          if (isDishes)
            await record.setIngredients(data.ingredientIds, { transaction: t });
          return loadOne(r, id, { transaction: t });
        });
      } catch (e) {
        if (img) removeImage(img.path).catch(() => {});
        throw e;
      }
      if (img && oldPath) removeImage(oldPath).catch(() => {}); // lưu DB xong mới xóa ảnh cũ
      ok(res, toJson(updated));
    }),
  );

  // ----- xóa -> { ok:true, data:null }
  router.delete(
    `${base}/:id`,
    requirePermission(actionOf(r.key, "delete")),
    asyncHandler(async (req, res) => {
      const id = getId(req, r);
      const record = await loadOne(r, id);
      if (!record) throw notFound(r);
      const reason = r.blockDelete ? await r.blockDelete(record) : null;
      if (reason) throw new ApiError("RESOURCE_IN_USE", { message: reason });

      const imagePath = record.imagePath;
      await sequelize.transaction((t) => record.destroy({ transaction: t }));
      // dữ liệu đã xóa xong; dọn ảnh chỉ là việc phụ, lỗi ở đây không được làm hỏng phản hồi
      if (r.hasImage && imagePath) {
        try {
          await removeImage(imagePath);
        } catch (e) {
          console.error(
            `[api ${req.requestId}] không xóa được ảnh ${imagePath}:`,
            e.message,
          );
        }
      }
      ok(res, null);
    }),
  );
});

router.use(apiNotFound);
router.use(apiErrorHandler);

module.exports = router;
