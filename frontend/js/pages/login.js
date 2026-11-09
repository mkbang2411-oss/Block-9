// F4 + X6: đăng nhập bằng email + mật khẩu -> POST /api/auth/login
//  - sai từ lần thứ 3 thì server đòi CAPTCHA; sai 10 lần thì khóa 5 phút (429 + lockedSeconds) -> đếm ngược
//  - đã bật MFA: server chỉ trả { next:"mfa", challenge } (chưa có accessToken) -> sang /mfa
//  - sai mật khẩu là HTTP 200 + ok:false (không phải 401) nên không xóa token / không đổi trang
import { api, ApiError } from "../api.js";
import { getMe, setSession, setChallenge, takeNotice, dichMacDinh } from "../state.js";
import { navigate } from "../router.js";
import { $, esc } from "../utils.js";
import { khungDem, truongDem, nutDem, cho, datChuNut, xoaLoiDem, hienLoiDem, baoLoi, demNguoc, mmss, ganDem, ganCaptchaDem, safeNext, nextQs } from "./auth-ui.js";

// đăng nhập / xác thực MFA xong: nước sông dâng lên phủ màn hình rồi rút xuống để lộ trang đích
// (cùng hiệu ứng với đăng xuất bằng thuyền, xem effects.js)
const FX_VAO = { type: "nuoc" };
export const fxCho = (to) => (/^\/(dishes|khach|admin)?(\/|$)/.test(to) ? FX_VAO : null);

export async function load(ctx) {
  const next = safeNext(ctx.query);
  // đã đăng nhập thì không cần thấy form (mất mạng: vẫn cho hiện form)
  const me = await getMe().catch(() => null);
  if (me) return { redirect: next || dichMacDinh(me) };
  const thongBao = takeNotice();

  return {
    title: "Đăng nhập",
    am: "quan",
    html: khungDem({
      tab: "login",
      next,
      tieuDe: "Chào mừng trở lại",
      phu: "Đăng nhập để tiếp tục sử dụng hệ thống.",
      noiDung: `<div class="bao-loi" id="loi" role="alert"${thongBao ? "" : " hidden"}>${esc(thongBao || "")}</div>
      <form id="form" novalidate>
        ${truongDem({ name: "email", label: "Địa chỉ email", type: "email", ac: "username", placeholder: "ten@email.com", extra: "required" })}
        ${truongDem({ name: "password", label: "Mật khẩu", type: "password", ac: "current-password", placeholder: "Nhập mật khẩu", mat: true, extra: "required" })}
        <div id="captcha" data-field="captcha" hidden></div>
        <a class="dn-quen" href="/forgot-password">Quên mật khẩu?</a>
        ${nutDem("Đăng nhập")}
      </form>`,
      chan: `Chưa có tài khoản? <a href="/register">Đăng ký ngay</a>`,
    }),
    mount: (root, c) => mount(root, c, next),
  };
}

function mount(root, ctx, next) {
  const { signal } = ctx;
  ganDem(root, signal);
  const form = $("#form", root), loi = $("#loi", root), nut = $("#nut", root), hopCap = $("#captcha", root);
  let cap = null; // chỉ tạo khi server đòi (sai từ lần thứ 3)
  let khoa = false;

  const hienCaptcha = () => {
    if (!cap) {
      hopCap.hidden = false;
      cap = ganCaptchaDem(hopCap, signal, () => (loi.hidden = true));
    }
  };
  // bị khóa: chặn ô mật khẩu + nút, đếm ngược mm:ss; hết giờ tự mở lại (đổi email = tài khoản khác thì mở lại ngay, server quyết định ở lần gửi kế)
  let dungDem = null;
  const moKhoa = () => {
    dungDem?.();
    khoa = false;
    form.password.disabled = false;
    nut.disabled = false;
    nut.removeAttribute("aria-disabled");
    datChuNut(nut, "Đăng nhập");
    loi.hidden = true;
  };
  const khoaNut = (giay) => {
    khoa = true;
    form.password.value = "";
    form.password.disabled = true;
    nut.disabled = true;
    nut.setAttribute("aria-disabled", "true");
    dungDem = demNguoc(giay, {
      signal,
      onTick: (g) => datChuNut(nut, `Thử lại sau ${mmss(g)}`),
      onDone: () => {
        moKhoa();
        form.password.focus();
      },
    });
  };
  form.email.addEventListener("input", () => khoa && moKhoa(), { signal });
  form.addEventListener("input", () => !khoa && (loi.hidden = true), { signal });

  form.addEventListener(
    "submit",
    async (e) => {
      e.preventDefault();
      if (khoa) return;
      xoaLoiDem(form);
      loi.hidden = true;
      const email = form.email.value.trim(), password = form.password.value;
      const thieu = {};
      if (!email) thieu.email = "Vui lòng nhập email";
      if (!password) thieu.password = "Vui lòng nhập mật khẩu";
      if (Object.keys(thieu).length) return hienLoiDem(form, thieu);
      if (cap && !cap.token()) return baoLoi(loi, "Vui lòng xác nhận bạn không phải người máy.");

      cho(nut, true);
      try {
        const d = await api.auth.login({ email, password, recaptcha: cap ? cap.token() : undefined });
        if (d.next === "mfa") {
          setChallenge(d.challenge); // chỉ trong bộ nhớ
          return navigate("/mfa" + nextQs(next), { replace: true });
        }
        setSession(d);
        const to = next || dichMacDinh(d.user);
        navigate(to, { fx: fxCho(to) });
      } catch (err) {
        if (!(err instanceof ApiError)) throw err;
        cho(nut, false);
        cap?.reset(); // token CAPTCHA đã bị tiêu, lần sau phải tick lại
        if (err.code === "VALIDATION_FAILED" && Object.keys(err.fields).length) return hienLoiDem(form, err.fields);
        if (err.details.needCaptcha || err.code === "CAPTCHA_REQUIRED") hienCaptcha();
        if (err.code === "INVALID_CREDENTIALS") form.password.value = "";
        baoLoi(loi, err.message);
        if (err.code === "RATE_LIMITED") khoaNut(err.details.lockedSeconds || err.retryAfter || 60);
        else form.password.focus();
      }
    },
    { signal },
  );
}
