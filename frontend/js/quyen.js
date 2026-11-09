// F10: quyền ở GIAO DIỆN. CHỈ dùng để ẩn nút / chặn mở màn hình vô ích; KHÔNG phải nơi quyết định quyền.
// Server luôn kiểm lại ở từng request theo role / chefId đọc từ DB (RBAC: src/api/permissions.js, ABAC: canModifyDish ở
// src/routes/api.js). File này chỉ phản chiếu luật đó, nên khi sửa luật ở server nhớ sửa lại ở đây:
//   viewer : chỉ đọc
//   editor : thêm món (đầu bếp bị ép = chefId của mình, status bị ép = draft, cần đã được gán chefId);
//            sửa món có chefId = của mình VÀ status = draft; không xóa; đầu bếp / nguyên liệu chỉ đọc
//   admin  : mọi thao tác
// Mỗi hàm trả "" nếu ĐƯỢC phép, hoặc câu giải thích vì sao KHÔNG (dùng làm nội dung màn hình 403 / ghi chú dưới khung chi tiết).
const CHI_XEM = "Tài khoản của bạn chỉ có quyền xem.";
const CHI_ADMIN = "Chỉ quản trị viên (admin) mới được thay đổi đầu bếp và nguyên liệu.";
const CHUA_GAN_BEP = "Tài khoản editor chưa được gán đầu bếp nên chưa thể thêm hoặc sửa món. Hãy nhờ admin gán đầu bếp cho bạn.";
const CHI_MON_NHAP = "Bạn chỉ được sửa món nháp (draft) của đầu bếp mình phụ trách.";
const CHI_ADMIN_XOA = "Chỉ quản trị viên (admin) mới được xóa.";

const vai = (me) => (me && me.role) || null;
const cungBep = (me, row) => row.chefId != null && me.chefId != null && Number(row.chefId) === Number(me.chefId);

export function lyDoKhongThem(me, resKey) {
  const v = vai(me);
  if (v === "admin") return "";
  if (v === "editor") {
    if (resKey !== "dishes") return CHI_ADMIN;
    return me.chefId == null ? CHUA_GAN_BEP : "";
  }
  return CHI_XEM;
}

// row = null: chỉ kiểm quyền theo vai (chưa có bản ghi để xét thuộc tính), dùng trước khi tải dữ liệu
export function lyDoKhongSua(me, resKey, row = null) {
  const v = vai(me);
  if (v === "admin") return "";
  if (v === "editor") {
    if (resKey !== "dishes") return CHI_ADMIN;
    if (me.chefId == null) return CHUA_GAN_BEP;
    if (!row) return "";
    return cungBep(me, row) && row.status === "draft" ? "" : CHI_MON_NHAP;
  }
  return CHI_XEM;
}

export function lyDoKhongXoa(me) {
  const v = vai(me);
  if (v === "admin") return "";
  return v === "editor" ? CHI_ADMIN_XOA : CHI_XEM;
}

export const duocThem = (me, resKey) => !lyDoKhongThem(me, resKey);
export const duocSua = (me, resKey, row) => !lyDoKhongSua(me, resKey, row);
export const duocXoa = (me) => !lyDoKhongXoa(me);
