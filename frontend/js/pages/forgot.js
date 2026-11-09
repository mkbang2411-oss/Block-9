// F6: quên mật khẩu -> POST /api/auth/forgot-password { email }  (giao diện ban đêm như Block 8)
// Server luôn trả thành công (email có hay không có tài khoản đều y hệt) nên trang cũng chỉ nói chung chung.
import { api, ApiError } from "../api.js";
import { $, esc } from "../utils.js";
import { khungDem, truongDem, nutDem, cho, datChuNut, xoaLoiDem, hienLoiDem, baoLoi, demNguoc, ganDem } from "./auth-ui.js";

const TICK = `<svg viewBox="0 0 64 64" width="64" height="64" aria-hidden="true"><circle cx="32" cy="32" r="29" fill="none" stroke="currentColor" stroke-width="3.5"/><path d="m19 33 9 9 18-20" fill="none" stroke="currentColor" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/></svg>`;

export async function load() {
  return {
    title: "Quên mật khẩu",
    am: "quan",
    html: khungDem({
      tab: "login",
      tieuDe: "Quên mật khẩu",
      phu: "Nhập email đã đăng ký, chúng tôi sẽ gửi một đường link để bạn đặt lại mật khẩu.",
      noiDung: `<div id="dau">
        <div class="bao-loi" id="loi" role="alert" hidden></div>
        <form id="form" class="dn-q" novalidate>
          ${truongDem({ name: "email", label: "Địa chỉ email", type: "email", ac: "username", placeholder: "ten@email.com", extra: "required" })}
          ${nutDem("Gửi link đặt lại mật khẩu")}
        </form>
      </div>
      <div class="dn-xong" id="xong" hidden>
        ${TICK}
        <h2 class="dn-tieude">Hãy kiểm tra email</h2>
        <p class="dn-phu" id="xong-phu"></p>
        <p class="bao-ok" id="ok" role="status" hidden></p>
        <div class="dn-phu-hang">
          <button type="button" class="dn-lk" id="doi-mail">← Đổi email</button>
          <button type="button" class="dn-lk" id="gui-lai" disabled>Gửi lại link</button>
        </div>
      </div>`,
      chan: `<a href="/login">← Quay lại đăng nhập</a>`,
    }),
    mount,
  };
}

function mount(root, ctx) {
  const { signal } = ctx;
  ganDem(root, signal);
  const form = $("#form", root), loi = $("#loi", root), nut = $("#nut", root);
  const dau = $("#dau", root), xong = $("#xong", root), ok = $("#ok", root), lai = $("#gui-lai", root);
  const tieuDe = $(".dn-pane > .dn-tieude", root), phu = $(".dn-pane > .dn-phu", root);
  let email = "", dung = null;

  const dem = (giay) => {
    dung?.();
    dung = demNguoc(giay, {
      signal,
      onTick: (g) => ((lai.disabled = true), (lai.textContent = `Gửi lại link sau ${g}s`)),
      onDone: () => ((lai.disabled = false), (lai.textContent = "Gửi lại link")),
    });
  };
  const hien = (daGui) => {
    dau.hidden = daGui;
    xong.hidden = !daGui;
    tieuDe.hidden = phu.hidden = daGui; // đã gửi: tiêu đề "Hãy kiểm tra email" nằm trong khối .dn-xong
    if (daGui)
      $("#xong-phu", root).innerHTML = `Nếu <b>${esc(email)}</b> đã đăng ký, chúng tôi vừa gửi một email chứa link đặt lại mật khẩu (hiệu lực 30 phút). Nhớ xem cả mục Spam.`;
    else setTimeout(() => !signal.aborted && form.email.focus({ preventScroll: true }), 60);
  };

  form.addEventListener(
    "submit",
    async (e) => {
      e.preventDefault();
      xoaLoiDem(form);
      loi.hidden = true;
      const v = form.email.value.trim();
      if (!v) return hienLoiDem(form, { email: "Vui lòng nhập email" });
      cho(nut, true);
      try {
        const d = await api.auth.forgot({ email: v });
        email = v;
        cho(nut, false);
        ok.hidden = true;
        hien(true);
        dem(d.cooldown || 60);
      } catch (err) {
        if (!(err instanceof ApiError)) throw err;
        cho(nut, false);
        if (err.code === "VALIDATION_FAILED" && hienLoiDem(form, err.fields)) return;
        baoLoi(loi, err.message); // 429, 502 EMAIL_SEND_FAILED, mất mạng
      }
    },
    { signal },
  );

  lai.addEventListener(
    "click",
    async () => {
      lai.disabled = true;
      ok.hidden = true;
      try {
        const d = await api.auth.forgot({ email });
        ok.textContent = "Nếu email đã đăng ký, link mới đã được gửi.";
        ok.hidden = false;
        dem(d.cooldown || 60);
      } catch (err) {
        if (!(err instanceof ApiError)) throw err;
        ok.textContent = err.message || "Không gửi được link.";
        ok.hidden = false;
        dem(err.status === 429 ? err.retryAfter || 15 : 5);
      }
    },
    { signal },
  );
  $("#doi-mail", root).addEventListener("click", () => (dung?.(), hien(false)), { signal });
}
