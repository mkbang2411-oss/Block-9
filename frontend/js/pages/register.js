// F5: đăng ký 3 bước, cùng một trang /register (giao diện ban đêm như Block 8), trạng thái nằm trong bộ nhớ (không ghi localStorage):
//   1) email + CAPTCHA -> POST /auth/register/otp        (server gửi mã OTP qua email)
//   2) nhập OTP        -> POST /auth/register/verify     (trả ticket)
//   3) họ tên + mật khẩu (+ mã mời đầu bếp) -> POST /auth/register   (không cấp token, phải đăng nhập)
// role do server quyết định: luôn viewer; đúng CHEF_INVITE_CODE thì editor. Client không gửi role.
import { api, ApiError } from "../api.js";
import { getMe, dichMacDinh } from "../state.js";
import { navigate } from "../router.js";
import { $, esc } from "../utils.js";
import {
  khungDem, truongDem, nutDem, cho, xoaLoiDem, hienLoiDem, baoLoi, demNguoc, ganDem, ganCaptchaDem, otpHtml, noiOtp, ganCapMatKhau,
} from "./auth-ui.js";

export async function load() {
  const me = await getMe().catch(() => null);
  if (me) return { redirect: dichMacDinh(me) };
  return {
    title: "Đăng ký",
    am: "quan",
    // thân trang chỉ là một vùng trống: mỗi bước tự vẽ lại tiêu đề, thanh bước và form vào #buoc
    html: khungDem({ tab: "register", tieuDe: "Xác thực email", phu: "Nhập email bạn muốn dùng để đăng nhập hệ thống.", noiDung: `<div id="buoc"></div>`, chan: `Đã có tài khoản? <a href="/login">Đăng nhập</a>` }),
    mount,
  };
}

const TD = {
  1: ["Xác thực email", "Nhập email bạn muốn dùng để đăng nhập hệ thống."],
  2: ["Nhập mã xác thực", null],
  3: ["Thông tin cá nhân", "Gần xong rồi! Điền vài thông tin để hoàn tất."],
};
const thanhBuoc = (n) =>
  `<ol class="dn-buoc" aria-label="Các bước đăng ký">${[1, 2, 3]
    .map((k) => `<li class="${k === n ? "on" : k < n ? "xong" : ""}" data-b="${k}"${k === n ? ' aria-current="step"' : ""}><b>${k < n ? "✓" : k}</b></li>`)
    .join("")}</ol>`;

function mount(root, ctx) {
  const { signal } = ctx;
  ganDem(root, signal);
  const vung = $("#buoc", root);
  const tieuDe = $(".dn-tieude", root), phu = $(".dn-phu", root);
  const S = { email: "", ticket: "" };

  // vẽ lại một bước: tiêu đề + dòng phụ ở đầu thẻ, thanh bước + form trong vùng #buoc
  const ve = (n, html, msg = "") => {
    tieuDe.textContent = TD[n][0];
    if (n === 2) phu.innerHTML = `Mã gồm 6 số đã được gửi tới <b>${esc(S.email)}</b> (nếu email hợp lệ).`;
    else phu.textContent = TD[n][1];
    vung.innerHTML = thanhBuoc(n) + html;
    const loi = $("#loi", vung);
    if (loi && msg) baoLoi(loi, msg);
    const dau = $("input", vung);
    setTimeout(() => dau && !signal.aborted && dau.focus({ preventScroll: true }), 60);
    return loi;
  };
  const khungLoi = `<div class="bao-loi" id="loi" role="alert" hidden></div>`;

  // ---------------- bước 1: email + CAPTCHA ----------------
  function buoc1(msg = "") {
    const loi = ve(
      1,
      `<form id="form" class="dn-b" novalidate>${khungLoi}
      ${truongDem({ name: "email", label: "Địa chỉ email", type: "email", ac: "email", placeholder: "ten@email.com", value: S.email, extra: "required" })}
      <div data-field="captcha"><div id="captcha"></div><small class="dn-loi" role="alert"></small></div>
      ${nutDem("Gửi mã xác thực")}</form>`,
      msg,
    );
    const form = $("#form", vung), nut = $("#nut", vung);
    const xoaLoiCap = () => ($(".dn-loi", $('[data-field="captcha"]', form)).textContent = "");
    const cap = ganCaptchaDem($("#captcha", vung), signal, xoaLoiCap);
    form.addEventListener(
      "submit",
      async (e) => {
        e.preventDefault();
        xoaLoiDem(form);
        loi.hidden = true;
        const email = form.email.value.trim();
        if (!email) return hienLoiDem(form, { email: "Vui lòng nhập email" });
        if (!cap.token()) return hienLoiDem(form, { captcha: "Vui lòng xác nhận bạn không phải người máy." });
        cho(nut, true);
        try {
          const d = await api.auth.registerOtp({ email, recaptcha: cap.token() });
          S.email = email;
          buoc2(d.cooldown || 60);
        } catch (err) {
          if (!(err instanceof ApiError)) throw err;
          cho(nut, false);
          cap.reset(); // server đã tiêu token (đúng hay sai) -> bắt tick lại
          if (err.code === "VALIDATION_FAILED" && hienLoiDem(form, err.fields)) return;
          baoLoi(loi, err.message); // RATE_LIMITED, EMAIL_SEND_FAILED, mất mạng...
        }
      },
      { signal },
    );
  }

  // ---------------- bước 2: nhập OTP ----------------
  function buoc2(cooldown, msg = "") {
    const loi = ve(
      2,
      `<form id="form" class="dn-b" novalidate>${khungLoi}
      ${otpHtml("otp")}
      <small class="dn-loi giua" id="loi-otp" role="alert"></small>
      ${nutDem("Xác nhận mã")}
      <div class="dn-phu-hang">
        <button type="button" class="dn-lk" id="doi-mail">← Đổi email</button>
        <button type="button" class="dn-lk" id="gui-lai" disabled></button>
      </div></form>`,
      msg,
    );
    const form = $("#form", vung), nut = $("#nut", vung), lai = $("#gui-lai", vung);
    const otp = noiOtp($(".dn-otp", vung), { signal, loiEl: $("#loi-otp", vung) });
    otp.focus();
    demNguoc(cooldown, {
      signal,
      onTick: (g) => (lai.textContent = `Gửi lại mã sau ${g}s`),
      onDone: () => ((lai.disabled = false), (lai.textContent = "Gửi lại mã")),
    });
    // gửi lại mã cần CAPTCHA mới: về bước 1, giữ email
    lai.addEventListener("click", () => buoc1("Hãy xác nhận không phải người máy để nhận mã mới."), { signal });
    $("#doi-mail", vung).addEventListener("click", () => ((S.email = ""), buoc1()), { signal });
    form.addEventListener(
      "submit",
      async (e) => {
        e.preventDefault();
        loi.hidden = true;
        const ma = otp.value();
        if (!/^\d{6}$/.test(ma)) {
          otp.inputs.forEach((i) => i.classList.toggle("loi", !i.value));
          $("#loi-otp", vung).textContent = "Vui lòng nhập đủ 6 số.";
          return otp.focus();
        }
        cho(nut, true);
        try {
          const d = await api.auth.registerVerify({ email: S.email, otp: ma });
          S.ticket = d.ticket;
          buoc3();
        } catch (err) {
          if (!(err instanceof ApiError)) throw err;
          cho(nut, false);
          if (err.code === "VALIDATION_FAILED" && Object.keys(err.fields).length) return otp.danhDauLoi(Object.values(err.fields)[0]);
          otp.danhDauLoi(err.message); // OTP_INVALID, 429 (khóa 15 phút sau 5 lần sai)
          otp.focus();
        }
      },
      { signal },
    );
  }

  // ---------------- bước 3: thông tin tài khoản ----------------
  function buoc3(msg = "") {
    const loi = ve(
      3,
      `<form id="form" class="dn-b" novalidate>${khungLoi}
      ${truongDem({ name: "name", label: "Họ và tên", ac: "name", placeholder: "Nguyễn Văn A", extra: "required" })}
      ${truongDem({ name: "inviteCode", label: "Mã mời đầu bếp (không bắt buộc)", ac: "off", placeholder: "Bỏ trống nếu bạn là khách hàng", extra: 'spellcheck="false" maxlength="100"' })}
      ${truongDem({ name: "password", label: "Mật khẩu", type: "password", ac: "new-password", placeholder: "Nhập mật khẩu", mat: true, luat: true, extra: "required" })}
      ${truongDem({ name: "passwordConfirm", label: "Nhập lại mật khẩu", type: "password", ac: "new-password", placeholder: "Nhập lại mật khẩu", mat: true, luat: true, extra: "required" })}
      ${nutDem("Hoàn tất đăng ký")}</form>`,
      msg,
    );
    const form = $("#form", vung), nut = $("#nut", vung);
    const luat = ganCapMatKhau(form, "password", "passwordConfirm", signal);
    form.addEventListener(
      "submit",
      async (e) => {
        e.preventDefault();
        xoaLoiDem(form);
        loi.hidden = true;
        const v = {
          name: form.name.value.trim(),
          password: form.password.value,
          passwordConfirm: form.passwordConfirm.value,
          inviteCode: form.inviteCode.value.trim(),
        };
        const thieu = {};
        if (v.name.length < 2) thieu.name = "Vui lòng nhập họ và tên.";
        if (Object.keys(thieu).length) hienLoiDem(form, thieu);
        const okMk = luat.kiemMk(), okKhop = luat.kiemKhop(); // vẽ đủ ✓/✗ cho cả hai danh sách
        if (Object.keys(thieu).length) return;
        if (!okMk) return form.password.focus();
        if (!okKhop) return form.passwordConfirm.focus();
        cho(nut, true);
        try {
          await api.auth.register({
            email: S.email,
            ticket: S.ticket,
            name: v.name,
            password: v.password,
            passwordConfirm: v.passwordConfirm,
            ...(v.inviteCode && { inviteCode: v.inviteCode }),
          });
          navigate("/login", { flash: "Đăng ký thành công. Hãy đăng nhập." });
        } catch (err) {
          if (!(err instanceof ApiError)) throw err;
          cho(nut, false);
          // ticket hết hạn / đã dùng: làm lại từ đầu
          if (err.code === "TICKET_INVALID") return ((S.ticket = ""), buoc1(err.message));
          if (err.code === "VALIDATION_FAILED" && hienLoiDem(form, err.fields)) return;
          form.password.value = form.passwordConfirm.value = "";
          baoLoi(loi, err.message); // ALREADY_EXISTS, 429, mất mạng...
        }
      },
      { signal },
    );
  }

  buoc1();
}
