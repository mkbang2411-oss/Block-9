// F8: trang bảo mật tài khoản  /account/security  (cần đăng nhập)
//  - MFA đang tắt  : Bật -> POST /mfa/setup -> quét QR -> nhập mã 6 số -> POST /mfa/enable -> HIỆN 10 mã khôi phục MỘT LẦN
//  - MFA đang bật  : xem số mã khôi phục còn lại / tạo lại mã khôi phục / đổi thiết bị / tắt MFA
//                    (mọi thao tác nhạy cảm hỏi lại MẬT KHẨU + mã 6 số hoặc mã khôi phục; server kiểm ở từng request)
// Lưu ý an toàn:
//  - enable / disable tăng tokenVersion nên server trả accessToken MỚI -> replaceToken() ngay, không thì lần gọi sau bị 401.
//  - Khóa TOTP, mã khôi phục chỉ nằm trong biến của trang này (bộ nhớ), KHÔNG ghi localStorage; rời trang là mất.
//  - Server chỉ giữ hash mã khôi phục nên KHÔNG có chuyện "xem lại mã cũ": muốn có mã mới thì tạo lại (mã cũ vô hiệu).
//  - 401 -> api.js đã xóa phiên, về /login rồi quay lại đây. 403/429/mất mạng KHÔNG đăng xuất.
//  - Mọi dữ liệu đưa vào innerHTML đều qua esc().
import { api, ApiError } from "../api.js";
import { getMe, replaceToken } from "../state.js";
import { navigate } from "../router.js";
import { $, esc, bao } from "../utils.js";
import { khung, truong, xoaLoi, hienLoi, baoLoi, demNguoc, mmss } from "./auth-ui.js";

const DUONG_DAN = "/account/security";
const TEN_FILE = "ma-khoi-phuc-cai-quan-an.txt";

export async function load() {
  // 401 / mất mạng ở đây do router xử lý (về /login hoặc màn hình lỗi có nút Thử lại)
  const [me, st] = await Promise.all([getMe(), api.mfa.status()]);
  if (!me) return { redirect: "/login?next=" + encodeURIComponent(DUONG_DAN) };
  return {
    title: "Bảo mật tài khoản",
    am: "quan",
    html: khung({
      tab: "none",
      tieuDe: "Bảo mật tài khoản",
      phu: `${me.name ? me.name + " · " : ""}${me.email}`,
      rong: true,
      noiDung: `<div id="bm"></div>`,
    }),
    mount: (root, ctx) => mount(root, ctx, st),
  };
}

// ---------------------------------------------------------------- tiện ích nhỏ
const nhomKhoa = (s) => String(s || "").replace(/\s+/g, "").replace(/(.{4})/g, "$1 ").trim(); // ABCD EFGH ...
const ngay = (iso) => {
  const d = new Date(iso);
  return isNaN(d) ? "" : d.toLocaleDateString("vi-VN");
};
const qrHopLe = (u) => typeof u === "string" && /^data:image\/(png|svg\+xml);base64,[A-Za-z0-9+/=]+$/.test(u);

async function chepVaoBoNho(text) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch (e) {
    return false; // trình duyệt chặn clipboard: người dùng vẫn có nút Tải về
  }
}
function taiVe(codes) {
  const noiDung =
    `Mã khôi phục xác thực hai bước - Cái Quán Ăn\n` +
    `Tạo ngày ${new Date().toLocaleDateString("vi-VN")}. Mỗi mã chỉ dùng được MỘT lần. Hãy cất ở nơi an toàn.\n\n` +
    codes.join("\n") +
    "\n";
  const url = URL.createObjectURL(new Blob([noiDung], { type: "text/plain;charset=utf-8" }));
  const a = Object.assign(document.createElement("a"), { href: url, download: TEN_FILE });
  document.body.append(a);
  a.click(); // router bỏ qua <a download>, không bị coi là điều hướng SPA
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

// ---------------------------------------------------------------- mount: máy trạng thái của trang
function mount(root, ctx, st0) {
  const { signal } = ctx;
  const bm = $("#bm", root);
  let enabled = !!st0.enabled;
  let dungDemNguoc = null; // hàm dừng đếm ngược (429) của màn hình hiện tại

  const hien = (html, gan) => {
    dungDemNguoc?.();
    dungDemNguoc = null;
    bm.innerHTML = html;
    gan?.();
    bm.querySelector("input:not([type=checkbox]):not([hidden]), button.nut")?.focus?.();
  };
  signal.addEventListener("abort", () => dungDemNguoc?.(), { once: true });

  const vaoDau = () => (enabled ? veDangBat() : veDangTat());

  // lỗi dùng chung của mọi form gọi API ở trang này. Trả true nếu đã xử lý (khi cần đổi màn hình thì tự đổi)
  function xuLyLoi(err, { form, loi, nut, nhan }) {
    if (!(err instanceof ApiError)) throw err;
    if (nut) nut.disabled = false;
    if (err.status === 401) {
      // api.js đã xóa phiên + ghi thông báo; đăng nhập xong quay lại đúng trang này
      navigate("/login?next=" + encodeURIComponent(DUONG_DAN), { replace: true });
      return;
    }
    if (err.code === "VALIDATION_FAILED" && form && hienLoi(form, err.fields)) return;
    if (err.code === "INVALID_CREDENTIALS" && form) {
      if (form.elements.password) form.elements.password.value = "";
      if (hienLoi(form, { password: err.message })) return;
    }
    if (err.code === "INVALID_MFA_CODE") {
      ["code", "recoveryCode"].forEach((n) => form?.elements[n] && (form.elements[n].value = ""));
      return baoLoi(
        loi,
        err.message + " Nếu vừa dùng mã này, hãy chờ mã mới của ứng dụng (mỗi mã chỉ dùng được một lần).",
      );
    }
    if (err.code === "MFA_NOT_ENABLED") {
      enabled = false; // trạng thái trên màn hình đã cũ (vd tắt ở tab khác)
      bao(err.message);
      return veDangTat();
    }
    if (err.code === "MFA_SETUP_REQUIRED") {
      bao("Phiên cài đặt đã hết, hãy bắt đầu lại.");
      return vaoDau();
    }
    baoLoi(loi, err.message);
    if (err.status === 429 && nut) {
      nut.disabled = true;
      dungDemNguoc = demNguoc(err.details.lockedSeconds || err.retryAfter || 60, {
        signal,
        onTick: (g) => (nut.textContent = `Thử lại sau ${mmss(g)}`),
        onDone: () => ((nut.disabled = false), (nut.textContent = nhan), (loi.hidden = true)),
      });
    }
  }

  // ---------------- MFA đang TẮT
  function veDangTat() {
    hien(
      `<p><span class="the het">Đang tắt</span></p>
      <p>Xác thực hai bước thêm một lớp bảo vệ: ngoài mật khẩu, mỗi lần đăng nhập bạn nhập thêm mã 6 số từ ứng dụng Authenticator trên điện thoại (Google Authenticator, Microsoft Authenticator, Authy...).</p>
      <div class="bao-loi" id="loi" role="alert" hidden></div>
      <div class="nut-hang"><button type="button" class="nut" id="bat">Bật xác thực hai bước</button></div>`,
      () => {
        const nut = $("#bat", bm), loi = $("#loi", bm);
        nut.addEventListener(
          "click",
          async () => {
            nut.disabled = true;
            loi.hidden = true;
            try {
              veQuet(await api.mfa.setup(), "bat");
            } catch (err) {
              xuLyLoi(err, { loi, nut, nhan: "Bật xác thực hai bước" });
            }
          },
          { signal },
        );
      },
    );
  }

  // ---------------- quét QR + nhập mã 6 số (bật lần đầu hoặc đổi thiết bị)
  function veQuet(s, kieu) {
    const doi = kieu === "doi";
    hien(
      `<p><span class="the het">${doi ? "Đổi thiết bị" : "Đang cài đặt"}</span></p>
      <ol class="bm-buoc">
        <li>Mở ứng dụng Authenticator, chọn thêm tài khoản rồi <b>quét mã QR</b> bên dưới.</li>
        <li>Không quét được? Nhập khóa này vào ứng dụng bằng tay: <code class="bm-khoa">${esc(nhomKhoa(s.secret))}</code></li>
        <li>Nhập mã 6 số mà ứng dụng đang hiện để xác nhận.</li>
      </ol>
      ${qrHopLe(s.qrDataUrl) ? `<div class="bm-qr"><img src="${s.qrDataUrl}" width="220" height="220" alt="Mã QR để thêm tài khoản vào ứng dụng Authenticator"></div>` : `<p class="bao-loi">Không hiển thị được mã QR, hãy nhập khóa bằng tay.</p>`}
      ${doi ? `<p class="phu-chu-nho">Thiết bị cũ vẫn dùng được cho tới khi bạn xác nhận xong bước này.</p>` : ""}
      <form id="form" novalidate>
        <div class="bao-loi" id="loi" role="alert" hidden></div>
        <div class="truong" data-field="code">
          <label for="f-code">Mã 6 số</label>
          <input id="f-code" name="code" inputmode="numeric" autocomplete="one-time-code" maxlength="6" pattern="[0-9]{6}" class="o-so">
        </div>
        <div class="nut-hang">
          <button type="button" class="nut nut-phu" id="lui">Hủy</button>
          <button class="nut" id="nut">Xác nhận và bật</button>
        </div>
      </form>`,
      () => {
        const form = $("#form", bm), loi = $("#loi", bm), nut = $("#nut", bm);
        $("#lui", bm).addEventListener("click", vaoDau, { signal }); // khóa "chờ" bỏ dở không ảnh hưởng MFA hiện có
        form.addEventListener(
          "submit",
          async (e) => {
            e.preventDefault();
            xoaLoi(form);
            loi.hidden = true;
            const code = form.elements.code.value.replace(/\s+/g, "");
            if (!/^\d{6}$/.test(code)) return hienLoi(form, { code: "Nhập đủ 6 chữ số" });
            nut.disabled = true;
            try {
              const d = await api.mfa.enable({ code });
              replaceToken(d.accessToken, d.user); // token cũ đã chết (tokenVersion + 1)
              enabled = true;
              if (d.recoveryCodes && d.recoveryCodes.length) veMaKhoiPhuc(d.recoveryCodes, "bat");
              else {
                bao("Đã chuyển sang thiết bị mới.");
                veDangBat();
              }
            } catch (err) {
              xuLyLoi(err, { form, loi, nut, nhan: "Xác nhận và bật" });
            }
          },
          { signal },
        );
      },
    );
  }

  // ---------------- hiện mã khôi phục MỘT LẦN
  function veMaKhoiPhuc(codes, kieu) {
    hien(
      `<p><span class="the ok">${kieu === "bat" ? "Đã bật xác thực hai bước" : "Đã tạo mã khôi phục mới"}</span></p>
      <div class="bao-loi" role="alert"><b>Lưu các mã này ngay.</b> Mã chỉ hiện <b>một lần</b>, mỗi mã dùng được một lần khi bạn mất điện thoại. ${kieu === "tao-lai" ? "Các mã cũ đã bị vô hiệu." : ""}</div>
      <ol class="bm-ma">${codes.map((c) => `<li><code>${esc(c)}</code></li>`).join("")}</ol>
      <div class="nut-hang bm-hanh-dong">
        <button type="button" class="nut nut-phu" id="chep">Sao chép</button>
        <button type="button" class="nut nut-phu" id="tai">Tải về (.txt)</button>
      </div>
      <label class="check"><input type="checkbox" id="da-luu"> Tôi đã lưu các mã này ở nơi an toàn</label>
      <div class="nut-hang"><button type="button" class="nut" id="xong" disabled>Xong</button></div>`,
      () => {
        const xong = $("#xong", bm);
        $("#da-luu", bm).addEventListener("change", (e) => (xong.disabled = !e.target.checked), { signal });
        $("#chep", bm).addEventListener(
          "click",
          async () => bao((await chepVaoBoNho(codes.join("\n"))) ? "Đã sao chép các mã." : "Không sao chép được, hãy dùng nút Tải về."),
          { signal },
        );
        $("#tai", bm).addEventListener("click", () => taiVe(codes), { signal });
        xong.addEventListener("click", () => ((codes = null), veDangBat()), { signal });
      },
    );
  }

  // ---------------- MFA đang BẬT
  function veDangBat() {
    hien(
      `<p><span class="the ok">Đang bật</span></p>
      <p>Mỗi lần đăng nhập bạn cần thêm mã 6 số từ ứng dụng Authenticator (hoặc một mã khôi phục).</p>
      <ul class="bm-viec">
        <li><button type="button" class="nut nut-phu" data-viec="trang-thai">Xem số mã khôi phục còn lại</button></li>
        <li><button type="button" class="nut nut-phu" data-viec="tao-lai">Tạo lại mã khôi phục</button></li>
        <li><button type="button" class="nut nut-phu" data-viec="doi">Đổi thiết bị xác thực</button></li>
        <li><button type="button" class="nut nut-phu" data-viec="tat">Tắt xác thực hai bước</button></li>
      </ul>
      <p class="phu-chu-nho">Các thao tác trên đều hỏi lại mật khẩu và một mã xác thực.</p>`,
      () => {
        bm.querySelectorAll("[data-viec]").forEach((b) =>
          b.addEventListener("click", () => veXacThucLai(b.dataset.viec), { signal }),
        );
      },
    );
  }

  // ---------------- hỏi lại mật khẩu + mã (xác thực lại) cho 4 thao tác nhạy cảm
  const VIEC = {
    "trang-thai": {
      tieuDe: "Xem số mã khôi phục còn lại",
      mo: "Nhập mật khẩu và một mã xác thực. Hệ thống chỉ lưu dấu vết của mã nên không thể hiện lại các mã cũ.",
      nhan: "Xem",
      goi: (r) => api.mfa.recoveryStatus(r),
      xong: (d) => veTrangThaiMa(d),
    },
    "tao-lai": {
      tieuDe: "Tạo lại mã khôi phục",
      mo: "Bộ mã mới sẽ thay thế toàn bộ mã cũ (mã cũ vô hiệu ngay).",
      nhan: "Tạo mã mới",
      goi: (r) => api.mfa.recoveryRegenerate(r),
      xong: (d) => veMaKhoiPhuc(d.recoveryCodes, "tao-lai"),
    },
    doi: {
      tieuDe: "Đổi thiết bị xác thực",
      mo: "Dùng khi đổi điện thoại. Bạn sẽ quét một mã QR mới; thiết bị cũ vẫn dùng được cho tới khi xác nhận xong.",
      nhan: "Tiếp tục",
      goi: (r) => api.mfa.setup(r),
      xong: (d) => veQuet(d, "doi"),
    },
    tat: {
      tieuDe: "Tắt xác thực hai bước",
      mo: "Sau khi tắt, đăng nhập chỉ cần mật khẩu và toàn bộ mã khôi phục sẽ bị xóa. Bạn nên cân nhắc kỹ.",
      nhan: "Tắt xác thực",
      goi: (r) => api.mfa.disable(r),
      xong: (d) => {
        replaceToken(d.accessToken, d.user); // tokenVersion + 1
        enabled = false;
        bao("Đã tắt xác thực hai bước.");
        veDangTat();
      },
    },
  };

  function veXacThucLai(viec) {
    const v = VIEC[viec];
    hien(
      `<h3>${esc(v.tieuDe)}</h3>
      <p class="phu-chu">${esc(v.mo)}</p>
      <form id="form" novalidate>
        <div class="bao-loi" id="loi" role="alert" hidden></div>
        ${truong({ name: "password", label: "Mật khẩu hiện tại", type: "password", ac: "current-password", extra: "required" })}
        <div class="truong" data-field="code" id="o-code">
          <label for="f-code">Mã 6 số</label>
          <input id="f-code" name="code" inputmode="numeric" autocomplete="one-time-code" maxlength="6" pattern="[0-9]{6}" class="o-so">
        </div>
        <div class="truong" data-field="recoveryCode" id="o-rec" hidden>
          <label for="f-rec">Mã khôi phục</label>
          <input id="f-rec" name="recoveryCode" autocomplete="off" maxlength="40" placeholder="XXXXX-XXXXX" class="o-so">
          <small class="phu-chu-nho">Dùng mã khôi phục sẽ làm mã đó mất hiệu lực.</small>
        </div>
        <p class="phu-chu-nho"><a href="#" id="doi">Dùng mã khôi phục</a></p>
        <div class="nut-hang">
          <button type="button" class="nut nut-phu" id="lui">Quay lại</button>
          <button class="nut" id="nut">${esc(v.nhan)}</button>
        </div>
      </form>`,
      () => {
        const form = $("#form", bm), loi = $("#loi", bm), nut = $("#nut", bm);
        const oCode = $("#o-code", bm), oRec = $("#o-rec", bm), doi = $("#doi", bm);
        let dungRec = false;
        $("#lui", bm).addEventListener("click", vaoDau, { signal });
        doi.addEventListener(
          "click",
          (e) => {
            e.preventDefault(); // không để router coi là điều hướng
            dungRec = !dungRec;
            oCode.hidden = dungRec;
            oRec.hidden = !dungRec;
            doi.textContent = dungRec ? "Dùng mã từ ứng dụng" : "Dùng mã khôi phục";
            xoaLoi(form);
            loi.hidden = true;
            $("input", dungRec ? oRec : oCode).focus();
          },
          { signal },
        );
        form.addEventListener(
          "submit",
          async (e) => {
            e.preventDefault();
            xoaLoi(form);
            loi.hidden = true;
            const password = form.elements.password.value;
            const code = form.elements.code.value.replace(/\s+/g, "");
            const rec = form.elements.recoveryCode.value.trim();
            const thieu = {};
            if (!password) thieu.password = "Vui lòng nhập mật khẩu hiện tại";
            if (!dungRec && !/^\d{6}$/.test(code)) thieu.code = "Nhập đủ 6 chữ số";
            if (dungRec && !rec) thieu.recoveryCode = "Vui lòng nhập mã khôi phục";
            if (Object.keys(thieu).length) return hienLoi(form, thieu);
            nut.disabled = true;
            try {
              const d = await v.goi({ password, ...(dungRec ? { recoveryCode: rec } : { code }) });
              v.xong(d);
            } catch (err) {
              xuLyLoi(err, { form, loi, nut, nhan: v.nhan });
            }
          },
          { signal },
        );
      },
    );
  }

  // ---------------- kết quả "xem số mã khôi phục còn lại"
  function veTrangThaiMa(d) {
    const it = d.remaining <= 2;
    hien(
      `<h3>Mã khôi phục</h3>
      <p>Còn <b>${esc(d.remaining)}</b> / ${esc(d.total)} mã chưa dùng${d.createdAt ? ` (tạo ngày ${esc(ngay(d.createdAt))})` : ""}.</p>
      ${it ? `<p class="bao-loi" role="alert">Bạn sắp hết mã khôi phục. Hãy tạo bộ mã mới để không bị khóa khỏi tài khoản khi mất điện thoại.</p>` : ""}
      <div class="nut-hang">
        ${it ? `<button type="button" class="nut" id="tao">Tạo lại mã khôi phục</button>` : ""}
        <button type="button" class="nut nut-phu" id="lui">Quay lại</button>
      </div>`,
      () => {
        $("#lui", bm).addEventListener("click", veDangBat, { signal });
        $("#tao", bm)?.addEventListener("click", () => veXacThucLai("tao-lai"), { signal });
      },
    );
  }

  vaoDau();
}
