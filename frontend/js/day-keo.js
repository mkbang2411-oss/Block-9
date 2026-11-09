// Dây rèm: thả từ mép trên màn hình. Kéo dây xuống (hoặc bấm / Enter / Space) thì sidebar giấy ghi món (sắp xếp, bộ lọc,
// cách hiển thị danh sách) trượt ra bên trái, phần còn lại của trang mờ đi (blur). Bấm ra ngoài, bấm "Xong", Esc,
// hoặc kéo / bấm lại dây thì sidebar đóng.
//
// Chỉ là LỚP GIAO DIỆN: không biết gì về tìm kiếm, lọc, sắp xếp hay API. Chọn chế độ hiển thị thì gọi onChange(view);
// phần còn lại (giữ q / filter / sort, nạp lại dữ liệu) do pages/listing.js làm.
// Truy cập: dây là <button> (Tab tới được, Enter/Space mở), Esc đóng, nội dung sidebar bị khóa (inert) khi đang đóng,
// và khi người dùng chọn "giảm chuyển động" thì không có hiệu ứng đung đưa / trượt (xem CSS .keo, .ben).
import { esc } from "./utils.js";
import { VIEWS } from "./list-config.js";

const BIEU_TUONG = { pagination: "1 2 3", more: "＋", infinite: "∞" };
const NGUONG_KEO = 22; // kéo dây xuống quá ngần này (px) thì tính là "đã kéo"
const KEO_TOI_DA = 56; // dây chỉ giãn được tối đa ngần này (px)
const DANG_MO = 12; // khi sidebar đang mở, dây tụt xuống nhẹ cho thấy "đã kéo"

// khối chọn cách hiển thị danh sách (nằm trong sidebar); view = chế độ đang dùng
export function htmlCheDo(view) {
  return `<div class="ben-che-do" role="group" aria-label="Cách hiển thị danh sách">${VIEWS.map(
    ([
      k,
      ten,
      mota,
    ]) => `<button type="button" class="chon-che-do" data-view="${k}" aria-pressed="${k === view}">
      <span class="cd-bieu" aria-hidden="true">${esc(BIEU_TUONG[k])}</span>
      <span class="cd-chu"><b>${esc(ten)}</b><small>${esc(mota)}</small></span></button>`,
  ).join("")}</div>`;
}

const tiengGiay = (loai) => window.Am && window.Am.phat(loai);

// view: chế độ đang dùng; onChange(view): người dùng chọn chế độ mới; signal: gỡ dây khi rời màn hình
// ben: <aside> sidebar; lop: lớp mờ phủ phần còn lại của trang (cả hai nằm trong trang, do listing.js vẽ)
export function ganDayKeo({ view, onChange, signal, ben, lop }) {
  const el = document.createElement("div");
  el.className = "keo";
  el.innerHTML = `<div class="day-keo">
    <button type="button" class="nut-keo" aria-label="Kéo dây rèm để mở bảng sắp xếp và bộ lọc" aria-expanded="false" aria-controls="ben"></button>
  </div>`;
  document.body.append(el);
  signal.addEventListener("abort", () => el.remove());

  const nut = el.querySelector(".nut-keo");
  const cacNut = [...ben.querySelectorAll(".chon-che-do")];
  let mo = false;
  let y = 0; // độ giãn hiện tại của dây (px)
  let keo = null; // trạng thái đang kéo

  const dat = (v) => {
    y = Math.max(0, Math.min(KEO_TOI_DA, v));
    el.style.setProperty("--y", y + "px");
  };
  const capNhatNhan = (v) => {
    cacNut.forEach((b) =>
      b.setAttribute("aria-pressed", String(b.dataset.view === v)),
    );
    const ten = VIEWS.find(([k]) => k === v)[1];
    nut.title = "Kéo dây để mở bảng sắp xếp & bộ lọc (đang xem: " + ten + ")";
  };
  function moDong(m, { focus = true, tieng = true } = {}) {
    if (m === mo) return dat(m ? DANG_MO : 0);
    mo = m;
    el.classList.toggle("mo", m);
    ben.classList.toggle("hien", m);
    lop.classList.toggle("hien", m);
    ben.inert = !m;
    nut.setAttribute("aria-expanded", String(m));
    dat(m ? DANG_MO : 0);
    if (tieng) tiengGiay(m ? "giayMo" : "giayDong");
    if (focus) {
      if (m)
        (ben.querySelector(".chon-nut, input, button") || ben).focus({
          preventScroll: true,
        });
      else nut.focus({ preventScroll: true });
    }
  }

  // kéo dây: dây giãn theo ngón tay / chuột (có lực cản), thả ra quá ngưỡng thì mở / đóng sidebar rồi dây tự co về
  nut.addEventListener(
    "pointerdown",
    (e) => {
      if (e.button !== 0) return;
      keo = { sy: e.clientY, y0: y, daKeo: false };
      nut.setPointerCapture(e.pointerId);
      el.classList.add("dang-keo");
    },
    { signal },
  );
  nut.addEventListener(
    "pointermove",
    (e) => {
      if (!keo) return;
      const dy = e.clientY - keo.sy;
      if (Math.abs(dy) > 5) keo.daKeo = true;
      if (keo.daKeo) dat(keo.y0 + dy * 0.7);
    },
    { signal },
  );
  const tha = (e) => {
    if (!keo) return;
    const k = keo;
    keo = null;
    el.classList.remove("dang-keo");
    if (e.type === "pointercancel") return dat(mo ? DANG_MO : 0);
    if (!k.daKeo) return; // bấm / phím: để sự kiện click bên dưới xử lý
    nut.dataset.vuaKeo = "1"; // chặn click sinh ra sau khi thả chuột
    setTimeout(() => delete nut.dataset.vuaKeo, 0);
    if (y - k.y0 > NGUONG_KEO) moDong(!mo, { focus: false });
    else dat(mo ? DANG_MO : 0);
  };
  nut.addEventListener("pointerup", tha, { signal });
  nut.addEventListener("pointercancel", tha, { signal });
  nut.addEventListener(
    "click",
    () => {
      if (nut.dataset.vuaKeo) return;
      moDong(!mo);
    },
    { signal },
  );

  // chọn chế độ hiển thị (sidebar vẫn mở để chỉnh tiếp) + nút đóng / "Xong"
  ben.addEventListener(
    "click",
    (e) => {
      if (e.target.closest('[data-a="dong-ben"]')) return moDong(false);
      const b = e.target.closest(".chon-che-do");
      if (!b) return;
      const v = b.dataset.view;
      capNhatNhan(v);
      onChange(v);
    },
    { signal },
  );

  // đóng: bấm ra ngoài (lớp mờ), Esc
  lop.addEventListener("click", () => mo && moDong(false, { focus: false }), {
    signal,
  });
  document.addEventListener(
    "keydown",
    (e) => {
      if (e.key === "Escape" && mo && !ben.querySelector(".chon.mo"))
        moDong(false);
    },
    { signal },
  );

  capNhatNhan(view);
  return {
    dat: capNhatNhan,
    dong: () => moDong(false, { focus: false, tieng: false }),
  };
}
