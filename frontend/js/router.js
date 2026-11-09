// Router phía client (client-side routing): đổi màn hình bằng History API, KHÔNG tải lại trang.
// Mỗi route có hàm load(ctx) trả về một "view": { title, am, html, mount?(root, ctx) }.
//   ctx = { path, params, query (URLSearchParams), signal }  (signal bị hủy khi rời màn hình đó)
// Server phải trả index.html cho mọi đường dẫn không phải /api và không phải file tĩnh (xem API.md mục 7),
// nếu không thì gõ thẳng /admin/dishes hoặc F5 sẽ bị 404.
import { ApiError } from "./api.js";
import { getMe } from "./state.js";
import { chonFx, phuMan, moMan, huyPhu } from "./effects.js";
import { dongHetHop, bao } from "./utils.js";
import { errorView } from "./pages/error.js";

const routes = [];
let appEl;
let hienTai = null; // { ac } của màn hình đang hiển thị
let navId = 0; // số thứ tự lần điều hướng, để bỏ qua kết quả của lần cũ
let dangChuyen = false;

// addRoute("/admin/dishes", load, { auth: true })  auth: phải đăng nhập (kiểm bằng /api/auth/me, role thật từ server).
// Đây CHỈ là lớp giao diện (đỡ tải trang vô ích): mọi quyền vẫn do server kiểm ở từng request (RBAC/ABAC).
export function addRoute(pattern, load, { auth } = {}) {
  const keys = [];
  const re = new RegExp(
    "^" +
      pattern.replace(/:(\w+)/g, (_, k) => (keys.push(k), "([^/]+)")) +
      "/?$",
  );
  routes.push({ re, keys, load, auth });
}

function khop(path) {
  for (const r of routes) {
    const m = r.re.exec(path);
    if (m)
      return {
        route: r,
        params: Object.fromEntries(
          r.keys.map((k, i) => [k, decodeURIComponent(m[i + 1])]),
        ),
      };
  }
  return null;
}

const dangNhapUrl = (url) =>
  "/login?next=" + encodeURIComponent(url.pathname + url.search);

// Tạo view cho một URL. Lỗi API được đổi thành màn hình lỗi tương ứng (404, 403, mất kết nối...)
async function taoView(url, ctx) {
  const found = khop(url.pathname);
  if (!found)
    return errorView(404, "Không tìm thấy trang hoặc dữ liệu bạn yêu cầu.");
  ctx.params = found.params;
  try {
    if (found.route.auth && !(await getMe())) return { redirect: dangNhapUrl(url) };
    return await found.route.load(ctx);
  } catch (e) {
    if (!(e instanceof ApiError)) {
      console.error(e);
      return errorView(500, "Có lỗi xảy ra phía giao diện.");
    }
    // 401: thiếu / sai / hết hạn token (api.js đã xóa token và ghi thông báo) -> về đăng nhập, xong quay lại trang này
    if (e.code === "UNAUTHENTICATED" || e.code === "TOKEN_EXPIRED")
      return { redirect: dangNhapUrl(url) };
    // 403: đã đăng nhập nhưng không đủ quyền: báo, GIỮ token
    if (e.code === "FORBIDDEN") return errorView(403, e.message || "Bạn không đủ quyền thực hiện thao tác này.");
    // 429: bị giới hạn tốc độ
    if (e.status === 429)
      return errorView(429, e.message || "Bạn thao tác quá nhanh, vui lòng thử lại sau.", true);
    // NOT_FOUND nghiệp vụ (API trả 200 + ok:false): không có bản ghi -> màn hình "không tìm thấy"
    if (e.code === "NOT_FOUND") return errorView(404, e.message);
    // gọi sai URL API (HTTP 404 kỹ thuật) KHÔNG phải NOT_FOUND nghiệp vụ -> thông báo lỗi chung
    if (e.code === "ROUTE_NOT_FOUND")
      return errorView(
        500,
        "Không gọi được API (đường dẫn API không đúng). Vui lòng thử lại sau.",
        true,
      );
    // lỗi kỹ thuật khác (500, mất kết nối...) hoặc lỗi nghiệp vụ không lường trước (status 200)
    return errorView(e.status === 200 ? 400 : e.status, e.message, true);
  }
}

// to: "/đường/dẫn?query"; fx: hiệu ứng chuyển cảnh (xem effects.js); flash: thông báo hiện sau khi chuyển xong
export async function navigate(
  to,
  { replace = false, fx = null, flash = null, fromPop = false } = {},
) {
  if (dangChuyen) return;
  const url = new URL(to, location.origin);
  const my = ++navId;
  if (fx) dangChuyen = true;
  const ctx = {
    path: url.pathname,
    query: url.searchParams,
    params: {},
    ac: new AbortController(),
  };
  ctx.signal = ctx.ac.signal;
  document.body.classList.add("dang-tai");
  let h = null;
  try {
    // hiệu ứng phủ màn hình và tải dữ liệu chạy song song, xong cả hai mới đổi màn hình
    const [phu, view] = await Promise.all([phuMan(fx), taoView(url, ctx)]);
    h = phu;
    if (my !== navId) {
      ctx.ac.abort();
      huyPhu(h);
      return;
    }
    if (view.redirect) {
      ctx.ac.abort();
      huyPhu(h);
      dangChuyen = false;
      return navigate(view.redirect, { replace: true });
    }
    if (!fromPop) {
      const dich = url.pathname + url.search;
      if (replace || dich === location.pathname + location.search)
        history.replaceState(null, "", dich);
      else history.pushState(null, "", dich);
    }
    hienThi(view, ctx, fx);
    moMan(h);
    if (flash) bao(flash);
  } finally {
    dangChuyen = false;
    document.body.classList.remove("dang-tai");
  }
}

function hienThi(view, ctx, fx) {
  if (hienTai) hienTai.ac.abort(); // gỡ mọi listener / timer của màn hình cũ
  dongHetHop();
  document.title = view.title;
  document.body.dataset.am = view.am || "quan";
  appEl.innerHTML = view.html;
  hienTai = ctx;
  // chuyển bằng đĩa trắng rồi thì không cần hiệu ứng trượt vào của riêng màn hình (như bản cũ)
  if (fx && fx.type === "dia")
    appEl.querySelector(".vao-tu-duoi")?.classList.remove("vao-tu-duoi");
  try {
    view.mount?.(appEl, ctx);
  } catch (e) {
    console.error(e);
  }
}

export function start(el) {
  appEl = el;
  // bấm link nội bộ -> điều hướng SPA thay vì tải trang
  document.addEventListener("click", (e) => {
    if (
      e.defaultPrevented ||
      e.button !== 0 ||
      e.metaKey ||
      e.ctrlKey ||
      e.shiftKey ||
      e.altKey
    )
      return;
    const a = e.target.closest && e.target.closest("a[href]");
    if (
      !a ||
      a.target === "_blank" ||
      a.hasAttribute("download") ||
      a.classList.contains("tat")
    )
      return;
    const u = new URL(a.href, location.href);
    if (u.origin !== location.origin || u.pathname.startsWith("/api/")) return;
    e.preventDefault();
    navigate(u.pathname + u.search, {
      fx: chonFx(location.pathname, u.pathname, a),
    });
  });
  // nút Back / Forward của trình duyệt
  addEventListener("popstate", () =>
    navigate(location.pathname + location.search, { fromPop: true }),
  );
  navigate(location.pathname + location.search, {
    replace: true,
    fromPop: true,
  });
}
