const { DataTypes } = require("sequelize");
const sequelize = require("../config/database");
const { NAME_RE } = require("../utils/validators");
const { ROLES } = require("../constants");

// Tài khoản đăng nhập (JWT). KHÔNG bao giờ lưu mật khẩu gốc: chỉ lưu bcrypt hash.
// role: viewer (đọc) | editor (đọc/tạo/sửa món của mình) | admin (toàn quyền, chỉ cấp bằng scripts/set-role.js).
// tokenVersion: +1 khi đổi mật khẩu / khóa tài khoản / đổi role -> mọi JWT cũ (claim tv) bị từ chối.
const User = sequelize.define(
  "User",
  {
    name: {
      type: DataTypes.STRING(80),
      allowNull: false,
      set(v) {
        this.setDataValue("name", String(v ?? "").trim().replace(/\s+/g, " "));
      },
      validate: {
        notEmpty: { msg: "Họ tên không được để trống" },
        len: { args: [2, 80], msg: "Họ tên từ 2 đến 80 ký tự" },
        is: { args: NAME_RE, msg: "Họ tên chứa ký tự không hợp lệ" },
      },
    },
    email: {
      type: DataTypes.STRING(254),
      allowNull: false,
      unique: true,
      set(v) {
        this.setDataValue("email", String(v ?? "").trim().toLowerCase());
      },
      validate: {
        isEmail: { msg: "Email không hợp lệ" },
        len: { args: [5, 254], msg: "Email 5-254 ký tự" },
      },
    },
    passwordHash: {
      type: DataTypes.STRING(60),
      allowNull: false,
      validate: {
        is: { args: /^\$2[aby]\$\d{2}\$[./A-Za-z0-9]{53}$/, msg: "passwordHash phải là bcrypt hash" },
      },
    },
    role: {
      type: DataTypes.STRING(20),
      allowNull: false,
      defaultValue: "viewer", // ít quyền nhất; editor do mã mời, admin do script
      validate: { isIn: [ROLES] },
    },
    // ABAC: editor gắn với đúng 1 đầu bếp (chefs.id); chỉ sửa được món có chefId này và còn draft
    chefId: { type: DataTypes.INTEGER, allowNull: true },
    tokenVersion: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },

    emailVerifiedAt: { type: DataTypes.DATE },

    // ảnh đại diện (Supabase Storage). avatarPath là đường dẫn nội bộ, KHÔNG trả ra API; chỉ server ghi, không nhận từ client
    avatarUrl: { type: DataTypes.STRING(500) },
    avatarPath: { type: DataTypes.STRING(255) },

    // chống dò mật khẩu (cửa sổ 15 phút từ lần sai đầu; sai 3 lần -> CAPTCHA; sai 10 lần -> khóa 5 phút)
    failedLogins: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0, validate: { min: 0, max: 100 } },
    windowStart: { type: DataTypes.DATE },
    lockedUntil: { type: DataTypes.DATE },
    lastLoginAt: { type: DataTypes.DATE },

    // MFA TOTP (Đợt 4). mfaSecret chỉ có giá trị khi đang setup/đã bật; không bao giờ trả ra API
    mfaEnabled: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
    mfaSecret: { type: DataTypes.STRING(255) }, // khóa TOTP ĐANG DÙNG, đã mã hóa (utils/mfa-crypto.js)
    // khóa mới vừa /mfa/setup, chờ nhập đúng mã mới chuyển sang mfaSecret (đổi thiết bị không làm mất MFA cũ nếu bỏ dở)
    mfaPendingSecret: { type: DataTypes.STRING(255) },
    mfaLastStep: { type: DataTypes.BIGINT }, // time-step TOTP đã dùng gần nhất -> chống dùng lại mã
    failedMfa: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
    mfaLockedUntil: { type: DataTypes.DATE },
  },
  { tableName: "users" },
);

module.exports = User;
