// Phần dùng chung của các trang đăng nhập / đăng ký / quên mật khẩu / MFA (F4–F7).
import { RECAPTCHA_SITE_KEY } from "../config.js";
import { $, $$, esc } from "../utils.js";

// ?next=/duong/dan: chỉ nhận đường dẫn nội bộ (chống open redirect: "//evil.com", "https://...", "/\\evil")
export function safeNext(query) {
  const n = query && query.get("next");
  if (!n || n[0] !== "/" || n[1] === "/" || n[1] === "\\") return "";
  if (/^\/(login|register|forgot-password|reset-password|mfa)(\/|\?|$)/.test(n)) return "";
  return n;
}
export const nextQs = (next) => (next ? "?next=" + encodeURIComponent(next) : "");

// khung chung: thanh trên (Ra phố + tab Đăng nhập / Đăng ký) + một tờ giấy .hop
export function khung({ tab, tieuDe, phu, noiDung, next = "", rong = false }) {
  const tabs =
    tab === "none"
      ? ""
      : `<div class="tabs">
      <a class="nut tab${tab === "login" ? " on" : ""}" href="/login${esc(nextQs(next))}">Đăng nhập</a>
      <a class="nut tab${tab === "register" ? " on" : ""}" href="/register">Đăng ký</a>
    </div>`;
  return `<main class="man trang cuon">
  <div class="thanh"><a class="nut nut-phu" href="/">Ra phố</a>${tabs}</div>
  <div class="hop hop-giua${rong ? " rong" : ""}" id="khung-auth">
    <h2>${esc(tieuDe)}</h2>
    ${phu ? `<p class="phu-chu">${esc(phu)}</p>` : ""}
    ${noiDung}
  </div>
</main>`;
}

// một ô nhập: .truong[data-field] khớp với hienLoi() của admin-form (cùng CSS .co-loi / .chu-loi)
export function truong({ name, label, type = "text", ac = "off", value = "", extra = "", goiY = "" }) {
  return `<div class="truong" data-field="${esc(name)}">
    <label for="f-${esc(name)}">${esc(label)}</label>
    <input id="f-${esc(name)}" name="${esc(name)}" type="${esc(type)}" autocomplete="${esc(ac)}" value="${esc(value)}" ${extra}>
    ${goiY ? `<small class="phu-chu-nho">${esc(goiY)}</small>` : ""}
  </div>`;
}

export function xoaLoi(form) {
  $$(".co-loi", form).forEach((t) => t.classList.remove("co-loi"));
  $$(".chu-loi", form).forEach((s) => s.remove());
}
export function hienLoi(form, fields = {}) {
  let dau = null;
  Object.entries(fields).forEach(([name, msg]) => {
    const t = $(`.truong[data-field="${name}"]`, form);
    if (!t) return;
    t.classList.add("co-loi");
    t.insertAdjacentHTML("beforeend", `<small class="chu-loi">${esc(msg)}</small>`);
    dau ||= $("input", t);
  });
  dau?.focus();
  return !!dau; // true nếu ít nhất một ô nhận được lỗi
}

export function baoLoi(el, msg) {
  el.textContent = msg;
  el.hidden = false;
}

// đếm ngược mm:ss; trả hàm dừng. Tự dừng khi rời màn hình (signal)
export function demNguoc(giay, { onTick, onDone, signal }) {
  let con = Math.max(1, Math.ceil(giay));
  onTick(con);
  const t = setInterval(() => {
    con -= 1;
    if (con <= 0) {
      clearInterval(t);
      onDone();
    } else onTick(con);
  }, 1000);
  const dung = () => clearInterval(t);
  signal?.addEventListener("abort", dung);
  return dung;
}
export const mmss = (g) => `${Math.floor(g / 60)}:${String(g % 60).padStart(2, "0")}`;

// ---------- CAPTCHA ----------
// Có RECAPTCHA_SITE_KEY: widget reCAPTCHA v2 thật. Không có: ô tick giả lập, gửi "dev-captcha"
// (server dev bỏ qua kiểm tra khi chưa có RECAPTCHA_SECRET_KEY; production sẽ từ chối).
let napP;
function napScript() {
  if (window.grecaptcha && window.grecaptcha.render) return Promise.resolve();
  napP ||= new Promise((ok, loi) => {
    window.__rcSan = ok;
    const s = document.createElement("script");
    s.src = "https://www.google.com/recaptcha/api.js?onload=__rcSan&render=explicit";
    s.async = true;
    s.onerror = () => ((napP = null), loi(new Error("Không tải được reCAPTCHA")));
    document.head.append(s);
  });
  return napP;
}

// box: phần tử rỗng sẽ chứa CAPTCHA. Trả { token(), reset() }
export function ganCaptcha(box, signal) {
  if (!RECAPTCHA_SITE_KEY) {
    box.innerHTML = `<label class="check"><input type="checkbox"> Tôi không phải người máy <small class="phu-chu-nho">(chế độ dev: chưa đặt RECAPTCHA_SITE_KEY)</small></label>`;
    const cb = $("input", box);
    return { token: () => (cb.checked ? "dev-captcha" : ""), reset: () => (cb.checked = false) };
  }
  let id = null;
  napScript()
    .then(() => {
      if (signal?.aborted) return;
      id = window.grecaptcha.render(box, { sitekey: RECAPTCHA_SITE_KEY });
    })
    .catch(() => (box.textContent = "Không tải được reCAPTCHA. Kiểm tra mạng rồi tải lại trang."));
  return {
    token: () => (id === null ? "" : window.grecaptcha.getResponse(id)),
    reset: () => id !== null && window.grecaptcha.reset(id),
  };
}

// =====================================================================================================================
// GIAO DIỆN BAN ĐÊM (H9 + H10): cảnh sông đêm + hoa đăng của Block 8 (views/login.ejs), dùng cho /login /register
// /forgot-password /reset-password /mfa. Trang bảo mật tài khoản (security.js) vẫn dùng khung giấy ở trên.
// =====================================================================================================================
const rnd = (a, b) => a + Math.random() * (b - a);
const ri = (a, b) => Math.floor(rnd(a, b + 1));

// t = loại đèn | x = vị trí ngang (%) | b = độ cao trên dải sông (%) | k = cỡ | du = chu kỳ trôi (giây)
const DEN = [
  { t: 1, x: 4, b: 58, k: 0.72, du: 6.2 }, { t: 2, x: 22, b: 54, k: 0.8, du: 7.4 },
  { t: 3, x: 40, b: 60, k: 0.68, du: 5.6 }, { t: 1, x: 3, b: 28, k: 1.0, du: 7.0 },
  { t: 3, x: 16, b: 5, k: 1.2, du: 6.6 }, { t: 2, x: 33, b: 9, k: 1.1, du: 5.8 },
  { t: 1, x: 47, b: 40, k: 0.9, du: 7.8 }, { t: 3, x: 53, b: 70, k: 0.65, du: 6.0 },
  { t: 2, x: 64, b: 4, k: 1.15, du: 7.2 }, { t: 1, x: 82, b: 3, k: 1.0, du: 6.4 },
  { t: 2, x: 12, b: 42, k: 0.9, du: 6.8 }, { t: 3, x: 28, b: 28, k: 1.0, du: 7.6 },
];

// bầu trời sao + ánh trăng + sông + thuyền + hoa đăng + nút "Trang chủ" (link về phố = nước sông tràn, xem effects.js chonFx)
function canhDem() {
  let sao = "", lap = "", den = "";
  for (let k = 0; k < 22; k++)
    sao += `<i class="dn-sao" style="--x:${ri(2, 98)}%;--y:${ri(2, 58)}%;--s:${rnd(1.2, 3).toFixed(1)}px;--t:${rnd(2.4, 5.4).toFixed(1)}s;--dl:-${rnd(0, 5).toFixed(1)}s"></i>`;
  for (let k = 0; k < 16; k++)
    lap += `<i class="dn-lap" style="--x:${ri(2, 98)}%;--y:${ri(10, 94)}%;--s:${ri(8, 15)}px;--t:${rnd(2.4, 4.8).toFixed(1)}s;--dl:-${rnd(0, 5).toFixed(1)}s"></i>`;
  DEN.forEach((d, i) => {
    den += `<span class="dn-den t${d.t}" style="--x:${d.x}%;--b:${d.b};--k:${d.k};--du:${d.du}s;--dl:-${(i * 1.3).toFixed(1)}s;z-index:${d.b < 30 ? 5 : 3}"><img src="/img/dang-nhap/den-${d.t}.webp?v=2" width="360" height="421" alt="" draggable="false" decoding="async"></span>`;
  });
  return `<div class="dn-troi" aria-hidden="true">${sao}</div>
  <div class="nang" aria-hidden="true"><i class="tia"></i><i class="tia nho"></i></div>
  <div class="dn-song" aria-hidden="true"><div class="dn-song-nuoc"></div>${lap}</div>
  <i class="dn-mep sau" aria-hidden="true"></i><i class="dn-mep" aria-hidden="true"></i>
  <div class="dn-thuyen" aria-hidden="true"><img src="/img/thuyen.webp" width="1400" height="369" alt="" draggable="false" decoding="async"></div>
  <div class="dn-den-ds" aria-hidden="true">${den}</div>
  <a class="dn-ve" href="/"><svg viewBox="0 0 20 14" width="16" height="12" aria-hidden="true"><path d="M19 7H2M7 1.5 1.5 7 7 12.5" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>Trang chủ</a>`;
}

// thanh trượt dưới tab chạy từ tab trước sang tab hiện tại (SPA vẽ lại cả màn hình nên nhớ tab đã hiện lần trước)
let tabTruoc = "login";

// khung đêm: tab = "login" | "register" | "none" (ẩn thanh tab: đặt lại mật khẩu, MFA)
//   dau: HTML đặt dưới tiêu đề (vd. thanh các bước đăng ký); noiDung: phần thân; chan: dòng chuyển trang ở cuối thẻ
export function khungDem({ tab = "login", tieuDe, phu = "", dau = "", noiDung, next = "", chan = "", idTieuDe = "" }) {
  const dich = tab === "register" ? "register" : "login";
  const truoc = tab === "none" ? dich : tabTruoc;
  tabTruoc = tab === "none" ? tabTruoc : dich;
  const tabs =
    tab === "none"
      ? ""
      : `<nav class="dn-tab" aria-label="Chọn đăng nhập hoặc đăng ký">
      <a class="dn-tab-nut${tab === "login" ? " on" : ""}" href="/login${esc(nextQs(next))}"${tab === "login" ? ' aria-current="page"' : ""}>Đăng nhập</a>
      <a class="dn-tab-nut${tab === "register" ? " on" : ""}" href="/register"${tab === "register" ? ' aria-current="page"' : ""}>Đăng ký</a>
      <i class="dn-tab-vach" aria-hidden="true"></i>
    </nav>`;
  return `<main class="man dn" data-tab="${truoc}" data-tab-dich="${dich}">
  ${canhDem()}
  <section class="dn-the" aria-label="Đăng nhập và đăng ký">
    ${tabs}
    <div class="dn-pane">
      <h1 class="dn-tieude"${idTieuDe ? ` id="${idTieuDe}"` : ""}>${esc(tieuDe)}</h1>
      ${phu ? `<p class="dn-phu">${phu}</p>` : ""}
      ${dau}
      ${noiDung}
      ${chan ? `<p class="dn-chuyen">${chan}</p>` : ""}
    </div>
  </section>
</main>`;
}

const MAT_SVG = `<svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true"><path d="M1.5 12S5.5 5 12 5s10.5 7 10.5 7-4 7-10.5 7S1.5 12 1.5 12z" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/><circle cx="12" cy="12" r="3.2" fill="none" stroke="currentColor" stroke-width="1.8"/><path class="gach" d="M4 4l16 16" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>`;

// một ô nhập kiểu đêm: label.dn-truong[data-field] > span + input (+ nút hiện mật khẩu) + ul luật mật khẩu + small.dn-loi
export function truongDem({ name, label, type = "text", ac = "off", value = "", extra = "", placeholder = "", mat = false, luat = false, goiY = "" }) {
  const o = `<input id="f-${esc(name)}" name="${esc(name)}" type="${esc(type)}" autocomplete="${esc(ac)}" placeholder="${esc(placeholder)}" value="${esc(value)}" ${extra}>`;
  return `<label class="dn-truong" data-field="${esc(name)}"><span>${esc(label)}</span>
    ${mat ? `<span class="dn-mk">${o}<button type="button" class="dn-mat" aria-label="Hiện mật khẩu" aria-pressed="false">${MAT_SVG}</button></span>` : o}
    ${luat ? `<ul class="dn-dk" aria-live="polite"></ul>` : ""}
    ${goiY ? `<small class="phu-chu-nho">${esc(goiY)}</small>` : ""}
    <small class="dn-loi" role="alert"></small></label>`;
}

// nút chính: chữ nằm trong <span> (CSS .cho ẩn chữ và hiện vòng quay)
export const nutDem = (chu, { id = "nut", type = "submit" } = {}) =>
  `<button class="dn-nut" id="${id}" type="${type}"><span>${esc(chu)}</span></button>`;
export const datChuNut = (nut, chu) => ((nut.firstElementChild || nut).textContent = chu);
export const cho = (nut, bat) => {
  nut.classList.toggle("cho", bat);
  nut.disabled = bat;
};

// lỗi theo ô (cùng quy ước với server: { tênTrường: "thông báo" })
export function datLoiO(input, msg) {
  const o = input.closest("[data-field]") || input.parentElement;
  input.classList.toggle("loi", !!msg);
  input.setAttribute("aria-invalid", msg ? "true" : "false");
  const t = $(".dn-loi", o);
  if (t) t.textContent = msg || "";
  return !msg;
}
export function xoaLoiDem(form) {
  $$("input.loi", form).forEach((i) => datLoiO(i, ""));
  $$(".dn-loi", form).forEach((t) => (t.textContent = ""));
}
export function hienLoiDem(form, fields = {}) {
  let dau = null;
  Object.entries(fields).forEach(([name, msg]) => {
    const o = $(`[data-field="${name}"]`, form);
    if (!o) return;
    const i = $("input", o);
    if (i) datLoiO(i, msg);
    else $(".dn-loi", o) && ($(".dn-loi", o).textContent = msg);
    dau ||= i || o;
  });
  dau?.focus?.();
  return !!dau;
}

// gắn hành vi chung cho màn hình đêm: thanh tab trượt, nút hiện/ẩn mật khẩu, gõ lại thì xóa lỗi của ô đó
export function ganDem(root, signal) {
  const dem = $(".dn", root);
  if (dem && dem.dataset.tabDich !== dem.dataset.tab) {
    void dem.offsetWidth; // chốt vị trí cũ rồi mới đổi để CSS chạy transition
    requestAnimationFrame(() => (dem.dataset.tab = dem.dataset.tabDich));
  }
  root.addEventListener(
    "click",
    (e) => {
      const nut = e.target.closest(".dn-mat");
      if (!nut) return;
      const i = $("input", nut.parentElement);
      const hien = i.type === "password";
      i.type = hien ? "text" : "password";
      nut.setAttribute("aria-pressed", hien);
      nut.setAttribute("aria-label", hien ? "Ẩn mật khẩu" : "Hiện mật khẩu");
    },
    { signal },
  );
  root.addEventListener(
    "input",
    (e) => e.target.classList?.contains("loi") && !e.target.closest(".dn-otp") && datLoiO(e.target, ""),
    { signal },
  );
}

// ---------- ô OTP 6 số: tự nhảy ô, xóa lùi, mũi tên, dán cả mã ----------
export const otpHtml = (name = "otp", nhan = "Mã xác thực 6 số") =>
  `<div class="dn-otp" id="f-${esc(name)}" data-field="${esc(name)}" role="group" aria-label="${esc(nhan)}">${[0, 1, 2, 3, 4, 5]
    .map((k) => `<input type="text" inputmode="numeric" pattern="[0-9]*" maxlength="1" autocomplete="${k === 0 ? "one-time-code" : "off"}" aria-label="Số thứ ${k + 1}">`)
    .join("")}</div>`;

export function noiOtp(nhom, { signal, loiEl } = {}) {
  const o = $$("input", nhom);
  const xoaLoiOtp = () => {
    o.forEach((i) => i.classList.remove("loi"));
    if (loiEl) loiEl.textContent = "";
  };
  o.forEach((inp, i) => {
    inp.addEventListener(
      "input",
      () => {
        inp.value = inp.value.replace(/\D/g, "").slice(-1);
        xoaLoiOtp();
        if (inp.value && o[i + 1]) o[i + 1].focus();
      },
      { signal },
    );
    inp.addEventListener(
      "keydown",
      (e) => {
        if (e.key === "Backspace" && !inp.value && o[i - 1]) {
          o[i - 1].value = "";
          o[i - 1].focus();
          e.preventDefault();
        } else if (e.key === "ArrowLeft" && o[i - 1]) o[i - 1].focus();
        else if (e.key === "ArrowRight" && o[i + 1]) o[i + 1].focus();
      },
      { signal },
    );
    inp.addEventListener("focus", () => inp.select(), { signal });
    inp.addEventListener(
      "paste",
      (e) => {
        const t = ((e.clipboardData && e.clipboardData.getData("text")) || "").replace(/\D/g, "").slice(0, 6);
        if (!t) return;
        e.preventDefault();
        [...t].forEach((c, k) => (o[k].value = c));
        o[Math.min(t.length, 5)].focus();
        xoaLoiOtp();
      },
      { signal },
    );
  });
  return {
    inputs: o,
    value: () => o.map((i) => i.value).join(""),
    clear: () => {
      o.forEach((i) => (i.value = ""));
      xoaLoiOtp();
    },
    focus: () => (o.find((i) => !i.value) || o[0]).focus(),
    danhDauLoi: (msg) => {
      o.forEach((i) => i.classList.add("loi"));
      if (loiEl) loiEl.textContent = msg;
    },
  };
}

// ---------- luật mật khẩu hiện từng dòng dưới ô nhập: ○ chưa nhập | ✗ chưa đạt | ✓ đạt (cùng luật với server utils/validators.js) ----------
const LUAT_MK = [
  ["Ít nhất 8 ký tự", (v) => v.length >= 8],
  ["Tối đa 72 ký tự", (v) => new TextEncoder().encode(v).length <= 72],
  ["Có chữ thường (a-z)", (v) => /[a-z]/.test(v)],
  ["Có chữ HOA (A-Z)", (v) => /[A-Z]/.test(v)],
  ["Có chữ số (0-9)", (v) => /\d/.test(v)],
  ["Không có khoảng trắng", (v) => !/\s/.test(v)],
];
function ganLuat(input, ul, luat, signal) {
  ul.replaceChildren(
    ...luat.map(([chu]) => {
      const li = document.createElement("li"),
        i = document.createElement("i");
      i.setAttribute("aria-hidden", "true");
      li.append(i, chu);
      return li;
    }),
  );
  const cap = (force) => {
    const v = input.value;
    luat.forEach(([, ok], k) => {
      const st = !v && !force ? "" : ok(v) ? "ok" : "bad";
      ul.children[k].className = st;
      ul.children[k].firstChild.textContent = st === "ok" ? "✓" : st === "bad" ? "✗" : "○";
    });
  };
  input.addEventListener("input", () => cap(), { signal });
  cap();
  return cap;
}
// gắn cặp "mật khẩu + nhập lại": form có ô name=mkName và confirmName, mỗi ô có <ul class="dn-dk"> trong .dn-truong của nó
export function ganCapMatKhau(form, mkName, confirmName, signal) {
  const mk = form[mkName], mk2 = form[confirmName];
  const capMk = ganLuat(mk, $(".dn-dk", mk.closest(".dn-truong")), LUAT_MK, signal);
  const capKhop = ganLuat(mk2, $(".dn-dk", mk2.closest(".dn-truong")), [["Trùng khớp với mật khẩu", (v) => v !== "" && v === mk.value]], signal);
  mk.addEventListener("input", () => mk2.value && capKhop(), { signal });
  return {
    kiemMk() {
      const ok = LUAT_MK.every(([, f]) => f(mk.value));
      capMk(true);
      mk.classList.toggle("loi", !ok);
      return ok;
    },
    kiemKhop() {
      const ok = mk2.value !== "" && mk2.value === mk.value;
      capKhop(true);
      mk2.classList.toggle("loi", !ok);
      return ok;
    },
  };
}

// ---------- CAPTCHA kiểu đêm ----------
// Có RECAPTCHA_SITE_KEY: widget reCAPTCHA v2 thật (.dn-rc). Không có: ô tick giả lập .dn-cap (bấm là xong sau 0,7 giây),
// gửi "dev-captcha" (server dev bỏ qua kiểm tra khi chưa có RECAPTCHA_SECRET_KEY; production sẽ từ chối).
const CAP_SVG = `<svg class="dn-cap-hinh" viewBox="0 0 24 24" width="26" height="26" aria-hidden="true"><path d="M12 2.5 4.5 5.8v5.6c0 4.6 3.1 8.1 7.5 10.1 4.4-2 7.5-5.5 7.5-10.1V5.8z" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round"/><path d="m8.6 12.2 2.4 2.4 4.4-4.8" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"/></svg>`;

// box: phần tử rỗng sẽ chứa CAPTCHA; onTick (tùy chọn) gọi khi người dùng tick xong để xóa lỗi. Trả { token(), reset() }
export function ganCaptchaDem(box, signal, onOk) {
  if (!RECAPTCHA_SITE_KEY) {
    box.innerHTML = `<div class="dn-cap" role="checkbox" aria-checked="false" aria-labelledby="cap-chu" tabindex="0">
      <span class="dn-cap-o" aria-hidden="true"></span><span class="dn-cap-chu" id="cap-chu">Tôi không phải là người máy <small style="opacity:.6;font-weight:400">(chế độ thử, chưa có reCAPTCHA thật)</small></span>${CAP_SVG}</div>`;
    console.warn("[CAPTCHA] Chưa đặt RECAPTCHA_SITE_KEY: đang dùng ô tick GIẢ LẬP, không chặn được bot.");
    const el = $(".dn-cap", box);
    let ok = false;
    const bam = () => {
      if (ok || el.classList.contains("cho")) return;
      el.classList.add("cho");
      setTimeout(() => {
        if (signal?.aborted) return;
        el.classList.remove("cho");
        el.classList.add("ok");
        el.setAttribute("aria-checked", "true");
        ok = true;
        onOk?.();
      }, 700);
    };
    el.addEventListener("click", bam, { signal });
    el.addEventListener("keydown", (e) => (e.key === " " || e.key === "Enter") && (e.preventDefault(), bam()), { signal });
    return {
      token: () => (ok ? "dev-captcha" : ""),
      reset: () => {
        ok = false;
        el.classList.remove("ok", "cho");
        el.setAttribute("aria-checked", "false");
      },
    };
  }
  // ---- reCAPTCHA v2 THẬT của Google ----
  const goc = document.createElement("div");
  goc.className = "dn-rc";
  box.replaceChildren(goc);
  let id = null;
  const baoLoi = (chu) => {
    const cha = box.parentElement;
    const o = cha && cha.matches('[data-field="captcha"]') ? cha.querySelector(".dn-loi") : null;
    if (o) o.textContent = chu;
  };
  napScript()
    .then(() => {
      if (signal?.aborted) return;
      id = window.grecaptcha.render(goc, {
        sitekey: RECAPTCHA_SITE_KEY,
        callback: () => (baoLoi(""), onOk?.()), // người dùng giải xong -> có token
        "expired-callback": () => baoLoi("Xác nhận đã hết hạn, hãy tick lại."), // token chỉ sống ~2 phút
        "error-callback": () => baoLoi("reCAPTCHA gặp lỗi (mạng hoặc khóa không hợp lệ). Hãy tải lại trang."),
      });
    })
    .catch(() => (box.textContent = "Không tải được reCAPTCHA. Kiểm tra mạng rồi tải lại trang."));
  return {
    token: () => (id === null ? "" : window.grecaptcha.getResponse(id)),
    reset: () => id !== null && window.grecaptcha.reset(id),
  };
}
