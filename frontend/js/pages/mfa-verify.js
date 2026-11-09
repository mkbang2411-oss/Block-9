// F7 (giao diện ban đêm như Block 8): bước 2 đăng nhập khi đã bật MFA -> POST /api/auth/mfa/verify { challenge, code | recoveryCode }
// challenge sống 5 phút, chỉ nằm trong BỘ NHỚ (state.js): F5 ở trang này là phải đăng nhập lại.
import { api, ApiError } from "../api.js";
import { getChallenge, clearChallenge, setSession, dichMacDinh } from "../state.js";
import { navigate } from "../router.js";
import { $, bao, esc } from "../utils.js";
import { khungDem, truongDem, nutDem, cho, datChuNut, xoaLoiDem, hienLoiDem, baoLoi, demNguoc, mmss, safeNext, nextQs, ganDem, otpHtml, noiOtp } from "./auth-ui.js";
import { fxCho } from "./login.js";

export async function load(ctx) {
  const next = safeNext(ctx.query);
  if (!getChallenge()) return { redirect: "/login" + (next ? "?next=" + encodeURIComponent(next) : "") };
  return {
    title: "Xác thực hai bước",
    am: "quan",
    html: khungDem({
      tab: "none",
      tieuDe: "Xác thực hai bước",
      phu: "Mở ứng dụng Authenticator và nhập mã 6 số.",
      noiDung: `<div class="bao-loi" id="loi" role="alert" hidden></div>
      <form id="form" novalidate>
        <div id="o-code" data-field="code">
          ${otpHtml("code", "Mã 6 số từ ứng dụng Authenticator")}
          <small class="dn-loi giua" id="loi-code" role="alert"></small>
        </div>
        <div id="o-rec" hidden>
          ${truongDem({ name: "recoveryCode", label: "Mã khôi phục", ac: "off", placeholder: "XXXXX-XXXXX", extra: 'maxlength="40" spellcheck="false"', goiY: "Mỗi mã khôi phục chỉ dùng được một lần." })}
        </div>
        ${nutDem("Xác nhận")}
        <div class="dn-phu-hang"><button type="button" class="dn-lk" id="doi">Dùng mã khôi phục</button></div>
      </form>`,
      chan: `<a href="/login${esc(nextQs(next))}" id="huy">← Hủy, quay lại đăng nhập</a>`,
    }),
    mount: (root, c) => mount(root, c, next),
  };
}

function mount(root, ctx, next) {
  const { signal } = ctx;
  ganDem(root, signal);
  const form = $("#form", root), loi = $("#loi", root), nut = $("#nut", root);
  const oCode = $("#o-code", root), oRec = $("#o-rec", root), doi = $("#doi", root);
  const otp = noiOtp($(".dn-otp", root), { signal, loiEl: $("#loi-code", root) });
  let dungRec = false, khoa = false;
  otp.focus();

  // rời trang bằng cách khác ngoài đăng nhập thành công (Hủy, Back...) thì bỏ challenge
  signal.addEventListener("abort", () => getChallenge() && clearChallenge(), { once: true });

  doi.addEventListener(
    "click",
    () => {
      dungRec = !dungRec;
      oCode.hidden = dungRec;
      oRec.hidden = !dungRec;
      doi.textContent = dungRec ? "Dùng mã từ ứng dụng" : "Dùng mã khôi phục";
      $(".dn-phu", root).textContent = dungRec ? "Nhập một mã khôi phục chưa dùng." : "Mở ứng dụng Authenticator và nhập mã 6 số.";
      xoaLoiDem(form);
      otp.clear();
      loi.hidden = true;
      dungRec ? form.recoveryCode.focus() : otp.focus();
    },
    { signal },
  );

  const veDangNhap = (msg) => {
    clearChallenge();
    navigate("/login" + nextQs(next), { replace: true, flash: msg });
  };

  form.addEventListener(
    "submit",
    async (e) => {
      e.preventDefault();
      if (khoa) return;
      xoaLoiDem(form);
      loi.hidden = true;
      const code = otp.value(), rec = form.recoveryCode.value.trim();
      if (!dungRec && !/^\d{6}$/.test(code)) {
        otp.danhDauLoi("Nhập đủ 6 chữ số");
        return otp.focus();
      }
      if (dungRec && !rec) return hienLoiDem(form, { recoveryCode: "Vui lòng nhập mã khôi phục" });

      cho(nut, true);
      try {
        const d = await api.auth.mfaVerify({ challenge: getChallenge(), ...(dungRec ? { recoveryCode: rec } : { code }) });
        setSession(d); // setSession cũng xóa challenge
        const to = next || dichMacDinh(d.user);
        navigate(to, {
          fx: fxCho(to),
          flash: d.recoveryUsed ? `Đã dùng một mã khôi phục, bạn còn ${d.recoveryRemaining} mã.` : null,
        });
      } catch (err) {
        if (!(err instanceof ApiError)) throw err;
        cho(nut, false);
        // challenge sai / hết hạn (5 phút): phải nhập lại mật khẩu
        if (err.status === 401) return veDangNhap("Phiên xác thực đã hết hạn, vui lòng đăng nhập lại.");
        if (err.code === "VALIDATION_FAILED" && Object.keys(err.fields).length) {
          if (!dungRec) return otp.danhDauLoi(Object.values(err.fields)[0]);
          return hienLoiDem(form, err.fields);
        }
        if (err.code === "INVALID_MFA_CODE") {
          if (dungRec) {
            form.recoveryCode.value = "";
            form.recoveryCode.focus();
          } else {
            otp.clear();
            otp.focus();
          }
          return baoLoi(
            loi,
            dungRec
              ? err.message
              : err.message + " Nếu vừa nhập mã này, hãy chờ mã mới của ứng dụng (mỗi mã chỉ dùng một lần).",
          );
        }
        baoLoi(loi, err.message);
        if (err.status === 429) {
          khoa = true;
          nut.disabled = true;
          demNguoc(err.details.lockedSeconds || err.retryAfter || 60, {
            signal,
            onTick: (g) => datChuNut(nut, `Thử lại sau ${mmss(g)}`),
            onDone: () => ((khoa = false), (nut.disabled = false), datChuNut(nut, "Xác nhận"), (loi.hidden = true)),
          });
        }
      }
    },
    { signal },
  );
}
