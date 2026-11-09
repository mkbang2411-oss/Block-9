// Cấu hình CRUD cho 3 model. Mỗi resource mô tả: cột trong bảng, field trong form,
// cách validate dữ liệu (parse) và cách lưu thêm quan hệ (afterSave).
const { Sequelize, Op } = require("sequelize");
const { Dish, Chef, Ingredient } = require("../models");
const { formatPrice, dishThumb } = require("../utils/format");
const { UNITS, CATEGORIES, LIMITS, DISH_STATUSES } = require("../constants");

const raw = (v) => (typeof v === "string" ? v : "");
// gọn khoảng trắng thừa: "  Phở   bò " -> "Phở bò"
const clean = (v) => raw(v).trim().replace(/\s+/g, " ");
const toOptions = (list) => list.map((x) => ({ value: x, label: x }));

// Tên đã tồn tại chưa (không phân biệt hoa/thường, bỏ qua chính bản ghi đang sửa)
async function nameTaken(model, name, ignoreId) {
  const conds = [
    Sequelize.where(
      Sequelize.fn("lower", Sequelize.col("name")),
      name.toLowerCase(),
    ),
  ];
  if (ignoreId) conds.push({ id: { [Op.ne]: ignoreId } });
  return !!(await model.findOne({ where: { [Op.and]: conds } }));
}

const dishes = {
  key: "dishes",
  model: Dish,
  hasImage: true,
  title: "Món ăn",
  singular: "món ăn",
  include: [
    { model: Chef, as: "chef" },
    { model: Ingredient, as: "ingredients" },
  ],
  order: [["id", "ASC"]],
  label: (r) => r.name,
  // ô hiển thị trên lưới ở trang quản trị
  // i = vị trí ô trên lưới (khung chi tiết ẩn không truyền i -> ảnh lazy)
  tile: (r, i = -1) => ({
    icon: dishThumb(r, i >= 0, i >= 0 && i < 3), // 3 ô đầu = ảnh LCP -> fetchpriority=high
    title: r.name,
    sub: formatPrice(r.price) + (r.available ? "" : " · Hết món"),
  }),
  columns: [
    { label: "Tên", value: (r) => r.name },
    { label: "Giá", value: (r) => formatPrice(r.price) },
    { label: "Danh mục", value: (r) => r.category || "—" },
    { label: "Còn bán", value: (r) => (r.available ? "Còn" : "Hết") },
    { label: "Đầu bếp", value: (r) => (r.chef ? r.chef.name : "—") },
    { label: "Mô tả", value: (r) => r.description || "—" },
    {
      label: "Nguyên liệu",
      value: (r) =>
        r.ingredients && r.ingredients.length
          ? r.ingredients.map((i) => i.name).join(", ")
          : "—",
    },
  ],
  fields: [
    {
      name: "name",
      label: "Tên món *",
      type: "text",
      hint: `${LIMITS.name.min}-${LIMITS.name.max} ký tự, không trùng món khác`,
    },
    {
      name: "description",
      label: "Mô tả",
      type: "textarea",
      hint: `Tối đa ${LIMITS.description.max} ký tự`,
    },
    {
      name: "price",
      label: "Giá (VNĐ) *",
      type: "text",
      inputmode: "numeric",
      hint: `Số nguyên từ ${LIMITS.price.min.toLocaleString("vi-VN")} đến ${LIMITS.price.max.toLocaleString("vi-VN")}`,
    },
    {
      name: "category",
      label: "Danh mục *",
      type: "select",
      placeholder: "— Chọn danh mục —",
    },
    { name: "available", label: "Còn bán", type: "checkbox" },
    { name: "status", label: "Trạng thái *", type: "select" },
    {
      name: "chefId",
      label: "Đầu bếp *",
      type: "select",
      placeholder: "— Chọn đầu bếp —",
    },
    { name: "ingredientIds", label: "Nguyên liệu", type: "multiselect" },
    {
      name: "image",
      label: "Ảnh món",
      type: "image",
      hint: "JPG/PNG/WEBP, tối đa 3MB. Bỏ trống = giữ ảnh cũ",
    },
  ],
  async loadOptions() {
    const [chefs, ingredients] = await Promise.all([
      Chef.findAll({ order: [["name", "ASC"]] }),
      Ingredient.findAll({ order: [["name", "ASC"]] }),
    ]);
    return {
      category: toOptions(CATEGORIES),
      status: [
        { value: "draft", label: "Nháp (draft)" },
        { value: "published", label: "Đã đăng (published)" },
      ],
      chefId: chefs.map((c) => ({ value: String(c.id), label: c.name })),
      ingredientIds: ingredients.map((i) => ({
        value: String(i.id),
        label: `${i.name} (${i.unit})`,
      })),
    };
  },
  toValues(r) {
    return {
      name: r.name,
      description: r.description || "",
      price: String(Number(r.price)),
      category: r.category || "",
      available: r.available,
      status: r.status || "published",
      chefId: r.chefId ? String(r.chefId) : "",
      ingredientIds: (r.ingredients || []).map((i) => String(i.id)),
    };
  },
  async parse(body, record) {
    const errors = {};
    const name = clean(body.name);
    const description = raw(body.description).trim();
    const category = raw(body.category).trim();
    const priceRaw = raw(body.price).trim();
    const chefIdRaw = raw(body.chefId).trim();
    const ingredientIds = []
      .concat(body.ingredientIds ?? [])
      .map(String)
      .filter(Boolean);

    // Tên: bắt buộc, 2-120 ký tự, không trùng
    if (!name) errors.name = "Tên món là bắt buộc";
    else if (name.length < LIMITS.name.min || name.length > LIMITS.name.max)
      errors.name = `Tên món phải từ ${LIMITS.name.min} đến ${LIMITS.name.max} ký tự`;
    else if (await nameTaken(Dish, name, record && record.id))
      errors.name = "Tên món đã tồn tại";

    if (description.length > LIMITS.description.max)
      errors.description = `Mô tả tối đa ${LIMITS.description.max} ký tự`;

    // Giá: bắt buộc, số nguyên trong khoảng cho phép
    const price = Number(priceRaw);
    if (priceRaw === "") errors.price = "Giá là bắt buộc";
    else if (!/^\d+$/.test(priceRaw))
      errors.price = "Giá phải là số nguyên, không có dấu chấm, phẩy hay chữ";
    else if (price < LIMITS.price.min || price > LIMITS.price.max)
      errors.price = `Giá phải từ ${LIMITS.price.min.toLocaleString("vi-VN")} đến ${LIMITS.price.max.toLocaleString("vi-VN")} đ`;

    // Danh mục: bắt buộc, chỉ nhận giá trị trong danh sách
    if (!category) errors.category = "Vui lòng chọn danh mục";
    else if (!CATEGORIES.includes(category))
      errors.category = "Danh mục không hợp lệ";

    // Trạng thái (ABAC): chỉ nhận draft | published; không gửi thì giữ giá trị cũ, món mới mặc định draft
    const statusRaw = raw(body.status).trim();
    let status = statusRaw || (record ? record.status : "draft");
    if (!DISH_STATUSES.includes(status)) {
      errors.status = "Trạng thái không hợp lệ (draft hoặc published)";
      status = "draft";
    }

    // Đầu bếp: BẮT BUỘC chọn, và phải tồn tại
    let chefId = null;
    if (!chefIdRaw) {
      errors.chefId = "Vui lòng chọn đầu bếp";
    } else if (
      !/^\d{1,9}$/.test(chefIdRaw) ||
      !(await Chef.findByPk(Number(chefIdRaw)))
    ) {
      errors.chefId = "Đầu bếp không tồn tại";
    } else {
      chefId = Number(chefIdRaw);
    }

    // Nguyên liệu: nếu chọn thì phải tồn tại
    if (ingredientIds.some((id) => !/^\d{1,9}$/.test(id))) {
      errors.ingredientIds = "Nguyên liệu không hợp lệ";
    } else if (ingredientIds.length) {
      const unique = [...new Set(ingredientIds.map(Number))];
      const count = await Ingredient.count({ where: { id: unique } });
      if (count !== unique.length)
        errors.ingredientIds = "Có nguyên liệu không tồn tại";
    }

    return {
      errors,
      // giá trị người dùng đã nhập, để hiện lại trên form khi trả 400
      values: {
        name: raw(body.name),
        description: raw(body.description),
        price: raw(body.price),
        category,
        available: body.available === "on",
        status,
        chefId: chefIdRaw,
        ingredientIds,
      },
      data: {
        name,
        description: description || null,
        price,
        category,
        available: body.available === "on",
        status,
        chefId,
        ingredientIds: [...new Set(ingredientIds.map(Number))],
      },
    };
  },
  async afterSave(record, data) {
    await record.setIngredients(data.ingredientIds);
  },
};

const chefs = {
  key: "chefs",
  model: Chef,
  title: "Đầu bếp",
  singular: "đầu bếp",
  include: [],
  order: [["id", "ASC"]],
  label: (r) => r.name,
  tile: (r) => ({
    icon: "👩‍🍳",
    title: r.name,
    sub: r.specialty || "Chưa có chuyên môn",
  }),
  columns: [
    { label: "Tên", value: (r) => r.name },
    { label: "Chuyên môn", value: (r) => r.specialty || "—" },
  ],
  fields: [
    {
      name: "name",
      label: "Tên đầu bếp *",
      type: "text",
      hint: `${LIMITS.name.min}-${LIMITS.name.max} ký tự`,
    },
    {
      name: "specialty",
      label: "Chuyên môn",
      type: "text",
      hint: `Tối đa ${LIMITS.specialty.max} ký tự`,
    },
  ],
  async loadOptions() {
    return {};
  },
  toValues: (r) => ({ name: r.name, specialty: r.specialty || "" }),
  // Trả về lý do không được xóa (hoặc null nếu xóa được)
  async blockDelete(record) {
    const n = await Dish.count({ where: { chefId: record.id } });
    return n
      ? `Không thể xóa: đầu bếp này đang phụ trách ${n} món. Hãy đổi đầu bếp của các món đó trước.`
      : null;
  },
  async parse(body) {
    const errors = {};
    const name = clean(body.name);
    const specialty = clean(body.specialty);
    if (!name) errors.name = "Tên đầu bếp là bắt buộc";
    else if (name.length < LIMITS.name.min || name.length > LIMITS.name.max)
      errors.name = `Tên phải từ ${LIMITS.name.min} đến ${LIMITS.name.max} ký tự`;
    if (specialty.length > LIMITS.specialty.max)
      errors.specialty = `Chuyên môn tối đa ${LIMITS.specialty.max} ký tự`;
    return {
      errors,
      values: { name: raw(body.name), specialty: raw(body.specialty) },
      data: { name, specialty: specialty || null },
    };
  },
};

const ingredients = {
  key: "ingredients",
  model: Ingredient,
  title: "Nguyên liệu",
  singular: "nguyên liệu",
  include: [],
  order: [["id", "ASC"]],
  label: (r) => r.name,
  tile: (r) => ({ icon: "🧂", title: r.name, sub: "Đơn vị: " + r.unit }),
  columns: [
    { label: "Tên", value: (r) => r.name },
    { label: "Đơn vị", value: (r) => r.unit },
  ],
  fields: [
    {
      name: "name",
      label: "Tên nguyên liệu *",
      type: "text",
      hint: `${LIMITS.ingredientName.min}-${LIMITS.ingredientName.max} ký tự, không trùng nguyên liệu khác`,
    },
    {
      name: "unit",
      label: "Đơn vị *",
      type: "select",
      placeholder: "— Chọn đơn vị —",
    },
  ],
  async loadOptions() {
    return { unit: toOptions(UNITS) };
  },
  toValues: (r) => ({ name: r.name, unit: r.unit }),
  async parse(body, record) {
    const errors = {};
    const name = clean(body.name);
    const unit = raw(body.unit).trim();
    if (!name) errors.name = "Tên nguyên liệu là bắt buộc";
    else if (
      name.length < LIMITS.ingredientName.min ||
      name.length > LIMITS.ingredientName.max
    )
      errors.name = `Tên phải từ ${LIMITS.ingredientName.min} đến ${LIMITS.ingredientName.max} ký tự`;
    else if (await nameTaken(Ingredient, name, record && record.id))
      errors.name = "Nguyên liệu này đã tồn tại";

    if (!unit) errors.unit = "Vui lòng chọn đơn vị";
    else if (!UNITS.includes(unit))
      errors.unit = `Đơn vị phải là một trong: ${UNITS.join(", ")}`;

    return {
      errors,
      values: { name: raw(body.name), unit },
      data: { name, unit },
    };
  },
};

module.exports = { dishes, chefs, ingredients };
