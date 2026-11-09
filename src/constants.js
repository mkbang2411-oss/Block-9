// Các giá trị cho phép (dùng chung cho model, validate phía server và form)
const UNITS = ['kg', 'g', 'lít', 'ml', 'quả', 'củ', 'bó', 'gói', 'hộp', 'chai', 'lon', 'miếng', 'muỗng'];
const CATEGORIES = ['Khai vị', 'Món chính', 'Tráng miệng', 'Đồ uống', 'Món chay'];

// Vai trò tài khoản (RBAC)
const ROLES = ['viewer', 'editor', 'admin'];
const DISH_STATUSES = ['draft', 'published'];

const LIMITS = {
  name: { min: 2, max: 120 },
  ingredientName: { min: 2, max: 60 },
  description: { max: 1000 },
  specialty: { max: 120 },
  price: { min: 1000, max: 100000000 }, // VNĐ, số nguyên
};

module.exports = { UNITS, CATEGORIES, LIMITS, ROLES, DISH_STATUSES };