// Mọi lời gọi REST API đi qua file này. Các trang chỉ gọi api.xxx(), không tự fetch.
// Quy ước (xem API.md) - lớp này kiểm tra BA TẦNG trước khi trả dữ liệu cho trang:
//   1) có nhận được response không        (không -> ApiError code NETWORK_ERROR, status 0)
//   2) HTTP status có thành công không     (không -> lỗi kỹ thuật: 404 sai URL, 500 hỏng hệ thống... code lấy từ body nếu có)
//   3) trường ok trong body là true/false  (ok:false -> lỗi nghiệp vụ: NOT_FOUND, VALIDATION_FAILED... kèm fields)
// Các trang xử lý lỗi dựa vào err.code (không so sánh câu chữ err.message).
import { API_BASE } from "./config.js";
import { getToken, clearSession, setNotice } from "./session.js";

export class ApiError extends Error {
  constructor({ status = 0, code, message, fields, details, retryAfter } = {}) {
    super(message || "Có lỗi xảy ra, vui lòng thử lại.");
    this.status = status; // HTTP status; 0 = không kết nối được máy chủ
    this.code = code || (status === 0 ? "NETWORK_ERROR" : "UNKNOWN");
    this.fields = fields || {}; // { tênTrường: "thông báo lỗi" } (VALIDATION_FAILED)
    this.details = details || {}; // dữ liệu thêm: needCaptcha, lockedSeconds...
    this.retryAfter = retryAfter || 0; // giây, từ header Retry-After (429)
  }
}

// auth:false = lời gọi công khai (đăng nhập, đăng ký...): không gắn Authorization
async function request(method, path, { query, json, form, signal, auth = true } = {}) {
  let url = API_BASE + path;
  if (query) {
    const qs = new URLSearchParams();
    Object.entries(query).forEach(([k, v]) => {
      if (v !== undefined && v !== null && v !== "") qs.set(k, v);
    });
    if ([...qs].length) url += "?" + qs;
  }
  const opts = {
    method,
    headers: { Accept: "application/json" },
    // Block 9 không dùng cookie: không có credentials, không có CSRF
  };
  // Authorization: Bearer - gắn ở ĐÚNG MỘT chỗ này, và chỉ khi URL thuộc API_BASE (không rò token sang origin khác)
  const token = auth && url.startsWith(API_BASE) ? getToken() : null;
  if (token) opts.headers.Authorization = "Bearer " + token;
  if (signal) opts.signal = signal; // hủy request cũ khi người dùng gõ tiếp / đổi trang
  if (json !== undefined) {
    opts.headers["Content-Type"] = "application/json";
    opts.body = JSON.stringify(json);
  } else if (form) {
    opts.body = form; // FormData: trình duyệt tự đặt Content-Type + boundary
  }

  // tầng 1: có nhận được response không
  let res;
  try {
    res = await fetch(url, opts);
  } catch (e) {
    if (e && e.name === "AbortError") throw e; // chủ động hủy: không phải lỗi mạng
    throw new ApiError({
      status: 0,
      message: "Không kết nối được máy chủ. Kiểm tra mạng hoặc thử lại sau.",
    });
  }
  let body = null;
  try {
    body = await res.json();
  } catch (e) {
    /* phản hồi không phải JSON */
  }
  // tầng 2: HTTP status (lỗi kỹ thuật: không theo shape nghiệp vụ, không đánh đồng với NOT_FOUND)
  if (!res.ok) {
    const e = (body && body.error) || {};
    // 401 = token thiếu / sai / hết hạn / bị thu hồi: xóa phiên (chỉ khi mình ĐÃ gửi token) và để router đưa về /login.
    // 403 (thiếu quyền), 429 (thử lại sau), 5xx, mất mạng thì KHÔNG đụng tới token.
    if (res.status === 401 && token) {
      clearSession();
      setNotice(
        e.code === "TOKEN_EXPIRED"
          ? "Phiên đăng nhập đã hết hạn, vui lòng đăng nhập lại."
          : "Phiên đăng nhập không còn hiệu lực, vui lòng đăng nhập lại.",
      );
    }
    throw new ApiError({
      status: res.status,
      code: e.code,
      message: e.message,
      details: e.details,
      retryAfter: Number(res.headers.get("Retry-After")) || 0,
    });
  }
  // tầng 3: trường ok trong body
  if (!body || typeof body.ok !== "boolean") {
    throw new ApiError({
      status: res.status,
      code: "BAD_RESPONSE",
      message: "Máy chủ trả về dữ liệu không đúng định dạng.",
    });
  }
  if (!body.ok) {
    const e = body.error || {};
    throw new ApiError({
      status: res.status,
      code: e.code,
      message: e.message,
      fields: e.fields,
      details: e.details,
    });
  }
  return body; // { ok:true, data, meta? }
}

// Món ăn gửi bằng multipart/form-data (có thể kèm ảnh); đầu bếp / nguyên liệu gửi JSON
function dishForm(v) {
  const fd = new FormData();
  fd.set("name", v.name);
  fd.set("description", v.description);
  fd.set("price", v.price);
  fd.set("category", v.category);
  fd.set("available", v.available ? "true" : "false");
  fd.set("chefId", v.chefId);
  // trạng thái (draft | published): editor luôn bị server ép về draft; không gửi = server giữ giá trị cũ (món mới = draft)
  if (v.status) fd.set("status", v.status);
  // không chọn nguyên liệu nào vẫn gửi khóa rỗng: PATCH coi khóa vắng mặt là "giữ nguyên", khóa rỗng là "xóa hết"
  if (v.ingredientIds.length)
    v.ingredientIds.forEach((id) => fd.append("ingredientIds", id));
  else fd.set("ingredientIds", "");
  if (v.image) fd.set("image", v.image);
  return fd;
}

export const api = {
  // ----- xác thực (JWT, Block 9). Hợp đồng chi tiết: API.md -----
  auth: {
    // đăng nhập: { accessToken, user } hoặc { next:"mfa", challenge }
    login: ({ email, password, recaptcha }) =>
      request("POST", "/auth/login", { json: { email, password, recaptcha }, auth: false }).then((r) => r.data),
    // bước 2 khi đã bật MFA: { challenge, code } hoặc { challenge, recoveryCode }
    mfaVerify: (body) => request("POST", "/auth/mfa/verify", { json: body, auth: false }).then((r) => r.data),
    me: () => request("GET", "/auth/me").then((r) => r.data),
    logout: () => request("POST", "/auth/logout"),
    // đăng ký 3 bước
    registerOtp: ({ email, recaptcha }) =>
      request("POST", "/auth/register/otp", { json: { email, recaptcha }, auth: false }).then((r) => r.data),
    registerVerify: ({ email, otp }) =>
      request("POST", "/auth/register/verify", { json: { email, otp }, auth: false }).then((r) => r.data),
    register: (body) => request("POST", "/auth/register", { json: body, auth: false }).then((r) => r.data),
    // quên / đặt lại mật khẩu
    forgot: ({ email }) => request("POST", "/auth/forgot-password", { json: { email }, auth: false }).then((r) => r.data),
    resetCheck: (token) =>
      request("GET", "/auth/reset-password/check", { query: { token }, auth: false }).then((r) => r.data),
    reset: ({ token, password, passwordConfirm }) =>
      request("POST", "/auth/reset-password", { json: { token, password, passwordConfirm }, auth: false }).then((r) => r.data),
    // ảnh đại diện (H6): multipart, trường "avatar", Bearer. Trả user có avatarUrl. Lỗi ảnh -> VALIDATION_FAILED fields.avatar
    uploadAvatar: (blob) => {
      const fd = new FormData();
      fd.set("avatar", blob, "avatar." + (blob.type === "image/png" ? "png" : "webp"));
      return request("POST", "/auth/avatar", { form: fd }).then((r) => r.data);
    },
  },

  // ----- quản lý MFA (Bearer; F8). Hợp đồng: API.md mục MFA -----
  // enable / disable tăng tokenVersion nên trả accessToken MỚI: trang phải gọi replaceToken() (state.js) ngay.
  // Thao tác nhạy cảm (setup khi đang bật, disable, recovery-codes/*) cần xác thực lại: { password, code | recoveryCode }.
  mfa: {
    status: () => request("GET", "/mfa/status").then((r) => r.data), // { enabled, setupPending }
    // MFA đang tắt: không truyền gì. Đang bật (đổi thiết bị): truyền { password, code | recoveryCode }
    setup: (reauth) =>
      request("POST", "/mfa/setup", reauth ? { json: reauth } : {}).then((r) => r.data), // { secret, otpauthUrl, qrDataUrl }
    enable: ({ code }) => request("POST", "/mfa/enable", { json: { code } }).then((r) => r.data), // { accessToken, user, recoveryCodes | null }
    disable: (reauth) => request("POST", "/mfa/disable", { json: reauth }).then((r) => r.data), // { accessToken, user }
    recoveryStatus: (reauth) =>
      request("POST", "/mfa/recovery-codes/status", { json: reauth }).then((r) => r.data), // { total, remaining, createdAt }
    recoveryRegenerate: (reauth) =>
      request("POST", "/mfa/recovery-codes/regenerate", { json: reauth }).then((r) => r.data), // { recoveryCodes }
  },

  // ----- dữ liệu dùng chung -----
  options: () => request("GET", "/options").then((r) => r.data), // { categories, units, limits }

  // ----- CRUD: resource = dishes | chefs | ingredients -----
  // params: { q, sort, page, ...bộ lọc } hoặc { all: true } (lấy hết, không phân trang). Trả { data, meta }
  // params: { q, sort, page, focus, category, available, minPrice, maxPrice, specialty, unit }; opts.signal: AbortSignal
  list: (resource, params, opts) =>
    request("GET", `/${resource}`, { query: params, signal: opts && opts.signal }),
  get: (resource, id) =>
    request("GET", `/${resource}/${id}`).then((r) => r.data),
  create: (resource, values) =>
    resource === "dishes"
      ? request("POST", "/dishes", { form: dishForm(values) }).then(
          (r) => r.data,
        )
      : request("POST", `/${resource}`, { json: values }).then((r) => r.data),
  update: (resource, id, values) =>
    resource === "dishes"
      ? request("PATCH", `/dishes/${id}`, { form: dishForm(values) }).then(
          (r) => r.data,
        )
      : request("PATCH", `/${resource}/${id}`, { json: values }).then(
          (r) => r.data,
        ),
  remove: (resource, id) => request("DELETE", `/${resource}/${id}`),
};
