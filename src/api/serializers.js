// Chuyển model Sequelize -> JSON gửi cho client (đúng mô hình dữ liệu trong API.md).
// Không đưa imagePath (đường dẫn nội bộ trong Storage).
const chefRef = (c) => (c ? { id: c.id, name: c.name, specialty: c.specialty || null } : null);

const dish = (d) => ({
  id: d.id,
  name: d.name,
  description: d.description || null,
  price: Number(d.price), // DECIMAL của Sequelize trả chuỗi -> ép về số
  category: d.category,
  available: !!d.available,
  status: d.status || "published",
  imageUrl: d.imageUrl || null,
  chefId: d.chefId,
  chef: chefRef(d.chef),
  ingredients: (d.ingredients || []).map((i) => ({ id: i.id, name: i.name, unit: i.unit })),
});

const chef = (c) => ({ id: c.id, name: c.name, specialty: c.specialty || null });

const ingredient = (i) => ({ id: i.id, name: i.name, unit: i.unit });

// Người dùng: CHỈ trả định danh + trạng thái; tuyệt đối không có passwordHash, mfaSecret, tokenVersion, hash recovery, avatarPath
const user = (u) => ({
  id: u.id,
  name: u.name,
  email: u.email,
  role: u.role,
  chefId: u.chefId || null,
  mfaEnabled: !!u.mfaEnabled,
  avatarUrl: u.avatarUrl || null,
});

module.exports = { dish, chef, ingredient, user };
