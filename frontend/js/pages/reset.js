// F6: đặt lại mật khẩu (giao diện ban đêm như Block 8) từ link trong email: /reset-password?token=...
//  - load(): GET /auth/reset-password/check?token= để biết link còn dùng được không
//  - gửi POST /auth/reset-password { token, password, passwordConfirm }
//  - đổi xong server tăng tokenVersion, KHÔNG cấp token, KHÔNG tắt MFA -> về /login
//  - token nằm trên URL nên trang đặt Referrer-Policy: no-referrer để không lộ qua header Referer (ảnh, font, CAPTCHA...)
import { api, ApiError } from "../api.js";
import { navigate } from "../router.js";
import { $, esc } from "../utils.js";
import { khungDem, truongDem, nutDem, cho, xoaLoiDem, hienLoiDem, baoLoi, ganDem, ganCapMatKhau } from "./auth-ui.js";

const hong = (msg) => ({
  title: "Đặt lại mật khẩu",
  am: "quan",
  html: khungDem({
    tab: "none",
    tieuDe: "Link không dùng được",
    noiDung: `<div class="bao-loi" role="alert">${esc(msg)}</div>
      <a class="dn-nut" href="/forgot-password" style="text-align:center;text-decoration:none"><span>Gửi lại link mới</span></a>`,
    chan: `<a href="/login">← Quay lại đăng nhập</a>`,
  }),
  mount: (root, c) => ganDem(root, c.signal),
});

export async function load(ctx) {
  const token = ctx.query.get("token") || "";
  if (!token) return hong("Thiếu mã trong liên kết. Hãy mở lại liên kết trong email hoặc yêu cầu liên kết mới.");
  try {
    await api.auth.resetCheck(token);
  } catch (err) {
    if (err instanceof ApiError && err.code === "INVALID_RESET_TOKEN") return hong(err.message);
    throw err; // mất mạng / 500: router hiện màn hình lỗi có nút Thử lại
  }
  return {
    title: "Đặt lại mật khẩu",
    am: "quan",
    html: khungDem({
      tab: "none",
      tieuDe: "Đặt lại mật khẩu",
      phu: "Chọn mật khẩu mới cho tài khoản của bạn.",
      noiDung: `<div class="bao-loi" id="loi" role="alert" hidden></div>
      <form id="form" novalidate>
        ${truongDem({ name: "password", label: "Mật khẩu mới", type: "password", ac: "new-password", placeholder: "Nhập mật khẩu mới", mat: true, luat: true, extra: "required" })}
        ${truongDem({ name: "passwordConfirm", label: "Nhập lại mật khẩu", type: "password", ac: "new-password", placeholder: "Nhập lại mật khẩu", mat: true, luat: true, extra: "required" })}
        ${nutDem("Đặt lại mật khẩu")}
      </form>`,
      chan: `<a href="/login">← Quay lại đăng nhập</a>`,
    }),
    mount: (root, c) => mount(root, c, token),
  };
}

function mount(root, ctx, token) {
  const { signal } = ctx;
  ganDem(root, signal);
  // không gửi Referer đi đâu từ trang này; gỡ khi rời màn hình
  const meta = Object.assign(document.createElement("meta"), { name: "referrer", content: "no-referrer" });
  document.head.append(meta);
  signal.addEventListener("abort", () => meta.remove(), { once: true });

  const form = $("#form", root), loi = $("#loi", root), nut = $("#nut", root);
  const luat = ganCapMatKhau(form, "password", "passwordConfirm", signal);
  setTimeout(() => !signal.aborted && form.password.focus({ preventScroll: true }), 60);
  form.addEventListener(
    "submit",
    async (e) => {
      e.preventDefault();
      xoaLoiDem(form);
      loi.hidden = true;
      const okMk = luat.kiemMk(), okKhop = luat.kiemKhop();
      if (!okMk) return form.password.focus();
      if (!okKhop) return form.passwordConfirm.focus();
      const password = form.password.value, passwordConfirm = form.passwordConfirm.value;
      cho(nut, true);
      try {
        await api.auth.reset({ token, password, passwordConfirm });
        navigate("/login", { replace: true, flash: "Đã đổi mật khẩu. Hãy đăng nhập lại." });
      } catch (err) {
        if (!(err instanceof ApiError)) throw err;
        cho(nut, false);
        if (err.code === "INVALID_RESET_TOKEN") return navigate("/forgot-password", { replace: true, flash: err.message });
        if (err.code === "VALIDATION_FAILED" && hienLoiDem(form, err.fields)) return;
        baoLoi(loi, err.message);
      }
    },
    { signal },
  );
}
