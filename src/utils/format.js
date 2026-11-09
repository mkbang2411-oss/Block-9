const formatPrice = (value) =>
  Number(value).toLocaleString("vi-VN", { maximumFractionDigits: 0 }) + " đ";

// id hợp lệ = số nguyên dương; sai định dạng thì coi như không tồn tại (404)
const parseId = (value) =>
  /^\d{1,9}$/.test(String(value)) && Number(value) > 0 ? Number(value) : null;

const asyncHandler = (fn) => (req, res, next) =>
  Promise.resolve(fn(req, res, next)).catch(next);

// DB không lưu icon -> chọn emoji theo tên món (ưu tiên) rồi tới danh mục
const ICON_THEO_TEN = [
  [/cà phê|cafe|coffee/i, "☕"], // đặt trước 'trứng' để 'Cà phê trứng' ra ☕
  [/trứng/i, "🍳"],
  [/ph[ởo]|bún|hủ tiếu|miến|bò kho/i, "🍜"],
  [/spaghetti|mì|pasta|nui/i, "🍝"],
  [/cơm|xôi/i, "🍚"],
  [/nem|chả|gỏi cuốn|cuốn/i, "🌯"],
  [/bánh mì/i, "🥖"],
  [/bánh/i, "🥟"],
  [/cá|tôm|mực|hải sản/i, "🐟"],
  [/thịt|bò|heo|gà|nướng/i, "🍖"],
  [/trà|chè/i, "🍧"],
  [/kem|flan|tráng miệng/i, "🍨"],
  [/nước|sinh tố|bia|rượu/i, "🥤"],
];
const ICON_THEO_LOAI = {
  "Khai vị": "🥗",
  "Món chính": "🍲",
  "Tráng miệng": "🍧",
  "Đồ uống": "🥤",
  "Món chay": "🥬",
};
const dishIcon = (dish) => {
  const hit = ICON_THEO_TEN.find(([re]) => re.test(dish.name || ""));
  return hit ? hit[1] : ICON_THEO_LOAI[dish.category] || "🍲";
};

// ô hình của món: có ảnh thì trả thẻ <img>, không thì dùng emoji (in bằng <%- %>)
const escHtml = (v) =>
  String(v).replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ],
  );
// URL thumbnail: abc.webp -> abc_s.webp (xem utils/storage.js)
const thumbUrl = (url) => String(url).replace(/\.webp$/, "_s.webp");

// eager = ảnh nằm ngay màn hình đầu (tải liền, giúp LCP nhanh); còn lại lazy
// high  = ảnh LCP: báo trình duyệt tải trước (fetchpriority="high")
// Ô hình nhỏ nên dùng thumbnail; ảnh cũ chưa có thumbnail thì tự quay về ảnh gốc (onerror, chỉ đổi src, không gửi dữ liệu)
const dishThumb = (dish, eager = false, high = false) =>
  dish.imageUrl
    ? `<img class="anh-bieu" src="${escHtml(thumbUrl(dish.imageUrl))}" alt="${escHtml(dish.name)}" width="88" height="88" loading="${eager ? "eager" : "lazy"}"${high ? ' fetchpriority="high"' : ""} decoding="async" onerror="this.onerror=null;this.src='${escHtml(dish.imageUrl)}'">`
    : dishIcon(dish);

module.exports = { thumbUrl, formatPrice, parseId, asyncHandler, dishIcon, dishThumb };
