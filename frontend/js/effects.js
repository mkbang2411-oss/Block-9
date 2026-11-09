// Hiệu ứng chuyển cảnh. Trước đây trang cũ chạy hiệu ứng rồi TẢI TRANG MỚI (nhớ hướng qua sessionStorage);
// SPA không tải lại trang nên làm gọn hơn: phủ màn hình -> đổi màn hình -> hiệu ứng trượt đi.
//   fx = { type: "canh", huong: "len" | "xuong" }   cành cây (vào quán = len, ra phố = xuong)
//   fx = { type: "dia",  huong: "phai" | "trai" }   đĩa trắng (tiến tới = phai, quay lại = trai)
//   fx = { type: "nuoc" }                              nước sông tràn từ đáy lên (đăng xuất, bấm nhà hàng khi chưa đăng nhập, "Trang chủ" từ cảnh đêm /login)
const SAC_LA = ["#5d9a52", "#7db35f", "#3f7d46", "#c9a43a"];
const ITT = (ms) => new Promise((r) => setTimeout(r, ms));
const giamHieuUng = () =>
  matchMedia("(prefers-reduced-motion: reduce)").matches;

// Lá bay; burst = bung ra khi chuyển cảnh (từ bên phải, hoặc bên trái nếu trai = true)
export function thaLa(n = 1, burst = false, trai = false) {
  for (let i = 0; i < n; i++) {
    const l = document.createElement("i");
    const s = 9 + Math.random() * 11;
    const x = trai ? Math.random() * 45 : 55 + Math.random() * 45;
    l.className = "la";
    l.style.cssText =
      `left:${burst ? x : Math.random() * 100}vw;` +
      (burst ? `top:${Math.random() * 60}vh;` : "") +
      `width:${s}px;height:${s}px;--dx:${(Math.random() - 0.5) * 180}px;` +
      `--t:${burst ? 2.5 + Math.random() * 2 : 7 + Math.random() * 6}s;--c:${SAC_LA[i % 4]}`;
    l.onanimationend = () => l.remove();
    document.body.append(l);
  }
}

// ---------- chọn hiệu ứng theo đường dẫn đi / đến (giữ đúng quy tắc của bản cũ) ----------
const TRONG = /^\/(dishes|admin)(\/|$)/;
export function chonFx(tu, den, linkEl) {
  if (giamHieuUng()) return null;
  // ra phố: từ màn hình đăng nhập / đăng ký / quên mật khẩu / MFA (cảnh ban đêm .dn) thì nước sông tràn lên như Block 8;
  // các trang khác (danh sách món, quản trị...) vẫn là cành cây
  if (den === "/") return linkEl && linkEl.closest(".dn") ? { type: "nuoc" } : { type: "canh", huong: "xuong" };
  if (!/^\/(dishes|khach|admin)(\/|$)/.test(den)) return null;
  // đang ở danh sách món / quản trị mà sang trang món / quản trị khác (tab, xem chi tiết, thêm, hủy...) -> không hiệu ứng
  if (TRONG.test(tu) && TRONG.test(den)) return null;
  const quayLai =
    linkEl && /^\s*(Hủy|Quay lại|Danh sách món)/.test(linkEl.textContent);
  return { type: "dia", huong: quayLai ? "trai" : "phai" };
}

// ---------- pha 1: phủ kín màn hình (trang cũ còn nguyên phía sau) ----------
export async function phuMan(fx) {
  if (!fx) return null;
  if (fx.type === "nuoc") {
    // người dùng tắt hiệu ứng: đi thẳng (CSS cũng ẩn .nuoc-tran khi reduced-motion)
    if (giamHieuUng()) return null;
    document.querySelectorAll(".nuoc-tran").forEach((x) => x.remove());
    // cảnh đêm (.dn) có hàng chục phần tử đang chạy animation: tạm dừng chúng trong lúc nước dâng/rút, nếu không khung hình
    // đầu của lớp nước bị trễ (máy yếu, render phần mềm) và người dùng không thấy nước dâng (xem CSS .dang-nuoc)
    document.body.classList.add("dang-nuoc");
    const n = document.createElement("div");
    n.className = "nuoc-tran";
    n.setAttribute("aria-hidden", "true");
    document.body.append(n);
    Am.phat("vut");
    // chờ nước dâng KÍN màn hình (CSS .nuoc-tran: 0.62s) rồi mới đổi màn hình. Chờ theo animation thật chứ không đếm 620ms cố định,
    // vì máy yếu có thể bắt đầu animation trễ -> đổi màn hình khi nước chưa phủ kín sẽ thấy giật. Tối đa 2 giây để không treo.
    const dang = n.getAnimations().find((a) => a.animationName === "nuoc-len");
    await Promise.race([dang ? dang.finished.catch(() => {}) : ITT(620), ITT(2000)]);
    return { fx, n };
  }
  if (fx.type === "canh") {
    const v = document.createElement("div");
    v.className = "canh-cay " + fx.huong;
    const v2 = document.createElement("div"); // cành phụ từ phía đối diện
    v2.className = "canh-cay phu " + fx.huong;
    document.body.append(v2, v);
    document.body.classList.add(fx.huong === "xuong" ? "di-xuong" : "di-len");
    Am.phat("vut");
    thaLa(40, true, fx.huong === "xuong");
    await ITT(850); // ~ thời gian cành bay vào (CSS .canh-cay: 0.8s)
    return { fx, v, v2 };
  }
  // ---- đĩa trắng ----
  const W = innerWidth,
    H = innerHeight,
    p = Math.max(H * 0.2, W / 9), // bước lưới; đĩa to 1.0–1.3 bước nên phủ kín không hở
    cols = Math.ceil(W / p) + 1,
    rows = Math.ceil(H / p) + 1,
    ds = [],
    tu = fx.huong === "trai" ? -1 : 1; // 1: đĩa bay vào từ phải, -1: từ trái
  for (let c = 0; c < cols; c++)
    for (let r = 0; r < rows; r++) {
      const s = p * (1.05 + Math.random() * 0.3);
      ds.push({
        c,
        x: Math.round(c * p - s / 2 + (Math.random() - 0.5) * p * 0.1),
        y: Math.round(r * p - s / 2 + (Math.random() - 0.5) * p * 0.1),
        s: Math.round(s),
        r: Math.round((Math.random() - 0.5) * 50),
        v: Math.random() < 0.45 ? 1 : 0,
      });
    }
  const lop = document.createElement("div");
  lop.className = "dq-lop";
  ds.forEach((d) => {
    const e = document.createElement("i");
    e.className = "dq" + (d.v ? " vuong" : "");
    e.style.cssText = `left:${d.x}px;top:${d.y}px;width:${d.s}px;height:${d.s}px;transform:rotate(${d.r}deg)`;
    lop.append(e);
  });
  document.body.append(lop);
  Am.phat("vut");
  [...lop.children].forEach((e, i) => {
    const c = tu > 0 ? cols - ds[i].c : ds[i].c + 1; // cột đi đầu bay vào trước
    e.animate(
      [
        {
          transform: `translateX(${tu * (W + 200)}px) ${e.style.transform}`,
          opacity: 1,
        },
        { transform: e.style.transform, opacity: 1 },
      ],
      {
        duration: 520,
        delay: c * 45 + Math.random() * 140,
        easing: "cubic-bezier(.2,.7,.2,1)",
        fill: "backwards",
      },
    );
  });
  await ITT(cols * 45 + 700);
  return { fx, lop, ds, tu, cols };
}

// ---------- pha 2: gọi NGAY SAU KHI đã đổi màn hình, để hiệu ứng trượt đi lộ ra màn hình mới ----------
export function moMan(h) {
  if (!h) return;
  if (h.fx.type === "nuoc") {
    // màn hình mới phủ sẵn nước (html[data-nuoc]::before) rồi cho nước rút xuống; gỡ lớp nước cũ cùng lúc để nối liền
    document.documentElement.setAttribute("data-nuoc", "1");
    h.n.remove();
    setTimeout(() => {
      document.documentElement.removeAttribute("data-nuoc");
      document.body.classList.remove("dang-nuoc");
    }, 800);
    return;
  }
  if (h.fx.type === "canh") {
    // màn hình mới tự chạy animation "canh-ra" nhờ html[data-vao] (xem CSS); gỡ cành phủ cũ cùng lúc để nối liền
    document.documentElement.setAttribute("data-vao", h.fx.huong);
    h.v.remove();
    h.v2.remove();
    document.body.classList.remove("di-len", "di-xuong");
    setTimeout(
      () => document.documentElement.removeAttribute("data-vao"),
      1000,
    );
    return;
  }
  const { lop, ds, tu, cols } = h;
  const W = innerWidth;
  let xong = 0;
  [...lop.children].forEach((e, i) => {
    const c = tu > 0 ? ds[i].c : cols - 1 - ds[i].c; // đĩa phía trước hướng đi rời màn hình trước
    e.animate(
      [
        { transform: e.style.transform },
        {
          transform: `translateX(${-tu * (W + 300)}px) ${e.style.transform} rotate(${-tu * 40}deg)`,
        },
      ],
      {
        duration: 620,
        delay: 60 + c * 40 + Math.random() * 120,
        easing: "cubic-bezier(.6,0,.8,.4)",
        fill: "both",
      },
    ).finished.then(() => {
      if (++xong === ds.length) lop.remove();
    });
  });
  setTimeout(() => lop.remove(), 2500);
}

// hủy hiệu ứng đang phủ (khi điều hướng bị bỏ dở do lỗi)
export function huyPhu(h) {
  if (!h) return;
  document.body.classList.remove("dang-nuoc");
  (h.v || h.lop || h.n)?.remove();
  h.v2?.remove();
  document.body.classList.remove("di-len", "di-xuong");
}
