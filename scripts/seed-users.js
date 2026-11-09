// Tạo 3 tài khoản mẫu đã kích hoạt: viewer / editor / admin (chạy lại an toàn, không tạo trùng).
// Mật khẩu lấy từ SEED_PASSWORD (mặc định chỉ dùng khi dev). Editor được gán đầu bếp đầu tiên trong bảng chefs.
require("dotenv").config();
const bcrypt = require("bcryptjs");
const { sequelize, User, Chef } = require("../src/models");

const PASSWORD = process.env.SEED_PASSWORD || "Quan@n2026Demo";
if (process.env.NODE_ENV === "production" && !process.env.SEED_PASSWORD) {
  console.error("Production: phải đặt SEED_PASSWORD.");
  process.exit(1);
}

(async () => {
  await sequelize.sync();
  const chef = await Chef.findOne({ order: [["id", "ASC"]] });
  const hash = await bcrypt.hash(PASSWORD, 12);
  const list = [
    { name: "Khách Xem", email: "viewer@example.com", role: "viewer" },
    { name: "Biên Tập Viên", email: "editor@example.com", role: "editor", chefId: chef ? chef.id : null },
    { name: "Quản Trị Viên", email: "admin@example.com", role: "admin" },
  ];
  for (const u of list) {
    const [row, created] = await User.findOrCreate({
      where: { email: u.email },
      defaults: { ...u, passwordHash: hash, emailVerifiedAt: new Date() },
    });
    console.log(`${created ? "Đã tạo" : "Đã có"}: ${row.email} (${row.role}${row.chefId ? `, chef ${row.chefId}` : ""})`);
  }
  console.log(`Mật khẩu mẫu: ${process.env.SEED_PASSWORD ? "(lấy từ SEED_PASSWORD)" : PASSWORD}`);
  await sequelize.close();
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
