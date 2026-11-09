// Phân trang phía server dùng chung (trang quản trị + trang khách): ?page=2
const PER_PAGE = 9; // lưới 3x3

function paginate(list, pageParam) {
  const totalPages = Math.max(1, Math.ceil(list.length / PER_PAGE));
  const asked = parseInt(pageParam, 10);
  const page = Math.min(Math.max(Number.isInteger(asked) ? asked : 1, 1), totalPages);
  return { items: list.slice((page - 1) * PER_PAGE, page * PER_PAGE), page, totalPages };
}

module.exports = { paginate, PER_PAGE };
