// Cấu hình giao diện cho 3 tài nguyên quản trị (trước đây ở src/admin/resources.js, nhưng phần validate
// nay do BACKEND làm; ở đây chỉ còn: ô nào hiện trên lưới / khung chi tiết / form).
// L = limits lấy từ GET /api/options (không viết cứng số ở frontend).
import { dishThumb } from "./utils.js";

export const giaDong = (n) =>
  Number(n).toLocaleString("vi-VN", { maximumFractionDigits: 0 }) + " đ";

// F11: trạng thái món. draft = bản nháp (editor còn sửa được), published = đã đăng (chỉ admin sửa). Khớp DISH_STATUSES ở server.
export const TRANG_THAI_MON = [
  ["draft", "Bản nháp (draft)"],
  ["published", "Đã đăng (published)"],
];
const nhanTrangThai = (s) => (TRANG_THAI_MON.find(([k]) => k === s) || [, "—"])[1];

const dishes = {
  key: "dishes",
  title: "Món ăn",
  singular: "món ăn",
  label: (r) => r.name,
  // ô hiển thị trên lưới (i = vị trí ô; 3 ô đầu là ảnh LCP -> tải ngay)
  tile: (r, i = -1) => ({
    icon: dishThumb(r, i >= 0, i >= 0 && i < 3),
    title: r.name,
    sub:
      giaDong(r.price) +
      (r.available ? "" : " · Hết món") +
      (r.status === "draft" ? " · Bản nháp" : ""),
  }),
  columns: [
    { label: "Tên", value: (r) => r.name },
    { label: "Giá", value: (r) => giaDong(r.price) },
    { label: "Danh mục", value: (r) => r.category || "—" },
    { label: "Còn bán", value: (r) => (r.available ? "Còn" : "Hết") },
    { label: "Trạng thái", value: (r) => nhanTrangThai(r.status) },
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
      hint: (L) => `${L.name.min}-${L.name.max} ký tự, không trùng món khác`,
    },
    {
      name: "description",
      label: "Mô tả",
      type: "textarea",
      hint: (L) => `Tối đa ${L.description.max} ký tự`,
    },
    {
      name: "price",
      label: "Giá (VNĐ) *",
      type: "text",
      inputmode: "numeric",
      hint: (L) =>
        `Số nguyên từ ${L.price.min.toLocaleString("vi-VN")} đến ${L.price.max.toLocaleString("vi-VN")}`,
    },
    {
      name: "category",
      label: "Danh mục *",
      type: "select",
      placeholder: "— Chọn danh mục —",
    },
    { name: "available", label: "Còn bán", type: "checkbox" },
    {
      name: "status",
      label: "Trạng thái *",
      type: "select",
      placeholder: "— Chọn trạng thái —",
      hint: () => "Bản nháp: đầu bếp còn sửa được. Đã đăng: chỉ admin sửa được",
    },
    {
      name: "chefId",
      label: "Đầu bếp *",
      type: "select",
      placeholder: "— Chọn đầu bếp —",
    },
    // to: "phai" -> ô nằm ở tờ giấy bên phải của form (từ "Nguyên liệu" trở xuống); không có -> tờ giấy bên trái
    {
      name: "ingredientIds",
      label: "Nguyên liệu",
      type: "ingredients",
      to: "phai",
    },
    {
      name: "image",
      label: "Ảnh món",
      type: "image",
      to: "phai",
      hint: () => "JPG/PNG/WEBP, tối đa 3MB. Bỏ trống = giữ ảnh cũ",
    },
  ],
  toValues: (r) => ({
    name: r.name,
    description: r.description || "",
    price: String(Number(r.price)),
    category: r.category || "",
    available: r.available,
    status: r.status || "draft",
    chefId: r.chefId ? String(r.chefId) : r.chef ? String(r.chef.id) : "",
    ingredientIds: (r.ingredients || []).map((i) => String(i.id)),
  }),
  empty: () => ({
    name: "",
    description: "",
    price: "",
    category: "",
    available: true,
    status: "draft",
    chefId: "",
    ingredientIds: [],
  }),
};

const chefs = {
  key: "chefs",
  title: "Đầu bếp",
  singular: "đầu bếp",
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
      hint: (L) => `${L.name.min}-${L.name.max} ký tự`,
    },
    {
      name: "specialty",
      label: "Chuyên môn",
      type: "text",
      hint: (L) => `Tối đa ${L.specialty.max} ký tự`,
    },
  ],
  toValues: (r) => ({ name: r.name, specialty: r.specialty || "" }),
  empty: () => ({ name: "", specialty: "" }),
};

const ingredients = {
  key: "ingredients",
  title: "Nguyên liệu",
  singular: "nguyên liệu",
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
      hint: (L) =>
        `${L.ingredientName.min}-${L.ingredientName.max} ký tự, không trùng nguyên liệu khác`,
    },
    {
      name: "unit",
      label: "Đơn vị *",
      type: "select",
      placeholder: "— Chọn đơn vị —",
    },
  ],
  toValues: (r) => ({ name: r.name, unit: r.unit }),
  empty: () => ({ name: "", unit: "" }),
};

export const RES = { dishes, chefs, ingredients };
export const adminTabs = (active) =>
  Object.values(RES).map((r) => ({
    href: "/admin/" + r.key,
    label: r.title,
    on: r.key === active,
  }));
