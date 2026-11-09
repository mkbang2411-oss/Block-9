// ===== QUY ĐỊNH MÃ LỖI (error.code) CHO REST API =====
// Hai nhóm lỗi (xem response.js):
//   "business"  : lỗi nghiệp vụ đã biết -> trả HTTP 200, { ok:false, error:{ code, message, fields? } }
//   "technical" : lỗi kỹ thuật           -> trả đúng mã HTTP (4xx/5xx), { error:{ code, message, requestId } }
const BUSINESS = "business";
const TECHNICAL = "technical";

// code -> { status (chỉ dùng cho lỗi kỹ thuật), type, message mặc định }
const ERRORS = {
  // ---- nghiệp vụ (HTTP 200, ok:false) ----
  NOT_FOUND: {
    status: 200,
    type: BUSINESS,
    message: "Không tìm thấy bản ghi.",
  },
  VALIDATION_FAILED: {
    status: 200,
    type: BUSINESS,
    message: "Dữ liệu gửi lên không hợp lệ.",
  },
  ALREADY_EXISTS: {
    status: 200,
    type: BUSINESS,
    message: "Dữ liệu bị trùng với bản ghi đã có.",
  },
  RESOURCE_IN_USE: {
    status: 200,
    type: BUSINESS,
    message: "Bản ghi đang được dùng ở nơi khác nên không thể xóa.",
  },
  // lỗi đăng nhập là lỗi NGHIỆP VỤ (HTTP 200 + ok:false) để SPA không xóa token / chuyển trang mỗi lần gõ sai mật khẩu
  INVALID_CREDENTIALS: {
    status: 200,
    type: BUSINESS,
    message: "Email hoặc mật khẩu không đúng.",
  },
  // ---- đăng ký / quên mật khẩu (nghiệp vụ, HTTP 200 + ok:false) ----
  OTP_INVALID: {
    status: 200,
    type: BUSINESS,
    message: "Mã chưa đúng hoặc đã hết hạn. Bạn có thể yêu cầu mã mới.",
  },
  TICKET_INVALID: {
    status: 200,
    type: BUSINESS,
    message: "Phiên xác thực email đã hết hạn, vui lòng xác thực lại email.",
  },
  INVALID_RESET_TOKEN: {
    status: 200,
    type: BUSINESS,
    message: "Liên kết đặt lại mật khẩu không hợp lệ, đã hết hạn hoặc đã được dùng.",
  },
  CAPTCHA_REQUIRED: {
    status: 200,
    type: BUSINESS,
    message: "Vui lòng xác nhận bạn không phải người máy.",
  },
  ACCOUNT_NOT_ACTIVATED: {
    status: 200,
    type: BUSINESS,
    message: "Tài khoản chưa được kích hoạt. Hãy đăng ký lại bằng email này để nhận mã xác thực.",
  },
  MFA_REQUIRED: {
    status: 200,
    type: BUSINESS,
    message: "Cần xác thực hai lớp (MFA) để tiếp tục.",
  },
  INVALID_MFA_CODE: {
    status: 200,
    type: BUSINESS,
    message: "Mã xác thực không đúng hoặc đã hết hạn.",
  },
  MFA_NOT_ENABLED: {
    status: 200,
    type: BUSINESS,
    message: "Tài khoản chưa bật xác thực hai lớp (MFA).",
  },
  MFA_SETUP_REQUIRED: {
    status: 200,
    type: BUSINESS,
    message: "Chưa có phiên cài đặt MFA. Hãy bắt đầu lại từ bước tạo mã QR.",
  },
  RELATION_CONFLICT: {
    status: 200,
    type: BUSINESS,
    message: "Thao tác vi phạm ràng buộc dữ liệu liên quan.",
  },
  // ---- kỹ thuật (đúng mã HTTP) ----
  INVALID_JSON: {
    status: 400,
    type: TECHNICAL,
    message: "Nội dung gửi lên không phải JSON hợp lệ.",
  },
  BAD_REQUEST: {
    status: 400,
    type: TECHNICAL,
    message: "Yêu cầu không hợp lệ.",
  },
  UNAUTHENTICATED: {
    status: 401,
    type: TECHNICAL,
    message: "Bạn cần đăng nhập để thực hiện thao tác này.",
  },
  TOKEN_EXPIRED: {
    status: 401,
    type: TECHNICAL,
    message: "Phiên đăng nhập đã hết hạn, vui lòng đăng nhập lại.",
  },
  FORBIDDEN: {
    status: 403,
    type: TECHNICAL,
    message: "Bạn không có quyền thực hiện thao tác này.",
  },
  RATE_LIMITED: {
    status: 429,
    type: TECHNICAL,
    message: "Bạn thao tác quá nhanh, vui lòng thử lại sau ít phút.",
  },
  EMAIL_SEND_FAILED: {
    status: 502,
    type: TECHNICAL,
    message: "Không gửi được email xác thực, vui lòng thử lại sau.",
  },
  CORS_NOT_ALLOWED: {
    status: 403,
    type: TECHNICAL,
    message: "Nguồn (origin) này không được phép gọi API.",
  },
  ROUTE_NOT_FOUND: {
    status: 404,
    type: TECHNICAL,
    message: "Không tìm thấy đường dẫn API này.",
  },
  PAYLOAD_TOO_LARGE: {
    status: 413,
    type: TECHNICAL,
    message: "Nội dung gửi lên quá lớn.",
  },
  UNSUPPORTED_MEDIA_TYPE: {
    status: 415,
    type: TECHNICAL,
    message: "Content-Type phải là application/json.",
  },
  DB_UNAVAILABLE: {
    status: 500,
    type: TECHNICAL,
    message:
      "Hệ thống tạm thời không kết nối được cơ sở dữ liệu. Vui lòng thử lại sau.",
  },
  INTERNAL_ERROR: {
    status: 500,
    type: TECHNICAL,
    message: "Có lỗi xảy ra phía máy chủ. Vui lòng thử lại sau.",
  },
};

// Lỗi chủ động ném ra từ route: throw new ApiError("NOT_FOUND", { message: "Không tìm thấy món ăn." })
class ApiError extends Error {
  constructor(code, { message, fields, extra, headers } = {}) {
    const def = ERRORS[code] || ERRORS.INTERNAL_ERROR;
    super(message || def.message);
    this.name = "ApiError";
    this.code = ERRORS[code] ? code : "INTERNAL_ERROR";
    this.status = def.status;
    this.type = def.type;
    this.fields = fields;
    this.extra = extra; // dữ liệu thêm cho lỗi nghiệp vụ (vd needCaptcha, lockedSeconds)
    this.headers = headers; // vd { 'Retry-After': 60 }
  }
}

module.exports = { ERRORS, ApiError, BUSINESS, TECHNICAL };
