// Bàn tròn chọn món: dữ liệu lấy từ GET /api/dishes?all=true
import { api } from "../api.js";
import { getMe } from "../state.js";
import { $, bao, esc, hop, vnd, dishIcon } from "../utils.js";
import { quayLai } from "../list-config.js";

// Hàng chờ chỉ lưu tạm trong bộ nhớ của trình duyệt (DB chưa có bảng đơn hàng).
// Để ngoài hàm nên đi sang trang khác rồi quay lại vẫn còn.
const hang = new Map(); // id món -> { m, sl, cho }

export async function load() {
  const [{ data }, me] = await Promise.all([
    api.list("dishes", { all: true }),
    getMe().catch(() => null), // trang công khai: lỗi mạng khi hỏi /auth/me không được chặn việc xem thực đơn
  ]);
  // chỉ giữ những trường cần để vẽ vòng món
  const mon = data.map((d) => ({
    id: d.id,
    ten: d.name,
    gia: Number(d.price),
    icon: dishIcon(d),
    anh: d.imageUrl || "", // URL ảnh (rỗng = dùng emoji)
    moTa: d.description || "",
    loai: d.category,
    conBan: d.available,
    dauBep: d.chef ? d.chef.name : "",
    nguyenLieu: (d.ingredients || []).map((i) => ({
      ten: i.name,
      donVi: i.unit,
    })),
  }));

  const bui = Array.from(
    { length: 16 },
    () =>
      `<i class="bui" style="--x:${Math.floor(Math.random() * 90)}%;--y:${Math.floor(Math.random() * 85)}%;--s:${2 + Math.floor(Math.random() * 4)}px;--t:${6 + Math.floor(Math.random() * 6)}s;--dl:-${Math.floor(Math.random() * 10)}s"></i>`,
  ).join("");
  const tia = [
    [4, 7],
    [20, 10],
    [38, 6],
    [56, 9],
  ]
    .map(
      (t, k) =>
        `<i class="tia" style="--l:${t[0]}%;--w:${t[1]}vw;--dl:-${k * 2}s"></i>`,
    )
    .join("");

  return {
    title: "Quán Ba Cô Gái - Thực đơn",
    am: "khach",
    html: `<main class="man khach vao-tu-duoi">
  <div class="goc">
    <a class="nut nut-phu" href="/">Ra phố</a>
    <span class="goc-phai">
      <a class="nut nut-phu" href="${esc(quayLai("/dishes", { giu: true }))}">Danh sách &amp; tìm món</a>
      ${me ? `<a class="nut nut-phu" href="/account/security">Bảo mật</a>` : `<a class="nut nut-phu" href="/login">Đăng nhập</a>`}
      <button class="nut" id="nut-hang">Hàng chờ (0)</button>
    </span>
  </div>
  ${
    !mon.length
      ? `<div class="trong"><div class="hop"><h2>Quán chưa có món</h2><p>Đầu bếp chưa thêm món nào vào thực đơn.</p></div></div>`
      : `<div class="ban"><div class="ghe-vong">${[-2, -1, 0, 1, 2]
          .map((k) => k * GOC_MON)
          .map(
            (a) =>
              `<i class="ghe" style="transform:rotate(${a}deg) translateY(-99vh)"></i>`,
          )
          .join(
            "",
          )}</div><div class="mat"><div class="vong" id="vong"></div></div></div>`
  }
  <div class="nang" aria-hidden="true">${tia}${bui}</div>
  ${mon.length > 1 ? `<button class="nut mui-ten trai" id="trai" aria-label="Món trước">‹</button><button class="nut mui-ten phai" id="phai" aria-label="Món sau">›</button>` : ""}
</main>`,
    mount: (root, ctx) => mount(root, ctx, mon),
  };
}

// góc giữa 2 món / 2 ghế (độ). Càng lớn các đĩa càng thưa; bán kính vòng R (trong mount) giữ nguyên
const GOC_MON = 32;

function mount(root, ctx, MON) {
  const { signal } = ctx;
  const N = MON.length;
  const nutHang = $("#nut-hang", root);
  const capNhat = () =>
    (nutHang.textContent = `Hàng chờ (${[...hang.values()].reduce((s, c) => s + c.sl, 0)})`);
  capNhat();
  if (!N) return; // chưa có món nào trong DB

  // Chỉ vẽ một "cửa sổ" 5 món quanh món đang chọn (khớp 5 ghế); phần dữ liệu còn lại (cả nghìn món) vẫn nằm trong MON.
  // Bấm mũi tên: cửa sổ trượt 1 món -> hiện thêm 1 món ở đầu này, món ở đầu kia ẩn đi (đi hết vòng thì quay lại món đầu).
  // Mỗi món có chỉ số tuyệt đối k (có thể âm hoặc > N), món thật là MON[k mod N]; nhờ vậy vòng xoay liên tục không bị giật.
  const A = GOC_MON, // góc giữa 2 món (độ) = góc giữa 2 ghế
    R = 64; // bán kính vòng món (vh)
  const SO_HIEN = Math.min(N, 5);
  const DAU = -Math.floor((SO_HIEN - 1) / 2); // vị trí đầu của cửa sổ so với món giữa: 5 món -> -2..+2
  const DEM = N >= 7 ? 1 : 0; // thêm 1 món ẩn mỗi đầu để món trượt vào / ra có hiệu ứng mờ dần
  const TU = DAU - DEM,
    DEN = DAU + SO_HIEN - 1 + DEM;
  const mod = (a, n) => ((a % n) + n) % n;
  const vong = $("#vong", root);
  const nodes = new Map(); // k -> phần tử nút món
  let idx = 0;

  function taoNode(k, eager) {
    const x = MON[mod(k, N)];
    const b = document.createElement("button");
    b.dataset.k = k;
    b.innerHTML = `<span class="dia">${x.anh ? `<img class="anh-dia" src="${esc(x.anh)}" alt="${esc(x.ten)}" loading="${eager ? "eager" : "lazy"}" decoding="async">` : `<em>${esc(x.icon)}</em>`}</span><b>${esc(x.ten)}</b>`;
    return b;
  }
  const dat = (el, k, rg) =>
    (el.style.transform = `rotate(${k * A}deg) translateY(-${R}vh) rotate(${-(rg + k * A)}deg) translate(-50%,-50%)`);
  const lop = (k, d) => {
    const x = MON[mod(k, N)];
    return (
      "mon d" + (Math.abs(d) > 2 ? 3 : Math.abs(d)) + (x.conBan ? "" : " het")
    );
  };

  function cap() {
    const rg = -idx * A;
    vong.style.transform = `rotate(${rg}deg)`;
    const moi = [];
    for (let d = TU; d <= DEN; d++) {
      const k = idx + d;
      let el = nodes.get(k);
      if (!el) {
        el = taoNode(k, Math.abs(d) <= 2);
        el.className = lop(k, 99); // vào cảnh ở trạng thái ẩn rồi mới hiện ra
        dat(el, k, rg);
        vong.append(el);
        nodes.set(k, el);
        moi.push([el, k, d]);
      } else {
        dat(el, k, rg);
        el.className = lop(k, d);
      }
      el.inert = Math.abs(d) > 2;
    }
    // món rời khỏi cửa sổ: trượt ra rồi mờ đi, xong thì gỡ khỏi trang
    for (const [k, el] of nodes) {
      if (k >= idx + TU && k <= idx + DEN) continue;
      nodes.delete(k);
      dat(el, k, rg);
      el.className = lop(k, 99);
      el.inert = true;
      setTimeout(() => el.remove(), 900);
    }
    if (moi.length) {
      void vong.offsetWidth; // ép trình duyệt vẽ trạng thái ẩn trước khi đổi sang trạng thái hiện
      for (const [el, k, d] of moi) el.className = lop(k, d);
    }
  }
  const xoay = (k) => {
    if (N < 2) return;
    idx += k;
    cap();
    Am.phat("xoay");
  };
  const trai = $("#trai", root),
    phai = $("#phai", root);
  if (trai) trai.onclick = () => xoay(-1);
  if (phai) phai.onclick = () => xoay(1);
  addEventListener(
    "keydown",
    (e) => {
      if (e.key === "ArrowLeft") xoay(-1);
      if (e.key === "ArrowRight") xoay(1);
    },
    { signal },
  );

  vong.addEventListener(
    "click",
    (e) => {
      const el = e.target.closest(".mon");
      if (!el) return;
      const k = +el.dataset.k,
        d = k - idx;
      if (d === 0) moMon(MON[mod(k, N)]);
      else xoay(d); // bấm món bên cạnh -> xoay tới món đó
    },
    { signal },
  );

  function moMon(m) {
    const cho = Math.floor(Math.random() * 4) + 2; // 2-5 phút
    const nl = m.nguyenLieu.map((n) => esc(n.ten)).join(", ");
    const nut = m.conBan
      ? `<button class="nut nut-phu" data-a="hang">Thêm vào giỏ hàng</button><button class="nut" data-a="ngay">Đặt ngay</button>`
      : `<button class="nut" data-a="dong">Đóng</button>`;
    const h =
      hop(`<div class="anh-mon to">${m.anh ? `<img src="${esc(m.anh)}" alt="${esc(m.ten)}">` : esc(m.icon)}</div><h2>${esc(m.ten)}</h2>
      <p class="gia">${vnd(m.gia)}</p>
      ${m.moTa ? `<p>${esc(m.moTa)}</p>` : ""}
      <p class="phu-chu-nho">${esc(m.loai)}${m.dauBep ? " · Đầu bếp " + esc(m.dauBep) : ""}</p>
      ${nl ? `<p class="phu-chu-nho">Nguyên liệu: ${nl}</p>` : ""}
      ${m.conBan ? `<p>Dự kiến chờ khoảng <b>${cho} phút</b></p>` : `<p><b>Món này hiện đã hết.</b></p>`}
      <div class="nut-hang hang-mon"><a class="nut nut-phu" href="/dishes/${esc(m.id)}">Chi tiết</a>${nut}</div>`);
    h.el.addEventListener("click", (e) => {
      const a = e.target.dataset.a;
      if (a === "dong") h.dong();
      if (a === "ngay") {
        Am.phat("ding");
        bao(`Đã gửi món ${m.ten}, chờ khoảng ${cho} phút`);
        h.dong();
      }
      if (a === "hang") {
        const c = hang.get(m.id) || { m, sl: 0, cho };
        c.sl++;
        c.cho = Math.max(c.cho, cho);
        hang.set(m.id, c);
        capNhat();
        Am.phat("them");
        bao(`Đã thêm ${m.ten} vào hàng chờ`);
        h.dong();
      }
    });
  }

  nutHang.onclick = () => {
    const ds = [...hang.values()];
    if (!ds.length) return bao("Hàng chờ đang trống");
    const tong = ds.reduce((s, c) => s + c.sl * c.m.gia, 0);
    const h =
      hop(`<h2>Hàng chờ</h2>${ds.map((c) => `<div class="dong-hang"><span>${esc(c.m.ten)} × ${c.sl}</span><span>${vnd(c.sl * c.m.gia)}</span><button class="xoa-nl" data-x="${esc(c.m.id)}" aria-label="Bỏ món">×</button></div>`).join("")}
      <p class="gia" style="margin-top:12px">Tổng: ${vnd(tong)}</p>
      <div class="nut-hang"><button class="nut nut-phu" data-a="dong">Đóng</button><button class="nut" data-a="dat">Đặt tất cả</button></div>`);
    h.el.addEventListener("click", (e) => {
      if (e.target.dataset.x) {
        hang.delete(+e.target.dataset.x);
        capNhat();
        h.dong();
        nutHang.click();
      }
      if (e.target.dataset.a === "dong") h.dong();
      if (e.target.dataset.a === "dat") {
        Am.phat("ding");
        bao(
          `Đã gửi ${ds.length} món, món lâu nhất khoảng ${Math.max(...ds.map((c) => c.cho))} phút`,
        );
        hang.clear();
        capNhat();
        h.dong();
      }
    });
  };
  cap();
}
