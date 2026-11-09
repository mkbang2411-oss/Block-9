const { DataTypes } = require("sequelize");
const sequelize = require("../config/database");

// Mã khôi phục MFA (dùng khi mất điện thoại). Mỗi lần tạo = một "nhóm" (batchId) 10 mã; tạo nhóm mới thì nhóm cũ bị xóa (vô hiệu).
// DB CHỈ lưu HMAC của mã (src/utils/mfa-crypto.js), không lưu mã gốc; mỗi mã dùng 1 lần: dùng xong đánh dấu usedAt (không xóa) để còn bằng chứng.
const RecoveryCode = sequelize.define(
  "RecoveryCode",
  {
    codeHash: { type: DataTypes.STRING(64), allowNull: false },
    usedAt: { type: DataTypes.DATE }, // NULL = chưa dùng
    batchId: { type: DataTypes.STRING(36), allowNull: false },
  },
  {
    tableName: "recovery_codes",
    indexes: [{ fields: ["userId", "codeHash"], unique: true }, { fields: ["userId", "batchId"] }],
  },
);

module.exports = RecoveryCode;
