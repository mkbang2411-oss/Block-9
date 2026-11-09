// Tìm kiếm + lọc + sắp xếp + phân trang cho GET /api/:resource, chạy HOÀN TOÀN TRÊN POSTGRESQL.
//
// Tham số (đều tùy chọn):
//   mode      basic (mặc định) | advanced | fulltext | fuzzy
//             basic    = tên chứa từ khóa (+ bộ lọc nếu có)
//             advanced = q + category/minPrice/maxPrice/available... ghép bằng AND (cùng luật khớp tên với basic)
//             fulltext / fuzzy = có điểm, mặc định sắp theo độ liên quan
//   q         từ khóa (tối đa 100 ký tự; rỗng / chỉ khoảng trắng = không có điều kiện tìm)
//   sortBy    name | newest | price (món ăn) | relevance (chỉ khi mode=fulltext/fuzzy)
//   sortOrder asc | desc            (cũ vẫn dùng được: sort=name_asc|name_desc|newest|price_asc|price_desc|relevance)
//   page (số nguyên >= 1)   pageSize (1..MAX_PAGE_SIZE, mặc định 9)   focus=<id>   all=true
//   Bộ lọc  món ăn: category, available, minPrice, maxPrice, chefId, chef (tên đầu bếp)   |  đầu bếp: specialty   |  nguyên liệu: unit
//
// THỨ TỰ XỬ LÝ:  (1) search + filter chọn tập kết quả  ->  (2) sort  ->  (3) cắt trang (LIMIT/OFFSET).
// total = COUNT(*) trên CÙNG mệnh đề WHERE với items, chạy trước khi cắt trang.
// Sort luôn có `id` làm tiêu chí phụ để thứ tự ổn định (không nhảy / lặp item giữa các trang).
// BẢO MẬT: mọi giá trị người dùng đi qua replacements (tham số); tên cột/hướng sort chỉ lấy từ allowlist bên dưới.
const { QueryTypes } = require("sequelize");
const { CATEGORIES, UNITS } = require("../constants");

const MODES = ["basic", "advanced", "fulltext", "fuzzy"];
const SCORED = ["fulltext", "fuzzy"]; // hai mode có điểm (sắp theo độ liên quan)
const MAX_Q = 100;
const MAX_PAGE_SIZE = 60;
const DEFAULT_PAGE_SIZE = 9;
const FUZZY_THRESHOLD = 0.3; // mặc định của pg_trgm.similarity_threshold; toán tử % dùng đúng ngưỡng này

// ---------- đọc giá trị từng kiểu lọc: trả { value } hoặc { error } ----------
const oneOf = (name, list) => (raw) =>
  list.includes(raw)
    ? { value: raw }
    : { error: `${name} phải là một trong: ${list.join(", ")}` };
const bool = (name) => (raw) =>
  raw === "true" || raw === "false"
    ? { value: raw === "true" }
    : { error: `${name} phải là true hoặc false` };
const int = (name) => (raw) =>
  /^\d{1,12}$/.test(raw)
    ? { value: Number(raw) }
    : { error: `${name} phải là số nguyên không âm` };
const text = (max) => (raw) => ({
  value: raw.replace(/\s+/g, " ").slice(0, max),
}); // nhiều khoảng trắng liên tiếp -> 1

// ---------- cấu hình từng tài nguyên (alias bảng: d / c / i) ----------
// nameCol: cột tên | tsv: biểu thức tsvector (khớp ĐÚNG index) | sortBy: cột được sắp xếp (allowlist)
const CONFIG = {
  dishes: {
    table: "dishes d",
    alias: "d",
    nameCol: "d.name",
    tsv: "f_tsv(d.name, d.description)",
    sortBy: { name: "f_norm(d.name)", price: "d.price", newest: "d.id" },
    filters: [
      {
        name: "category",
        parse: oneOf("category", CATEGORIES),
        sql: "d.category = :f_category",
      },
      {
        name: "available",
        parse: bool("available"),
        sql: "d.available = :f_available",
      }, // false là điều kiện hợp lệ
      {
        name: "minPrice",
        parse: int("minPrice"),
        sql: "d.price >= :f_minPrice",
      }, // 0 là giá trị hợp lệ
      {
        name: "maxPrice",
        parse: int("maxPrice"),
        sql: "d.price <= :f_maxPrice",
      },
      { name: "chefId", parse: int("chefId"), sql: 'd."chefId" = :f_chefId' },
      // tìm theo TÊN đầu bếp (chứa chuỗi, không phân biệt hoa/thường/dấu) - dùng index trgm của chefs.name
      { name: "chef", parse: text(100), chefName: true },
    ],
  },
  chefs: {
    table: "chefs c",
    alias: "c",
    nameCol: "c.name",
    tsv: "f_tsv(c.name, c.specialty)",
    sortBy: { name: "f_norm(c.name)", newest: "c.id" },
    filters: [{ name: "specialty", parse: text(120), contains: "c.specialty" }],
  },
  ingredients: {
    table: "ingredients i",
    alias: "i",
    nameCol: "i.name",
    tsv: "f_tsv(i.name, NULL)",
    sortBy: { name: "f_norm(i.name)", newest: "i.id" },
    filters: [
      { name: "unit", parse: oneOf("unit", UNITS), sql: "i.unit = :f_unit" },
    ],
  },
};

// sort kiểu cũ -> [sortBy, sortOrder]
const LEGACY = {
  name_asc: ["name", "asc"],
  name_desc: ["name", "desc"],
  newest: ["newest", "desc"],
  price_asc: ["price", "asc"],
  price_desc: ["price", "desc"],
  relevance: ["relevance", "desc"],
};

const str = (v) => (typeof v === "string" ? v : undefined);
const blank = (v) => v === undefined || v === "";

// Đọc + kiểm tra query. Trả { q, mode, sortBy, sortOrder, sort, filters, page, pageSize, errors }; errors rỗng thì hợp lệ.
function parseListQuery(key, query) {
  const cfg = CONFIG[key];
  const errors = {};

  // --- q: chuẩn hóa khoảng trắng (đầu/cuối bỏ, nhiều khoảng liên tiếp -> 1) ---
  let q = "";
  if (!blank(query.q)) {
    if (str(query.q) === undefined) errors.q = "q phải là chuỗi";
    else q = query.q.trim().replace(/\s+/g, " ");
    if (q.length > MAX_Q) errors.q = `q tối đa ${MAX_Q} ký tự`;
  }

  // --- mode ---
  let mode = "basic";
  if (!blank(query.mode)) {
    if (MODES.includes(query.mode)) mode = query.mode;
    else errors.mode = `mode phải là một trong: ${MODES.join(", ")}`;
  }

  // --- sort: sortBy/sortOrder (mới) hoặc sort=price_asc (cũ). Chỉ nhận giá trị trong allowlist ---
  let sortBy = null;
  let sortOrder = null;
  const allowed = [...Object.keys(cfg.sortBy), "relevance"];
  if (!blank(query.sortBy)) {
    if (str(query.sortBy) && allowed.includes(query.sortBy))
      sortBy = query.sortBy;
    else errors.sortBy = `sortBy phải là một trong: ${allowed.join(", ")}`;
  } else if (!blank(query.sort)) {
    const legacy =
      str(query.sort) &&
      Object.prototype.hasOwnProperty.call(LEGACY, query.sort)
        ? LEGACY[query.sort]
        : null;
    if (legacy && allowed.includes(legacy[0])) [sortBy, sortOrder] = legacy;
    else
      errors.sort = `sort phải là một trong: ${Object.keys(LEGACY)
        .filter((k) => allowed.includes(LEGACY[k][0]))
        .join(", ")}`;
  }
  if (!blank(query.sortOrder)) {
    if (query.sortOrder === "asc" || query.sortOrder === "desc")
      sortOrder = query.sortOrder;
    else errors.sortOrder = "sortOrder phải là asc hoặc desc";
  }
  const hasKeyword = q.length > 0 && SCORED.includes(mode);
  if (sortBy === "relevance" && !hasKeyword) sortBy = null; // không có từ khóa thì không có điểm liên quan -> về mặc định
  if (!sortBy) sortBy = hasKeyword ? "relevance" : "name"; // mode fulltext/fuzzy có từ khóa: mặc định theo độ liên quan
  if (sortBy === "relevance") sortOrder = "desc";
  else if (!sortOrder) sortOrder = sortBy === "newest" ? "desc" : "asc";
  const sort =
    sortBy === "relevance"
      ? "relevance"
      : sortBy === "newest"
        ? "newest"
        : `${sortBy}_${sortOrder}`;

  // --- bộ lọc: bỏ qua khi KHÔNG gửi hoặc chuỗi rỗng; "0" và "false" là giá trị thật ---
  const filters = {};
  for (const f of cfg.filters) {
    const raw = query[f.name];
    if (blank(raw)) continue;
    if (typeof raw !== "string") {
      errors[f.name] = "Giá trị không hợp lệ";
      continue;
    }
    const r = f.parse(raw.trim());
    if (r.error) errors[f.name] = r.error;
    else if (r.value !== "") filters[f.name] = r.value;
  }
  if (
    filters.minPrice !== undefined &&
    filters.maxPrice !== undefined &&
    filters.minPrice > filters.maxPrice
  )
    errors.maxPrice = "maxPrice phải lớn hơn hoặc bằng minPrice";

  // --- phân trang: page nguyên >= 1 (vượt tổng số trang thì trả items:[], KHÔNG kẹp), pageSize 1..MAX ---
  let page = 1;
  if (!blank(query.page)) {
    if (
      typeof query.page === "string" &&
      /^\d{1,9}$/.test(query.page) &&
      Number(query.page) >= 1
    )
      page = Number(query.page);
    else errors.page = "page phải là số nguyên dương";
  }
  let pageSize = DEFAULT_PAGE_SIZE;
  if (!blank(query.pageSize)) {
    if (
      typeof query.pageSize === "string" &&
      /^\d{1,4}$/.test(query.pageSize) &&
      Number(query.pageSize) >= 1 &&
      Number(query.pageSize) <= MAX_PAGE_SIZE
    )
      pageSize = Number(query.pageSize);
    else
      errors.pageSize = `pageSize phải là số nguyên từ 1 đến ${MAX_PAGE_SIZE}`;
  }

  return { q, mode, sortBy, sortOrder, sort, filters, page, pageSize, errors };
}

// escape ký tự đặc biệt của LIKE (\ % _) NGAY TRONG SQL, sau khi chuẩn hóa bằng f_norm (đồng nhất với dữ liệu)
const likeTerm = (param) =>
  `replace(replace(replace(f_norm(${param}), '\\', '\\\\'), '%', '\\%'), '_', '\\_')`;

// Điều kiện "tên chứa đủ các từ trong q" (dùng cho tìm thường và tìm gần đúng). Thêm tham số :t0, :t1... vào rep của build().
function chuaTu(cfg, p) {
  return (
    "(" +
    p.q
      .split(" ")
      .map(
        (_, i) =>
          `f_norm(${cfg.nameCol}) LIKE '%' || ${likeTerm(`:t${i}`)} || '%' ESCAPE '\\'`,
      )
      .join(" AND ") +
    ")"
  );
}

// Dựng WHERE + ORDER BY + replacements. Chỉ ghép TÊN CỘT từ CONFIG (allowlist); giá trị người dùng luôn là tham số.
function build(key, p) {
  const cfg = CONFIG[key];
  const where = [];
  const rep = {};

  if (p.q) {
    // các từ của q (cho tìm thường + tìm gần đúng): tên phải chứa đủ, ở đầu / giữa / cuối, không cần đúng thứ tự
    p.q.split(" ").forEach((t, i) => {
      rep[`t${i}`] = t;
    });
    if (p.mode === "basic" || p.mode === "advanced") {
      where.push(chuaTu(cfg, p)); // advanced khớp tên giống basic; phần "nâng cao" là các bộ lọc AND bên dưới
    } else if (p.mode === "fulltext") {
      rep.q = p.q;
      where.push(`${cfg.tsv} @@ plainto_tsquery('simple', f_norm(:q))`);
    } else {
      // Gần đúng = chứa đủ các từ (gõ dở "ph" vẫn ra) HOẶC giống tên theo pg_trgm (gõ sai "phơ" vẫn ra, ngưỡng 0.3)
      rep.q = p.q;
      where.push(`(${chuaTu(cfg, p)} OR f_norm(${cfg.nameCol}) % f_norm(:q))`);
    }
  }

  for (const f of cfg.filters) {
    if (!(f.name in p.filters)) continue;
    rep[`f_${f.name}`] = p.filters[f.name];
    if (f.chefName)
      where.push(
        `d."chefId" IN (SELECT ch.id FROM chefs ch WHERE f_norm(ch.name) LIKE '%' || ${likeTerm(`:f_${f.name}`)} || '%' ESCAPE '\\')`,
      );
    else if (f.contains)
      where.push(
        `f_norm(${f.contains}) LIKE '%' || ${likeTerm(`:f_${f.name}`)} || '%' ESCAPE '\\'`,
      );
    else where.push(f.sql);
  }

  const dir = p.sortOrder === "desc" ? "DESC" : "ASC"; // chỉ có 2 giá trị này
  let order;
  if (p.sortBy === "relevance") {
    rep.q = p.q;
    // gần đúng: tên chứa nguyên từ khóa xếp trước, rồi tới độ giống (similarity) giảm dần
    const score =
      p.mode === "fulltext"
        ? `ts_rank(${cfg.tsv}, plainto_tsquery('simple', f_norm(:q)))`
        : `(CASE WHEN ${chuaTu(cfg, p)} THEN 1 ELSE 0 END) DESC, similarity(f_norm(${cfg.nameCol}), f_norm(:q))`;
    order = `${score} DESC, ${cfg.alias}.id ASC`;
  } else {
    order = `${cfg.sortBy[p.sortBy]} ${dir}, ${cfg.alias}.id ASC`;
  }
  return {
    from: cfg.table,
    alias: cfg.alias,
    where: where.length ? "WHERE " + where.join(" AND ") : "",
    order,
    rep,
  };
}

// Trả { total, page, pageSize, totalPages, ids } - ids đã đúng thứ tự sort, đã cắt trang (hoặc toàn bộ nếu all=true)
async function runList(sequelize, key, p, { all = false, focus = null } = {}) {
  const b = build(key, p);
  const run = (sql, rep) =>
    sequelize.query(sql, {
      replacements: { ...b.rep, ...rep },
      type: QueryTypes.SELECT,
    });

  const [{ n }] = await run(
    `SELECT count(*)::int AS n FROM ${b.from} ${b.where}`,
  );
  const total = n;
  if (all) {
    const rows = await run(
      `SELECT ${b.alias}.id FROM ${b.from} ${b.where} ORDER BY ${b.order}`,
    );
    return { total, ids: rows.map((r) => r.id) };
  }

  const totalPages = Math.max(1, Math.ceil(total / p.pageSize));
  let page = p.page;
  // focus=<id>: trả đúng trang đang chứa bản ghi đó (bookmark ?sel=...). Không nằm trong kết quả thì dùng page
  if (focus) {
    const hit = await run(
      `SELECT rn FROM (SELECT ${b.alias}.id, row_number() OVER (ORDER BY ${b.order}) AS rn FROM ${b.from} ${b.where}) t WHERE id = :focus`,
      { focus },
    );
    if (hit.length) page = Math.floor((Number(hit[0].rn) - 1) / p.pageSize) + 1;
  }
  // page vượt tổng số trang (không dùng focus) -> OFFSET vượt quá dữ liệu nên items rỗng, ok:true; page trả về đúng như đã hỏi
  const rows = await run(
    `SELECT ${b.alias}.id FROM ${b.from} ${b.where} ORDER BY ${b.order} LIMIT :limit OFFSET :offset`,
    {
      limit: p.pageSize,
      offset: (page - 1) * p.pageSize,
    },
  );
  return {
    total,
    page,
    pageSize: p.pageSize,
    totalPages,
    ids: rows.map((r) => r.id),
  };
}

module.exports = {
  parseListQuery,
  runList,
  build,
  MODES,
  MAX_Q,
  MAX_PAGE_SIZE,
  DEFAULT_PAGE_SIZE,
  FUZZY_THRESHOLD,
};
