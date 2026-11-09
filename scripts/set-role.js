// Admin cấp / đổi vai trò (và đầu bếp phụ trách) cho một tài khoản đã đăng ký.
// Dùng:  node scripts/set-role.js <email> <viewer|editor|admin> [chefId]
//   vd:  node scripts/set-role.js bep@example.com editor 3     (editor, chỉ sửa món draft của đầu bếp id 3)
//        node scripts/set-role.js bep@example.com viewer       (thu hồi về chỉ đọc)
//        node scripts/set-role.js sep@example.com admin
// Chạy trên máy chủ có DATABASE_URL (.env): web không có cách nào tự nâng quyền.
// Đổi role/chefId -> tokenVersion + 1: mọi JWT đang sống của tài khoản này bị từ chối, phải đăng nhập lại.
require("dotenv").config();
const { sequelize, User, Chef } = require("../src/models");
const { ROLES } = require("../src/constants");

(async () => {
  const [emailArg, roleArg, chefArg] = process.argv.slice(2);
  if (!emailArg || !ROLES.includes(roleArg)) {
    console.error("Cách dùng: node scripts/set-role.js <email> <viewer|editor|admin> [chefId]");
    process.exit(1);
  }
  const user = await User.findOne({ where: { email: emailArg.trim().toLowerCase() } });
  if (!user) {
    console.error(`Không tìm thấy tài khoản: ${emailArg}`);
    process.exit(1);
  }
  let chefId = null;
  if (chefArg !== undefined) {
    if (!/^\d{1,9}$/.test(chefArg) || !(await Chef.findByPk(Number(chefArg)))) {
      console.error(`Đầu bếp id=${chefArg} không tồn tại.`);
      process.exit(1);
    }
    chefId = Number(chefArg);
  }
  if (roleArg === "editor" && chefId == null && user.chefId == null)
    console.warn("Cảnh báo: editor chưa có chefId nên sẽ không tạo/sửa được món. Chạy lại kèm chefId.");
  if (roleArg !== "editor") chefId = null; // chefId chỉ có nghĩa với editor
  else if (chefId == null) chefId = user.chefId;

  const cu = `${user.role}${user.chefId ? `(chef ${user.chefId})` : ""}`;
  await user.update({ role: roleArg, chefId, tokenVersion: user.tokenVersion + 1 });
  console.log(`Đã đổi ${user.email}: ${cu} -> ${roleArg}${chefId ? `(chef ${chefId})` : ""}. Token cũ đã bị thu hồi.`);
  await sequelize.close();
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
