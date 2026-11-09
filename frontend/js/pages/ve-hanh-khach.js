// Vé hành khách (H5-H6): bấm cô gái áo dài ở đầu phố -> hồ sơ + ảnh đại diện. Port từ moVe() của Block 8 (public/js/home.js).
//   - xem: avatar tròn + tên. Bấm avatar (hoặc "Đổi ảnh") để chọn ảnh từ máy.
//   - chỉnh: kéo ảnh để dời, thanh trượt / nút +/- / lăn chuột / chụm 2 ngón để zoom.
//   - lưu: cắt đúng vùng đang thấy ra ảnh vuông 512px NGAY TRÊN TRÌNH DUYỆT, gửi POST /api/auth/avatar kèm Bearer
//     (api.auth.uploadAvatar); server kiểm tra lại nội dung ảnh, cắt 512px + WEBP rồi lưu Supabase (avatarUrl, avatarPath).
// Ảnh người dùng chỉ vào DOM qua esc() / thuộc tính src đã kiểm http(s).
import { api } from "../api.js";
import { setMe } from "../session.js";
import { navigate } from "../router.js";
import { $, bao, esc, hop } from "../utils.js";

export function moVeHanhKhach(khach, { onDoi } = {}) {
  Am.phat("cuoi");
  const chu = (khach.ten.trim()[0] || "?").toUpperCase();
  const h = hop(`
    <div class="ve-giay">
      <div class="ve-tren"><span>Vé hành khách</span><span>Phố cổ Hội An</span></div>
      <div class="ve-than">
        <div class="ve-trai">
          <button type="button" class="ve-avt" id="ve-avt" aria-label="Đổi ảnh đại diện"></button>
          <button type="button" class="nut nut-phu ve-doi" data-a="chon">Đổi ảnh</button>
        </div>
        <div class="ve-phai">
          <small>HÀNH KHÁCH</small>
          <b class="ve-ten">${esc(khach.ten)}</b>
          <span class="ve-tuyen">Hội An <span aria-hidden="true">→</span> Cái Quán Ăn</span>
          <div class="ve-vach" aria-hidden="true"></div>
          <span class="ve-ghichu">Ảnh JPG, PNG hoặc WEBP · tối đa 3MB</span>
        </div>
      </div>
      <div class="ve-sua">
        <div class="ve-khung" id="ve-khung" aria-label="Kéo để dời ảnh"><img alt="" draggable="false"></div>
        <div class="ve-dk">
          <h3>Chỉnh ảnh đại diện</h3>
          <div class="ve-zoom">
            <button type="button" data-a="ra" aria-label="Thu nhỏ">−</button>
            <input type="range" id="ve-zoom" min="0" max="100" step="0.5" value="0" aria-label="Thu phóng">
            <button type="button" data-a="vao" aria-label="Phóng to">+</button>
          </div>
          <p>Kéo ảnh để chọn vị trí, kéo thanh trượt hoặc lăn chuột để phóng to / thu nhỏ.</p>
        </div>
      </div>
      <div class="ve-chan ve-chan-thuong"><div class="nut-hang"><button type="button" class="nut nut-phu" data-a="dong">Đóng</button></div></div>
      <div class="ve-chan ve-chan-sua" hidden><div class="nut-hang"><button type="button" class="nut nut-phu" data-a="huy">Hủy</button><button type="button" class="nut" data-a="luu">Lưu ảnh</button></div></div>
      <input type="file" id="ve-file" accept="image/jpeg,image/png,image/webp" hidden>
    </div>`);
  const ve = h.el;
  ve.classList.add("ve");
  ve.parentNode.classList.add("lop-ve");
  const avt = $("#ve-avt", ve),
    file = $("#ve-file", ve),
    khung = $("#ve-khung", ve),
    anh = $("img", khung),
    zoom = $("#ve-zoom", ve),
    chanSua = $(".ve-chan-sua", ve),
    chanThuong = $(".ve-chan-thuong", ve),
    nutLuu = $('[data-a="luu"]', ve);

  const veAvt = () => {
    avt.innerHTML = /^https?:\/\//.test(khach.avt || "")
      ? `<img src="${esc(khach.avt)}" alt="Ảnh đại diện" decoding="async"><span class="ve-may">Đổi ảnh</span>`
      : `${esc(chu)}<span class="ve-may">Tải ảnh lên</span>`;
  };
  veAvt();

  // ---- trạng thái chỉnh ảnh ----
  const F = 232; // cạnh khung (px), khớp .ve-khung (JS đo lại thực tế bên dưới)
  let W = 0,
    H = 0, // kích thước gốc của ảnh
    s = 1,
    sMin = 1,
    sMax = 1, // tỉ lệ phóng hiện tại / nhỏ nhất (vừa khít) / lớn nhất
    cx = 0,
    cy = 0, // tâm ảnh trong khung
    kich = F,
    url = null,
    dangLuu = false;

  const kep = () => {
    const w = W * s,
      hh = H * s;
    // ảnh lớn hơn khung: không cho hở mép; nhỏ hơn khung: giữ trong khung
    cx =
      w >= kich
        ? Math.min(w / 2, Math.max(kich - w / 2, cx))
        : Math.min(kich - w / 2, Math.max(w / 2, cx));
    cy =
      hh >= kich
        ? Math.min(hh / 2, Math.max(kich - hh / 2, cy))
        : Math.min(kich - hh / 2, Math.max(hh / 2, cy));
  };
  const ve_ = () => {
    kep();
    anh.style.transform = `translate(${cx - (W * s) / 2}px, ${cy - (H * s) / 2}px) scale(${s})`;
    zoom.value = (Math.log(s / sMin) / Math.log(sMax / sMin)) * 100;
  };
  // đặt zoom, giữ nguyên điểm (px, py) trong khung đứng yên (zoom vào đúng chỗ con trỏ / giữa khung)
  const datZoom = (sMoi, px = kich / 2, py = kich / 2) => {
    sMoi = Math.min(sMax, Math.max(sMin, sMoi));
    const k = sMoi / s;
    cx = px - (px - cx) * k;
    cy = py - (py - cy) * k;
    s = sMoi;
    ve_();
  };
  const tuThanh = () => sMin * Math.pow(sMax / sMin, zoom.value / 100);

  function vaoCheDoSua(f) {
    if (url) URL.revokeObjectURL(url);
    url = URL.createObjectURL(f);
    const im = new Image();
    im.onload = () => {
      W = im.naturalWidth;
      H = im.naturalHeight;
      anh.src = url;
      anh.width = W;
      anh.height = H;
      ve.classList.add("sua");
      chanSua.hidden = false;
      chanThuong.hidden = true;
      kich = khung.clientWidth || F;
      const phu = Math.max(kich / W, kich / H); // vừa phủ kín khung
      sMin = Math.min(kich / W, kich / H); // vừa khít cả ảnh (zoom ra tối đa)
      sMax = Math.max(phu * 4, sMin * 4); // zoom vào tối đa 4 lần
      s = phu;
      cx = kich / 2;
      cy = kich / 2;
      ve_();
    };
    im.onerror = () => bao("Không đọc được ảnh này, hãy thử ảnh khác");
    im.src = url;
  }
  function thoatCheDoSua() {
    ve.classList.remove("sua");
    chanSua.hidden = true;
    chanThuong.hidden = false;
    if (url) URL.revokeObjectURL(url);
    url = null;
    anh.removeAttribute("src");
    file.value = "";
  }

  file.addEventListener("change", () => {
    const f = file.files[0];
    if (!f) return;
    if (!["image/jpeg", "image/png", "image/webp"].includes(f.type)) {
      file.value = "";
      return bao("Chỉ nhận ảnh JPG, PNG hoặc WEBP");
    }
    if (f.size > 25 * 1024 * 1024) {
      file.value = "";
      return bao("Ảnh quá lớn, hãy chọn ảnh dưới 25MB");
    }
    vaoCheDoSua(f);
  });

  // ---- kéo ảnh (chuột / cảm ứng) + chụm 2 ngón ----
  const cham = new Map(); // pointerId -> {x, y}
  let khoang0 = 0,
    s0 = 1;
  const toaDo = (e) => {
    const r = khung.getBoundingClientRect();
    return [e.clientX - r.left, e.clientY - r.top];
  };
  khung.addEventListener("pointerdown", (e) => {
    if (dangLuu) return;
    khung.setPointerCapture(e.pointerId);
    cham.set(e.pointerId, { x: e.clientX, y: e.clientY });
    khung.classList.add("keo");
    if (cham.size === 2) {
      const [a, b] = [...cham.values()];
      khoang0 = Math.hypot(a.x - b.x, a.y - b.y) || 1;
      s0 = s;
    }
  });
  khung.addEventListener("pointermove", (e) => {
    const c = cham.get(e.pointerId);
    if (!c) return;
    if (cham.size === 1) {
      cx += e.clientX - c.x;
      cy += e.clientY - c.y;
      c.x = e.clientX;
      c.y = e.clientY;
      ve_();
    } else if (cham.size === 2) {
      c.x = e.clientX;
      c.y = e.clientY;
      const [a, b] = [...cham.values()];
      const r = khung.getBoundingClientRect();
      datZoom(
        (s0 * Math.hypot(a.x - b.x, a.y - b.y)) / khoang0,
        (a.x + b.x) / 2 - r.left,
        (a.y + b.y) / 2 - r.top,
      );
    }
  });
  const nha = (e) => {
    cham.delete(e.pointerId);
    if (!cham.size) khung.classList.remove("keo"); // còn 1 ngón thì tiếp tục kéo từ vị trí đã lưu
  };
  khung.addEventListener("pointerup", nha);
  khung.addEventListener("pointercancel", nha);
  // lăn chuột để zoom (chặn lăn cả phố phía sau)
  khung.addEventListener(
    "wheel",
    (e) => {
      e.preventDefault();
      e.stopPropagation();
      const [px, py] = toaDo(e);
      datZoom(s * Math.exp(-e.deltaY * 0.0015), px, py);
    },
    { passive: false },
  );
  zoom.addEventListener("input", () => datZoom(tuThanh()));

  // ---- cắt ảnh + gửi lên server ----
  async function luuAnh() {
    if (dangLuu) return;
    dangLuu = true;
    nutLuu.disabled = true;
    nutLuu.textContent = "Đang lưu…";
    try {
      const OUT = 512,
        k = OUT / kich,
        cv = document.createElement("canvas");
      cv.width = cv.height = OUT;
      const g = cv.getContext("2d");
      g.fillStyle = "#f6e8c8"; // phần hở (khi zoom ra hết cỡ)
      g.fillRect(0, 0, OUT, OUT);
      g.imageSmoothingQuality = "high";
      g.drawImage(
        anh,
        (cx - (W * s) / 2) * k,
        (cy - (H * s) / 2) * k,
        W * s * k,
        H * s * k,
      );
      const blob = await new Promise((ok) =>
        cv.toBlob(ok, "image/webp", 0.9),
      );
      if (!blob) throw new Error("Không xử lý được ảnh");
      const user = await api.auth.uploadAvatar(blob);
      setMe(user); // cập nhật bản sao của /me để các màn hình khác thấy ảnh mới
      khach.avt = user.avatarUrl || "";
      onDoi && onDoi(user);
      veAvt();
      thoatCheDoSua();
      bao("Đã cập nhật ảnh đại diện");
    } catch (err) {
      // phiên hết hạn / token bị thu hồi (api.js đã xóa token): về đăng nhập
      if (err && (err.code === "UNAUTHENTICATED" || err.code === "TOKEN_EXPIRED")) {
        h.dong();
        navigate("/login");
        return;
      }
      bao((err && err.fields && err.fields.avatar) || (err && err.message) || "Không lưu được ảnh, vui lòng thử lại.");
    } finally {
      dangLuu = false;
      nutLuu.disabled = false;
      nutLuu.textContent = "Lưu ảnh";
    }
  }

  avt.addEventListener("click", () => file.click());
  ve.addEventListener("click", (e) => {
    const a = e.target.closest("[data-a]")?.dataset.a;
    if (a === "chon") file.click();
    else if (a === "dong") h.dong();
    else if (a === "huy") thoatCheDoSua();
    else if (a === "luu") luuAnh();
    else if (a === "vao") datZoom(s * 1.25);
    else if (a === "ra") datZoom(s / 1.25);
  });
}
