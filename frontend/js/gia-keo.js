// Thanh kéo khoảng giá: 2 núm (giá từ / giá đến) trên 7 mốc.
//
//   0đ ─●────────────────────────────────●  mốc:  100.000 · 200.000 · 500.000 · 1.000.000 · 2.000.000 · 5.000.000 · Trên 10.000.000
//
// - Núm trái ở đầu thanh (0đ)  = không giới hạn dưới.  Núm phải ở mốc cuối = "Trên 10.000.000" = không giới hạn trên.
// - Đặt 2 núm ở 2 mốc bất kỳ thì ra các món có giá nằm giữa 2 mốc đó (gồm cả hai đầu mốc).
// - Kéo mượt: núm đi theo ngón tay / chuột theo từng pixel, khi buông thì hút về mốc gần nhất. Kết quả lọc đổi ngay khi núm
//   đi qua mốc mới (listing.js tự gom 300ms rồi mới hỏi server).
// - Nhãn dưới thanh là dạng RÚT GỌN (100k · 200k · 500k · 1tr · 2tr · 5tr · 10tr+) vì thanh nằm trong sidebar hẹp, ghi đủ số thì 7 mốc dính vào nhau.
//   Số đầy đủ vẫn hiện ở ô giá phía trên thanh và đọc được qua aria-valuetext / title; mốc đang được núm chỉ vào thì in đậm + đổi màu.
// - Giá trị trả ra là SỐ ĐẦY ĐỦ ("100000", không phải "100"); "" = không giới hạn. Dùng được bằng bàn phím (← → Home End).
import { MOC_GIA } from "./list-config.js";
import { esc } from "./utils.js";

const N = MOC_GIA.length; // 7 mốc -> vị trí 0 (đầu thanh) .. 7 (mốc cuối)
const so = (n) => n.toLocaleString("vi-VN");
const NHAN = MOC_GIA.map((g, i) => (i === N - 1 ? "Trên " + so(g) : so(g)));
// 100000 -> "100k", 1000000 -> "1tr", 2500000 -> "2,5tr"; mốc cuối thêm "+" (trên mốc này = không giới hạn)
const ngan = (g, i) =>
  (g >= 1e6 ? String(g / 1e6).replace(".", ",") + "tr" : g / 1e3 + "k") +
  (i === N - 1 ? "+" : "");
const NHAN_NGAN = MOC_GIA.map(ngan);

// vị trí núm (0..N) <-> giá trị lọc
const viTriTu = (v) => {
  if (v === "" || v == null) return null;
  let best = 0;
  MOC_GIA.forEach(
    (g, i) =>
      Math.abs(g - Number(v)) < Math.abs(MOC_GIA[best] - Number(v)) &&
      (best = i),
  );
  return best + 1;
};
const giaTu = (p, dau) => (p === (dau ? 0 : N) ? "" : String(MOC_GIA[p - 1]));

export const chuGia = (min, max) => {
  const a = viTriTu(min) ?? 0,
    b = viTriTu(max) ?? N;
  if (a === 0 && b === N) return "Mọi mức giá";
  if (a === N) return "Trên " + so(MOC_GIA[N - 1]) + "đ";
  if (a === 0) return "Đến " + so(MOC_GIA[b - 1]) + "đ";
  if (b === N) return "Từ " + so(MOC_GIA[a - 1]) + "đ trở lên";
  return so(MOC_GIA[a - 1]) + "đ – " + so(MOC_GIA[b - 1]) + "đ";
};

export function htmlGia(min, max) {
  const a = viTriTu(min) ?? 0,
    b = viTriTu(max) ?? N;
  const x = (p) => ((p / N) * 100).toFixed(3) + "%";
  return `<div class="gk" data-gk>
  <div class="gk-dau"><b data-gk-chu>${chuGia(min, max)}</b></div>
  <span class="gk-ten">Khoảng giá</span>
  <div class="gk-rail" data-gk-rail>
    <div class="gk-vet"></div>
    <div class="gk-day" data-gk-day></div>
    ${Array.from({ length: N + 1 }, (_, p) => `<i class="gk-moc" style="left:${x(p)}"></i>`).join("")}
    <button type="button" class="gk-num" data-gk-num="0" role="slider" aria-label="Giá từ" aria-orientation="horizontal" style="left:${x(a)}"></button>
    <button type="button" class="gk-num" data-gk-num="1" role="slider" aria-label="Giá đến" aria-orientation="horizontal" style="left:${x(b)}"></button>
  </div>
  <div class="gk-nhan" aria-hidden="true">
    ${NHAN_NGAN.map((t, i) => `<span data-gk-nhan="${i + 1}" style="left:${x(i + 1)}" title="${esc(NHAN[i])}đ">${t}</span>`).join("")}
  </div>
</div>`;
}

// root: vùng chứa .gk | onChange({ min, max }) (chuỗi, "" = không giới hạn) | trả về { dat(min, max) } để đặt lại bằng code (không gọi onChange)
export function ganGia(root, signal, onChange) {
  const el = root.querySelector("[data-gk]");
  if (!el) return { dat() {} };
  const rail = el.querySelector("[data-gk-rail]");
  const day = el.querySelector("[data-gk-day]");
  const chu = el.querySelector("[data-gk-chu]");
  const nums = [...el.querySelectorAll("[data-gk-num]")];
  const nhan = [...el.querySelectorAll("[data-gk-nhan]")];
  const pos = [0, N]; // vị trí hiện tại (số thực lúc đang kéo, số nguyên khi đứng yên)
  let keo = -1; // chỉ số núm đang kéo (-1: không kéo)
  let gan = [0, N]; // vị trí đã chốt (làm tròn) gần nhất đã báo ra ngoài

  const kep = (i, v) => {
    // 2 núm không vượt nhau: núm trái <= núm phải - 1 (trừ khi cả hai ở mốc cuối: "trên 10 triệu")
    if (i === 0) return Math.max(0, Math.min(v, pos[1] === N ? N : pos[1] - 1));
    return Math.min(N, Math.max(v, pos[0] === N ? N : pos[0] + 1));
  };
  function ve() {
    nums.forEach((n, i) => {
      const r = Math.round(pos[i]);
      n.style.left = (pos[i] / N) * 100 + "%";
      n.setAttribute("aria-valuemin", i ? 1 : 0);
      n.setAttribute("aria-valuemax", N);
      n.setAttribute("aria-valuenow", r);
      n.setAttribute(
        "aria-valuetext",
        i === 0
          ? r === 0
            ? "0đ"
            : so(MOC_GIA[r - 1]) + "đ"
          : r === N
            ? NHAN[N - 1] + "đ"
            : so(MOC_GIA[r - 1]) + "đ",
      );
    });
    // núm nào nằm trên cùng: khi hai núm chồng nhau ở mốc cuối thì núm trái phải kéo được sang trái
    nums[0].style.zIndex = pos[0] >= N - 0.5 ? 3 : 2;
    day.style.left = (pos[0] / N) * 100 + "%";
    day.style.right = (1 - pos[1] / N) * 100 + "%";
    const a = giaTu(Math.round(pos[0]), true),
      b = giaTu(Math.round(pos[1]), false);
    chu.textContent = chuGia(a, b);
    // nhãn mốc: đang được núm chỉ vào = đậm đỏ, nằm giữa hai núm = đậm vừa, còn lại mờ
    const lo = Math.round(pos[0]),
      hi = Math.round(pos[1]);
    nhan.forEach((t, i) => {
      const m = i + 1;
      t.classList.toggle("nut-dang", m === lo || m === hi);
      t.classList.toggle("trong", m > lo && m < hi);
    });
  }
  function baoNeuDoi() {
    const r = [Math.round(pos[0]), Math.round(pos[1])];
    if (r[0] === gan[0] && r[1] === gan[1]) return;
    gan = r;
    onChange({ min: giaTu(r[0], true), max: giaTu(r[1], false) });
  }

  const tuToaDo = (clientX) => {
    const b = rail.getBoundingClientRect();
    return Math.max(0, Math.min(N, ((clientX - b.left) / b.width) * N));
  };
  rail.addEventListener(
    "pointerdown",
    (e) => {
      if (e.button !== 0) return;
      const f = tuToaDo(e.clientX);
      // chọn núm gần nhất; hai núm chồng nhau thì theo hướng kéo: bên trái -> núm trái, bên phải -> núm phải
      const dTrai = Math.abs(f - pos[0]),
        dPhai = Math.abs(f - pos[1]);
      keo = e.target.closest("[data-gk-num]")
        ? +e.target.closest("[data-gk-num]").dataset.gkNum
        : dTrai < dPhai || (dTrai === dPhai && f < pos[0])
          ? 0
          : 1;
      el.classList.add("dang-keo");
      rail.setPointerCapture(e.pointerId);
      nums[keo].focus({ preventScroll: true });
      pos[keo] = kep(keo, f);
      ve();
      baoNeuDoi();
      e.preventDefault();
    },
    { signal },
  );
  rail.addEventListener(
    "pointermove",
    (e) => {
      if (keo < 0) return;
      pos[keo] = kep(keo, tuToaDo(e.clientX));
      ve();
      baoNeuDoi();
    },
    { signal },
  );
  const tha = () => {
    if (keo < 0) return;
    pos[keo] = Math.round(pos[keo]); // hút về mốc gần nhất (CSS có transition nên trượt mượt)
    keo = -1;
    el.classList.remove("dang-keo");
    ve();
    baoNeuDoi();
  };
  rail.addEventListener("pointerup", tha, { signal });
  rail.addEventListener("pointercancel", tha, { signal });

  el.addEventListener(
    "keydown",
    (e) => {
      const n = e.target.closest("[data-gk-num]");
      if (!n) return;
      const i = +n.dataset.gkNum;
      const cur = Math.round(pos[i]);
      const to = {
        ArrowLeft: cur - 1,
        ArrowDown: cur - 1,
        ArrowRight: cur + 1,
        ArrowUp: cur + 1,
        Home: 0,
        End: N,
      }[e.key];
      if (to === undefined) return;
      e.preventDefault();
      pos[i] = kep(i, to);
      ve();
      baoNeuDoi();
    },
    { signal },
  );

  ve();
  return {
    dat(min, max) {
      pos[0] = viTriTu(min) ?? 0;
      pos[1] = viTriTu(max) ?? N;
      gan = [pos[0], pos[1]];
      ve();
    },
  };
}
