// ===== Xác thực JWT + phân quyền (RBAC) =====
// authenticate: đọc "Authorization: Bearer <token>" -> verify chữ ký/hạn -> đọc user THẬT từ DB
//   -> so tokenVersion -> gắn req.user. Role/chefId lấy từ DB, KHÔNG tin bất kỳ claim nào trong token.
//   Thiếu / sai chữ ký / token loại khác / user không còn / tokenVersion lệch -> 401 UNAUTHENTICATED; hết hạn -> 401 TOKEN_EXPIRED.
// requirePermission(action): authenticate rồi kiểm tra role có quyền -> 403 FORBIDDEN.
const { User } = require("../models");
const { verify } = require("../utils/jwt");
const { ApiError } = require("../api/errors");
const { can } = require("../api/permissions");

function bearer(req) {
  const h = req.headers.authorization;
  if (typeof h !== "string") return null;
  const m = /^Bearer ([A-Za-z0-9._-]{10,4096})$/.exec(h.trim());
  return m ? m[1] : null;
}

async function authenticate(req, res, next) {
  try {
    const token = bearer(req);
    if (!token) return next(new ApiError("UNAUTHENTICATED"));
    const r = verify(token, "access");
    if (!r.ok)
      return next(new ApiError(r.expired ? "TOKEN_EXPIRED" : "UNAUTHENTICATED"));
    const user = await User.findByPk(Number(r.payload.sub));
    if (
      !user ||
      !user.emailVerifiedAt ||
      user.tokenVersion !== r.payload.tv // đổi mật khẩu / khóa tài khoản / đổi role -> tokenVersion + 1 -> token cũ chết
    )
      return next(new ApiError("UNAUTHENTICATED"));
    req.user = user;
    next();
  } catch (e) {
    next(e);
  }
}

const requirePermission = (action) => [
  authenticate,
  (req, res, next) =>
    can(req.user.role, action) ? next() : next(new ApiError("FORBIDDEN")),
];

module.exports = { authenticate, requirePermission, bearer };
