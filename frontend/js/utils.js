// Hàm dùng chung: chọn phần tử, định dạng tiền, chống chèn HTML, thông báo, popup, khối HTML lặp lại
export const $ = (s, r = document) => r.querySelector(s);
export const $$ = (s, r = document) => [...r.querySelectorAll(s)];
export const vnd = (n) => Number(n).toLocaleString("vi-VN") + "đ";
export const esc = (s) =>
  String(s ?? "").replace(
    /[&<>"']/g,
    (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c],
  );

// ---------- thông báo nhỏ ----------
export function bao(t) {
  const d = document.createElement("div");
  d.className = "bao";
  d.textContent = t;
  document.body.append(d);
  setTimeout(() => d.remove(), 2400);
}

// ---------- popup (chọn vai, chi tiết món, hàng chờ) ----------
const popups = new Set();
export function hop(html) {
  Am.phat("mo");
  const o = document.createElement("div");
  o.className = "lop";
  o.innerHTML = `<div class="hop" role="dialog" aria-modal="true">${html}</div>`;
  const dong = () => {
    o.remove();
    popups.delete(dong);
    document.removeEventListener("keydown", k);
  };
  const k = (e) => e.key === "Escape" && dong();
  document.addEventListener("keydown", k);
  o.addEventListener("pointerdown", (e) => {
    if (e.target === o) dong();
  });
  popups.add(dong);
  document.body.append(o);
  return { el: o.firstChild, dong };
}
// đổi màn hình thì đóng hết popup còn mở
export const dongHetHop = () => [...popups].forEach((d) => d());

// ---------- biểu tượng / ảnh món ----------
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
export const dishIcon = (d) => {
  const hit = ICON_THEO_TEN.find(([re]) => re.test(d.name || ""));
  return hit ? hit[1] : ICON_THEO_LOAI[d.category] || "🍲";
};
// abc.webp -> abc_s.webp (ảnh nhỏ do backend tạo khi upload)
const thumbUrl = (url) => String(url).replace(/\.webp$/, "_s.webp");
// ô hình của món: có ảnh thì thẻ <img> (ảnh nhỏ, lỗi thì quay về ảnh gốc), không thì emoji
export const dishThumb = (d, eager = false, high = false) =>
  d.imageUrl
    ? `<img class="anh-bieu" src="${esc(thumbUrl(d.imageUrl))}" alt="${esc(d.name)}" width="88" height="88" loading="${eager ? "eager" : "lazy"}"${high ? ' fetchpriority="high"' : ""} decoding="async" data-goc="${esc(d.imageUrl)}">`
    : dishIcon(d);
// ảnh thumbnail chưa có thì dùng ảnh gốc (gắn 1 lần cho cả trang, vì sự kiện error không nổi bọt -> dùng capture)
export function nhoAnhLoi(root, signal) {
  root.addEventListener(
    "error",
    (e) => {
      const i = e.target;
      if (i.tagName === "IMG" && i.dataset.goc && i.src !== i.dataset.goc) i.src = i.dataset.goc;
    },
    { capture: true, signal },
  );
}

// ---------- khối HTML lặp lại ở nhiều màn hình ----------
export function thanhTren({ tabs = [], themHref, themLabel, role } = {}) {
  return `<div class="thanh">
  <a class="nut nut-phu" href="/">Ra phố</a>
  <div class="tabs">${tabs.map((t) => `<a class="nut tab${t.on ? " on" : ""}" href="${esc(t.href)}">${esc(t.label)}</a>`).join("")}</div>
  <div class="tabs">
    ${themHref ? `<a class="nut" href="${esc(themHref)}">${esc(themLabel)}</a>` : ""}
    ${!role ? `<a class="nut nut-phu" href="/login">Đăng nhập</a>` : `<a class="nut nut-phu" href="/account/security">Bảo mật</a>`}
  </div>
</div>`;
}

export function timKiem({ action, q, placeholder }) {
  return `<form class="tim" action="${esc(action)}" data-tim>
  <input type="text" name="q" value="${esc(q)}" placeholder="${esc(placeholder)}" autocomplete="off">
  <button class="nut">Tìm</button>
  <a class="nut nut-phu" href="${esc(action)}"${q ? "" : " hidden"}>Xóa tìm kiếm</a>
</form>`;
}

// Phân trang rút gọn: luôn có trang đầu, trang cuối và 2 trang quanh trang hiện tại (1 … 4 5 [6] 7 8 … 111)
// lk(extra) trả "?..." giữ nguyên từ khóa / sắp xếp / bộ lọc của danh sách
export function phanTrang({ page, totalPages, lk }) {
  const hien = new Set([1, totalPages]);
  for (let n = page - 2; n <= page + 2; n++) if (n >= 1 && n <= totalPages) hien.add(n);
  let h = `<nav class="phan-trang" aria-label="Phân trang">`;
  h += page === 1
    ? `<span class="nut nut-phu tat">&lt;</span>`
    : `<a class="nut nut-phu" href="${esc(lk({ page: page - 1 }))}" aria-label="Trang trước">&lt;</a>`;
  let truoc = 0;
  for (const n of [...hien].sort((x, y) => x - y)) {
    if (n - truoc > 1) h += `<span class="cach" aria-hidden="true">…</span>`;
    h += `<a class="nut ${n === page ? "on" : "nut-phu"}" href="${esc(lk({ page: n }))}"${n === page ? ' aria-current="page"' : ""}>${n}</a>`;
    truoc = n;
  }
  h += page === totalPages
    ? `<span class="nut nut-phu tat">&gt;</span>`
    : `<a class="nut nut-phu" href="${esc(lk({ page: page + 1 }))}" aria-label="Trang sau">&gt;</a>`;
  return h + `</nav>`;
}

// hai thẻ chọn vai (dùng ở trang phố và trang đăng nhập)
export const chonVai = `<div class="vai-luoi">
  <label class="vai"><input type="radio" name="role" value="admin" required>
    <svg viewBox="0 0 64 64" width="56" height="56" aria-hidden="true"><path d="M18 30c-6-1-9-6-7-11s8-7 12-4c2-6 12-7 15-1 5-3 12 0 12 6s-4 9-9 9v7H18z" fill="#fff" stroke="currentColor" stroke-width="3" stroke-linejoin="round"/><path d="M18 37h28v17a3 3 0 0 1-3 3H21a3 3 0 0 1-3-3z" fill="#fff" stroke="currentColor" stroke-width="3" stroke-linejoin="round"/><path d="M26 44v8M32 44v8M38 44v8" stroke="currentColor" stroke-width="3" stroke-linecap="round"/></svg>
    <b>Đầu bếp</b><small>Quản lí món ăn, nguyên liệu</small></label>
  <label class="vai"><input type="radio" name="role" value="user" required>
    <svg viewBox="0 0 64 64" width="56" height="56" aria-hidden="true"><circle cx="32" cy="21" r="10" fill="#fff" stroke="currentColor" stroke-width="3"/><path d="M12 56c0-12 9-19 20-19s20 7 20 19z" fill="#fff" stroke="currentColor" stroke-width="3" stroke-linejoin="round"/></svg>
    <b>Khách hàng</b><small>Xem thực đơn và gọi món</small></label>
</div>`;
