// Trang chủ: con phố (H1-H8, giống Block 8 nhưng chạy bằng JWT).
//  - Bấm nhà hàng: chưa đăng nhập -> nước sông tràn rồi sang /login; đã đăng nhập -> hộp chọn vai (chỉ là giao diện).
//  - Thuyền = đăng xuất (chỉ khi đã đăng nhập): lắc + tiếng nước + hộp hỏi lại; đồng ý -> api.auth.logout(), xóa token, về /login.
//  - Cô gái áo dài ở đầu phố (chỉ khi đã đăng nhập): bấm mở Vé hành khách (tên + ảnh đại diện, đổi ảnh).
//  - Vai trong hộp chọn vai chỉ là lựa chọn giao diện; quyền thật luôn do server quyết định (RBAC/ABAC).
import { dangXuat, getMe } from "../state.js";
import { taoPho } from "../pho.js";
import { navigate } from "../router.js";
import { $, chonVai, hop } from "../utils.js";
import { moVeHanhKhach } from "./ve-hanh-khach.js";

const veDay = (d) => `<div class="day ${d.cls}">
  <img class="nha-day" src="/img/pho/nha-ben.webp" width="2200" height="913" alt="" draggable="false" decoding="async">
  ${d.props
    .map(
      (p) =>
        `<span class="vat ${p.loai === "cay" ? "cay" + (p.dam ? " cay-dam" : "") : "xe " + p.loai + (p.gan ? " gan-le" : "")}" style="--x:${p.x}%;--lat:${p.lat}"><i class="bong"></i><img src="/img/pho/${p.anh}.webp" alt="" draggable="false" decoding="async"></span>`,
    )
    .join("")}
</div>`;

export async function load() {
  // H1: KHÔNG đăng xuất khi ra phố (bản cũ gọi api.logout() ở đây; với JWT sẽ đăng xuất mỗi lần ra phố).
  // Mất mạng thì coi như chưa đăng nhập: trang phố vẫn mở được.
  const me = await getMe().catch(() => null);
  const pho = taoPho();
  const rnd = (a, b) => a + Math.random() * (b - a);
  let lap = "";
  for (let k = 0; k < 9; k++)
    lap += `<i class="lap" style="--x:${3 + Math.floor(Math.random() * 94)}%;--b:${rnd(9.5, 25.5).toFixed(1)};--s:${9 + Math.floor(Math.random() * 9)}px;--t:${rnd(2.6, 4.8).toFixed(1)}s;--dl:-${rnd(0, 5).toFixed(1)}s"></i>`;

  return {
    title: "Cái Quán Ăn",
    am: "pho",
    html: `<main class="man canh">
  <div class="may m1"></div><div class="may m2"></div><div class="may m3"></div>
  <div class="xa xa1"></div>
  <div class="dat" aria-hidden="true">
    <div class="duong"></div>
    <div class="le-duong"></div>
    <div class="via-he"></div>
  </div>
  <div class="song" aria-hidden="true">
    <div class="song-nuoc"></div>
    <div class="song-song s1"></div><div class="song-song s2"></div>
    <div class="song-ke"></div>
  </div>
  ${
    me
      ? `<div class="thuyen bam" id="thuyen">
    <button type="button" class="thuyen-nut" id="nut-thuyen" aria-label="Đăng xuất (bấm vào thuyền)" title="Bấm vào thuyền để đăng xuất">
      <img src="/img/thuyen.webp" width="1400" height="369" alt="" draggable="false" decoding="async">
    </button>
  </div>`
      : `<div class="thuyen" aria-hidden="true">
    <img src="/img/thuyen.webp" width="1400" height="369" alt="" draggable="false" decoding="async">
  </div>`
  }
  <div id="pho" class="pho">
    ${pho.days.slice(0, 3).map(veDay).join("")}
    <button type="button" class="nha-hang" aria-label="Cái Quán Ăn - bấm để vào quán">
      <img src="/img/pho/nha-hang.webp" width="1100" height="1286" alt="Cái Quán Ăn" draggable="false" decoding="async">
    </button>
    ${pho.days.slice(3).map(veDay).join("")}
    ${
      me
        ? `<div class="cong-dn" id="cong-dn">
      <button type="button" class="co-gai-nut" id="co-gai" aria-label="Mở vé hành khách">
        <img class="co-gai" src="/img/pho/co-gai.webp" width="294" height="640" alt="" draggable="false" decoding="async">
      </button>
    </div>`
        : ""
    }
  </div>
  <div class="nang" aria-hidden="true"><i class="tia"></i><i class="tia nho"></i>${lap}</div>
  <p class="goi-y" id="goi-y">
    <svg viewBox="0 0 64 28" width="44" height="20" aria-hidden="true"><path d="M3 14h50" fill="none" stroke="currentColor" stroke-width="4" stroke-linecap="round"/><path d="M40 3l19 11-19 11" fill="none" stroke="currentColor" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/></svg>
    <span>Nhà hàng hướng này</span>
  </p>
</main>
<div class="lop" id="hop-vai" hidden>
  <form class="hop" id="form-vai">
    <h2>Bạn vào quán với vai gì?</h2>
    ${chonVai}
    <div class="nut-hang"><button type="button" class="nut nut-phu" id="de-sau">Để sau</button><button class="nut" id="vao" disabled>Vào quán</button></div>
  </form>
</div>`,
    mount: (root, c) => mount(root, c, me),
  };
}

function mount(root, ctx, me) {
  const { signal } = ctx;
  const pho = $("#pho", root);
  const goiY = $("#goi-y", root);
  const nhaHang = $(".nha-hang", root);
  let x = 0,
    v = 0,
    dn = false,
    sx = 0,
    x0 = 0,
    last = 0,
    moved = 0;
  const min = () => Math.min(0, innerWidth - pho.offsetWidth);
  // lớp xa trôi chậm; mặt đất (vỉa hè, đường) trôi cùng tốc độ với phố
  const LOP = [
    [".xa1", 0.12],
    [".via-he", 1],
    [".le-duong", 1],
    [".duong", 1],
  ].map(([s, k]) => [$(s, root), k]);

  // mũi tên "Nhà hàng hướng này": ẩn đi khi nhà hàng đã hiện trên màn hình
  const capNhatGoiY = () => {
    const r = nhaHang.getBoundingClientRect();
    const thay = r.left < innerWidth * 0.8 && r.right > innerWidth * 0.2;
    goiY.classList.toggle("an", thay);
    goiY.classList.toggle("trai", !thay && r.right <= innerWidth * 0.2);
  };
  const set = (n) => {
    x = Math.max(min(), Math.min(0, n));
    pho.style.transform = `translateX(${x}px)`;
    LOP.forEach(([e, k]) => (e.style.backgroundPositionX = x * k + "px"));
    capNhatGoiY();
  };
  set(0);
  addEventListener("resize", () => set(x), { signal });
  // ảnh trong phố tải xong -> độ rộng phố chính xác (SPA không còn sự kiện window.load cho từng màn hình)
  pho.addEventListener("load", () => set(x), { capture: true, signal });

  pho.addEventListener(
    "pointerdown",
    (e) => {
      dn = true;
      moved = 0;
      sx = last = e.clientX;
      x0 = x;
      v = 0;
      pho.classList.add("pho-dang-keo");
    },
    { signal },
  );
  addEventListener(
    "pointermove",
    (e) => {
      if (!dn) return;
      moved = Math.max(moved, Math.abs(e.clientX - sx));
      v = e.clientX - last;
      last = e.clientX;
      set(x0 + e.clientX - sx);
    },
    { signal },
  );
  addEventListener(
    "pointerup",
    () => {
      if (!dn) return;
      dn = false;
      pho.classList.remove("pho-dang-keo");
      (function quanTinh() {
        if (dn || signal.aborted || Math.abs(v) < 0.4) return;
        set(x + v);
        v *= 0.94;
        requestAnimationFrame(quanTinh);
      })();
    },
    { signal },
  );
  addEventListener("wheel", (e) => set(x - (e.deltaX || e.deltaY)), {
    passive: true,
    signal,
  });

  const hopVai = $("#hop-vai", root),
    form = $("#form-vai", root),
    vao = $("#vao", root);
  // bàn phím: mũi tên trái/phải để dạo phố
  addEventListener(
    "keydown",
    (e) => {
      if (document.querySelector(".lop:not([hidden])")) return; // đang mở hộp thoại / vé: không dạo phố
      if (e.key === "ArrowRight") set(x - 120);
      if (e.key === "ArrowLeft") set(x + 120);
      moved = 0; // để Enter/Space trên nhà hàng luôn mở được hộp chọn vai
    },
    { signal },
  );

  // bấm (không kéo) vào nhà hàng: chưa đăng nhập -> nước tràn rồi /login; đã đăng nhập -> hộp chọn vai
  pho.addEventListener(
    "click",
    (e) => {
      if (moved < 6 && e.target.closest(".nha-hang")) {
        if (!me) return navigate("/login", { fx: { type: "nuoc" } });
        hopVai.hidden = false;
        Am.phat("mo");
      }
    },
    { signal },
  );
  // ---------- thuyền = đăng xuất ----------
  // Bấm thuyền: tiếng nước + thuyền lắc, rồi hỏi lại cho chắc. Đồng ý -> gọi API đăng xuất, xóa token, về /login bằng nước tràn.
  const thuyen = $("#thuyen", root),
    nutThuyen = $("#nut-thuyen", root);
  if (nutThuyen)
    nutThuyen.addEventListener(
      "click",
      () => {
        Am.phat("nuoc");
        thuyen.classList.remove("lac");
        void thuyen.offsetWidth;
        thuyen.classList.add("lac");
        setTimeout(() => thuyen.classList.remove("lac"), 950);
        const h = hop(`<h2>Bạn có chắc muốn đăng xuất?</h2>
        <p>Bạn sẽ rời quán và cần đăng nhập lại để vào lần sau.</p>
        <div class="nut-hang nut-giua"><button type="button" class="nut nut-phu" data-a="o-lai">Ở lại</button><button type="button" class="nut" data-a="dx">Đăng xuất</button></div>`);
        h.el.querySelector('[data-a="o-lai"]').focus();
        h.el.addEventListener("click", async (e) => {
          const a = e.target.dataset.a;
          if (a === "o-lai") h.dong();
          if (a === "dx") {
            e.target.disabled = true; // tránh bấm hai lần
            h.dong();
            Am.phat("nuoc");
            await dangXuat(); // api.auth.logout() rồi xóa token + me (mất mạng vẫn đăng xuất phía client)
            navigate("/login", { fx: { type: "nuoc" }, flash: "Đã đăng xuất." });
          }
        });
      },
      { signal },
    );

  // ---------- cô gái = vé hành khách (hồ sơ + ảnh đại diện) ----------
  const coGai = $("#co-gai", root);
  if (coGai) {
    const khach = { ten: me.name || "", avt: me.avatarUrl || "" };
    coGai.addEventListener(
      "click",
      () => {
        if (moved < 6) moVeHanhKhach(khach);
      },
      { signal },
    );
  }

  form.addEventListener("change", () => (vao.disabled = false), { signal });
  $("#de-sau", root).onclick = () => (hopVai.hidden = true);

  // Vai chỉ là lựa chọn giao diện (không gửi lên server). "Đầu bếp" mở khu quản trị, nhưng quyền thật vẫn do server quyết định:
  // tài khoản viewer không có vai này nên báo và chuyển về Khách hàng.
  form.addEventListener(
    "submit",
    (e) => {
      e.preventDefault();
      const vai = new FormData(form).get("role");
      if (vai === "admin" && !["editor", "admin"].includes(me.role)) {
        const h = hop(`<h2>Vai trò không hợp lệ</h2>
        <p>Tài khoản của bạn là <b>khách hàng</b> nên không thể vào quán với vai đầu bếp. Bạn hãy chọn vai khách hàng nhé.</p>
        <div class="nut-hang nut-giua"><button type="button" class="nut" data-a="ok">Đã hiểu</button></div>`);
        const nut = h.el.querySelector('[data-a="ok"]');
        nut.focus();
        nut.addEventListener("click", () => {
          h.dong();
          form.querySelector('input[value="user"]').checked = true;
        });
        return;
      }
      hopVai.hidden = true;
      navigate(vai === "admin" ? "/admin/dishes" : "/khach", { fx: { type: "canh", huong: "len" } });
    },
    { signal },
  );
}
