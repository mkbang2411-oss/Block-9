// Seed dữ liệu demo. KHÔNG xóa dữ liệu: chạy lại bao nhiêu lần cũng không tạo bản ghi trùng (bỏ qua tên đã có).
//
//   npm run db:seed                   thêm phần còn thiếu cho đủ số lượng bên dưới
//   npm run db:seed -- --reset --yes  XÓA SẠCH 3 bảng + bảng nối rồi tạo lại (phải có CẢ HAI cờ --reset và --yes)
//
// SỐ LƯỢNG (bằng MỘT NỬA mức yêu cầu 1.000 món / 60 đầu bếp trong tài liệu bổ sung):
//   món ăn 500  ·  đầu bếp 30  ·  nguyên liệu 50 (đề không quy định, chọn 50 đủ để demo search/filter/sort)
// Dữ liệu sinh theo công thức cố định (không dùng ngẫu nhiên thật) nên mỗi lần chạy ra cùng một bộ dữ liệu.
// Muốn đủ mức 1.000 / 60: đổi TARGET bên dưới (mọi thứ khác tự co giãn).
require("dotenv").config();
const { sequelize, Dish, Chef, Ingredient } = require("../src/models");
const { CATEGORIES } = require("../src/constants");
const { runMigrations } = require("../src/utils/db-setup");

const TARGET = { dishes: 1000, chefs: 60, ingredients: 120 };

// ---------- bộ sinh số giả ngẫu nhiên cố định (mulberry32) ----------
function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const rand = rng(20261026);
const pick = (arr) => arr[Math.floor(rand() * arr.length)];
const shuffle = (arr) => {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
};
const boDau = (s) =>
  s
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/đ/g, "d")
    .replace(/Đ/g, "D");

// ---------- ĐẦU BẾP: 4 người gốc + 26 người thêm ----------
const CHEFS = [
  ["Nguyễn Văn An", "Món Huế"],
  ["Trần Thị Bình", "Món Ý"],
  ["Cô Lan", "Phở, nước dùng"],
  ["Cô Mai", "Món nướng, bún chả"],
  ["Lê Hoàng Nam", "Món miền Tây"],
  ["Phạm Thu Hà", "Bánh và chè"],
  ["Võ Minh Quân", "Hải sản"],
  ["Đặng Thị Kim Ngân", "Món chay"],
  ["Bùi Quốc Bảo", "Lẩu và nướng"],
  ["Hồ Ngọc Diệp", "Món Hà Nội"],
  ["Đỗ Thanh Tùng", "Cơm và món xào"],
  ["Ngô Thị Thảo", "Đồ uống, cà phê"],
  ["Dương Văn Khoa", "Món Nhật"],
  ["Lý Mỹ Linh", "Món Hoa"],
  ["Phan Đức Huy", "Bò và nội tạng"],
  ["Trương Bảo Châu", "Món Huế"],
  ["Huỳnh Gia Hân", "Tráng miệng"],
  ["Vũ Hải Đăng", "Món Hàn"],
  ["Mai Thanh Vân", "Món chay"],
  ["Đinh Công Thành", "Món nướng"],
  ["Lương Thùy Dương", "Phở, bún"],
  ["Châu Nhật Minh", "Hải sản"],
  ["Tạ Quang Vinh", "Món Thái"],
  ["Kiều Phương Anh", "Bánh mì, xôi"],
  ["Hà Anh Tuấn", null],
  ["Cao Thị Hoa", null],
  ["Tô Văn Lợi", "Món miền Trung"],
  ["Lâm Bích Ngọc", "Món Pháp"],
  ["Âu Dương Phong", "Món nhậu"],
  ["Ân Hữu Tài", "Món Ý, pizza"],
  ["Nguyễn Thị Hồng Nhung", "Món Huế, bánh bèo"],
  ["Trần Minh Khang", "Bún, miến, hủ tiếu"],
  ["Lê Thị Cẩm Tú", "Chè, bánh ngọt"],
  ["Phạm Anh Dũng", "Hải sản nướng"],
  ["Võ Thị Ngọc Mai", "Món chay"],
  ["Đặng Quốc Việt", "Lẩu"],
  ["Bùi Thanh Hải", "Cơm văn phòng"],
  ["Hồ Thu Trang", "Món Hà Nội"],
  ["Đỗ Hữu Phước", "Món miền Tây"],
  ["Ngô Bảo Ngọc", "Cà phê, trà"],
  ["Dương Thị Lệ", "Bánh xèo, bánh khọt"],
  ["Lý Gia Bảo", "Món Hoa, dimsum"],
  ["Phan Thị Yến", "Gỏi, nộm"],
  ["Trương Công Danh", "Món nướng than"],
  ["Huỳnh Mỹ Duyên", "Sinh tố, nước ép"],
  ["Vũ Đình Long", "Món Hàn, Nhật"],
  ["Mai Xuân Hương", "Xôi, cháo"],
  ["Đinh Thị Thu Hiền", "Món Huế"],
  ["Lương Văn Tâm", "Bò, trâu"],
  ["Châu Ngọc Ánh", null],
  ["Tạ Thị Bích", "Món chay, nấm"],
  ["Kiều Minh Trí", "Pizza, mì Ý"],
  ["Hà Thị Mỹ Lệ", "Đồ ăn vặt"],
  ["Cao Văn Thắng", "Phở, bún bò"],
  ["Tô Hoài Nam", "Món nhậu, lẩu"],
  ["Lâm Thúy Vy", "Tráng miệng Pháp"],
  ["Âu Cẩm Lynh", "Món Thái"],
  ["Ân Thế Vinh", null],
  ["Quách Thị Tuyết", "Bánh dân gian"],
  ["Thái Văn Bình", "Cơm tấm, sườn nướng"],
];

// ---------- NGUYÊN LIỆU: 16 gốc + 34 thêm ----------
const INGREDIENTS = [
  ["Thịt bò", "kg"],
  ["Bánh phở", "kg"],
  ["Hành lá", "g"],
  ["Mì Ý", "g"],
  ["Cà chua", "kg"],
  ["Trứng gà", "quả"],
  ["Bún", "kg"],
  ["Thịt ba chỉ", "kg"],
  ["Nước mắm", "chai"],
  ["Tôm", "kg"],
  ["Gạo nếp", "kg"],
  ["Cà phê", "g"],
  ["Sữa đặc", "lon"],
  ["Hạt sen", "g"],
  ["Long nhãn", "g"],
  ["Đậu hũ", "miếng"],
  ["Thịt gà", "kg"],
  ["Thịt heo xay", "kg"],
  ["Sườn heo", "kg"],
  ["Cá lóc", "kg"],
  ["Mực ống", "kg"],
  ["Nghêu", "kg"],
  ["Cua đồng", "kg"],
  ["Gạo tẻ", "kg"],
  ["Bánh tráng", "gói"],
  ["Rau muống", "bó"],
  ["Rau thơm", "bó"],
  ["Giá đỗ", "g"],
  ["Hành tây", "củ"],
  ["Hành tím", "củ"],
  ["Tỏi", "củ"],
  ["Gừng", "củ"],
  ["Sả", "bó"],
  ["Ớt", "g"],
  ["Chanh", "quả"],
  ["Dừa", "quả"],
  ["Khoai lang", "kg"],
  ["Đậu xanh", "g"],
  ["Nấm rơm", "g"],
  ["Nấm hương", "g"],
  ["Mộc nhĩ", "g"],
  ["Miến", "gói"],
  ["Bột mì", "kg"],
  ["Bơ", "hộp"],
  ["Phô mai", "miếng"],
  ["Sữa tươi", "lít"],
  ["Đường phèn", "g"],
  ["Trà xanh", "g"],
  ["Mắm tôm", "chai"],
  ["Dầu ăn", "lít"],
  ["Thịt vịt", "kg"],
  ["Thịt trâu", "kg"],
  ["Chân giò heo", "kg"],
  ["Lòng heo", "kg"],
  ["Cá basa", "kg"],
  ["Cá thu", "kg"],
  ["Cá hồi", "kg"],
  ["Tôm khô", "g"],
  ["Ghẹ", "kg"],
  ["Sò điệp", "kg"],
  ["Ốc bươu", "kg"],
  ["Trứng vịt", "quả"],
  ["Trứng cút", "quả"],
  ["Nấm đùi gà", "g"],
  ["Nấm kim châm", "g"],
  ["Đậu phộng", "g"],
  ["Mè trắng", "g"],
  ["Rau cải", "bó"],
  ["Cải thìa", "bó"],
  ["Xà lách", "bó"],
  ["Dưa leo", "quả"],
  ["Cà rốt", "củ"],
  ["Khoai tây", "kg"],
  ["Bắp cải", "kg"],
  ["Mướp đắng", "quả"],
  ["Bầu", "quả"],
  ["Bí đỏ", "kg"],
  ["Su hào", "củ"],
  ["Củ cải trắng", "củ"],
  ["Chuối xanh", "quả"],
  ["Dứa", "quả"],
  ["Xoài", "quả"],
  ["Bơ trái", "quả"],
  ["Dâu tây", "hộp"],
  ["Cam", "quả"],
  ["Chanh dây", "quả"],
  ["Sả cây", "bó"],
  ["Lá chanh", "g"],
  ["Lá lốt", "bó"],
  ["Tía tô", "bó"],
  ["Húng quế", "bó"],
  ["Ngò gai", "bó"],
  ["Rau răm", "bó"],
  ["Nghệ tươi", "củ"],
  ["Riềng", "củ"],
  ["Hạt tiêu", "g"],
  ["Quế", "g"],
  ["Hoa hồi", "g"],
  ["Muối", "kg"],
  ["Đường cát", "kg"],
  ["Bột ngọt", "g"],
  ["Nước tương", "chai"],
  ["Dầu hào", "chai"],
  ["Giấm gạo", "chai"],
  ["Tương ớt", "chai"],
  ["Sa tế", "hộp"],
  ["Bột năng", "kg"],
  ["Bột gạo", "kg"],
  ["Bột báng", "g"],
  ["Nước cốt dừa", "lon"],
  ["Sữa chua", "hộp"],
  ["Kem tươi", "hộp"],
  ["Mật ong", "chai"],
  ["Trà đen", "g"],
  ["Bia", "lon"],
  ["Rượu gạo", "chai"],
  ["Nước dừa", "lít"],
  ["Nước dùng xương", "lít"],
  ["Thạch rau câu", "gói"],
  ["Bột cacao", "muỗng"],
];

// ---------- MÓN ĂN ----------
// 10 món gốc (giữ tên để khớp scripts/image-map.json): [tên, mô tả, giá, danh mục, còn bán, đầu bếp(index), [nguyên liệu]]
const GOC = [
  [
    "Phở bò",
    "Phở bò nước dùng hầm xương 12 tiếng.",
    65000,
    "Món chính",
    true,
    0,
    ["Thịt bò", "Bánh phở", "Hành lá"],
  ],
  [
    "Spaghetti sốt cà",
    "Mì Ý sốt cà chua tươi.",
    89000,
    "Món chính",
    true,
    1,
    ["Mì Ý", "Cà chua"],
  ],
  [
    "Trứng chiên hành",
    "Món ăn nhanh.",
    30000,
    "Khai vị",
    false,
    0,
    ["Trứng gà", "Hành lá"],
  ],
  [
    "Bún chả",
    "Thịt nướng than hoa, nước chấm chua ngọt.",
    60000,
    "Món chính",
    true,
    3,
    ["Bún", "Thịt ba chỉ", "Nước mắm"],
  ],
  [
    "Bún đậu mắm tôm",
    "Bún lá, đậu hũ chiên giòn, mắm tôm.",
    65000,
    "Món chính",
    true,
    3,
    ["Bún", "Đậu hũ"],
  ],
  [
    "Nem rán",
    "Nem rán giòn, nhân thịt và miến.",
    50000,
    "Khai vị",
    true,
    0,
    ["Thịt ba chỉ", "Trứng gà"],
  ],
  [
    "Xôi xéo",
    "Xôi nếp đậu xanh, hành phi.",
    30000,
    "Món chay",
    true,
    0,
    ["Gạo nếp"],
  ],
  [
    "Cà phê trứng",
    "Cà phê đậm phủ lớp kem trứng béo.",
    40000,
    "Đồ uống",
    true,
    2,
    ["Cà phê", "Trứng gà", "Sữa đặc"],
  ],
  [
    "Bánh tôm Hồ Tây",
    "Bánh tôm khoai lang chiên giòn.",
    48000,
    "Khai vị",
    true,
    2,
    ["Tôm"],
  ],
  [
    "Chè sen long nhãn",
    "Chè hạt sen, long nhãn, đường phèn.",
    35000,
    "Tráng miệng",
    true,
    2,
    ["Hạt sen", "Long nhãn"],
  ],
];

// Món sinh thêm = [món gốc] x [biến thể]; mỗi nhóm gắn danh mục + nguyên liệu gợi ý + khoảng giá
const NHOM = [
  {
    cat: "Món chính",
    ings: ["Thịt bò", "Bánh phở", "Hành lá"],
    gia: [45, 95],
    bases: [
      "Phở",
      "Hủ tiếu",
      "Bún bò",
      "Bún riêu",
      "Bún thịt nướng",
      "Mì quảng",
      "Cơm tấm",
      "Cơm gà",
      "Cơm chiên",
      "Bò lúc lắc",
      "Lẩu thái",
      "Cháo lòng",
      "Bánh canh",
      "Bún mắm",
      "Cao lầu",
      "Miến xào",
    ],
  },
  {
    cat: "Khai vị",
    ings: ["Tôm", "Thịt heo xay", "Bánh tráng"],
    gia: [25, 70],
    bases: [
      "Gỏi cuốn",
      "Chả giò",
      "Gỏi ngó sen",
      "Bánh xèo",
      "Bánh khọt",
      "Súp cua",
      "Salad",
      "Nem chua rán",
      "Chạo tôm",
      "Bì cuốn",
    ],
  },
  {
    cat: "Tráng miệng",
    ings: ["Đường phèn", "Dừa", "Sữa đặc"],
    gia: [20, 55],
    bases: [
      "Chè",
      "Bánh flan",
      "Sương sa hạt lựu",
      "Kem dừa",
      "Bánh bông lan",
      "Sữa chua nếp cẩm",
      "Rau câu",
      "Bánh chuối nướng",
    ],
  },
  {
    cat: "Đồ uống",
    ings: ["Cà phê", "Sữa đặc", "Trà xanh"],
    gia: [18, 60],
    bases: [
      "Cà phê",
      "Trà",
      "Sinh tố",
      "Nước ép",
      "Sữa chua",
      "Nước mía",
      "Trà sữa",
      "Soda",
    ],
  },
  {
    cat: "Món chay",
    ings: ["Đậu hũ", "Nấm rơm", "Rau thơm"],
    gia: [30, 75],
    bases: [
      "Cơm chay",
      "Bún chay",
      "Đậu hũ sốt",
      "Nấm xào",
      "Canh chay",
      "Gỏi chay",
      "Lẩu nấm",
      "Mì xào chay",
    ],
  },
];
const BIEN_THE = [
  "đặc biệt",
  "thập cẩm",
  "truyền thống",
  "sốt tiêu đen",
  "kiểu Huế",
  "kiểu Hà Nội",
  "kiểu Sài Gòn",
  "ít cay",
  "cay nồng",
  "phần lớn",
  "nhỏ",
  "gia đình",
  "cổ điển",
  "nhà làm",
  "hải sản",
  "bò Úc",
  "gà ta",
  "sốt cà",
  "nướng than",
  "chiên giòn",
  "sốt me",
  "sốt bơ tỏi",
  "kiểu miền Tây",
  "kiểu Nhật",
  "kiểu Hàn",
  "không hành",
  "nhiều rau",
  "thêm trứng",
  "suất lớn",
  "cho trẻ em",
];
const MO_TA = [
  "Nấu theo công thức gia truyền, vị đậm đà.",
  "Nguyên liệu tươi chọn mỗi sáng.",
  "Phần ăn vừa đủ cho một người.",
  "Món được khách gọi nhiều nhất tuần qua.",
  "Hương vị thanh nhẹ, dễ ăn.",
  "Phục vụ nóng, kèm rau sống và nước chấm.",
  "Có thể điều chỉnh độ cay theo yêu cầu.",
  "Gợi nhớ hương vị quán cũ nơi góc phố.",
];

// Món đặc biệt để test: tên không dấu, tên rất ngắn / rất dài, ký tự % _ ' &, mô tả NULL
const DAC_BIET = [
  [
    "Pho ga ta",
    "Tên viết không dấu để thử tìm 'pho'.",
    55000,
    "Món chính",
    true,
    ["Thịt gà", "Bánh phở"],
  ],
  [
    "Bun bo Hue",
    "Tên viết không dấu để thử tìm 'bun bo'.",
    62000,
    "Món chính",
    true,
    ["Bún", "Thịt bò"],
  ],
  ["Banh mi thit nuong", null, 28000, "Món chính", true, ["Thịt ba chỉ"]],
  ["Ca phe sua da", null, 25000, "Đồ uống", true, ["Cà phê", "Sữa đặc"]],
  ["Xôi", null, 15000, "Món chay", true, ["Gạo nếp"]],
  ["Chè", null, 15000, "Tráng miệng", true, ["Đường phèn"]],
  ["Gà", null, 20000, "Khai vị", false, ["Thịt gà"]],
  [
    "Bò 100% nướng lá lốt",
    "Tên có ký tự % để thử không bị hiểu là wildcard.",
    78000,
    "Món chính",
    true,
    ["Thịt bò"],
  ],
  [
    "Gà_rán sốt cay",
    "Tên có ký tự _ để thử không bị hiểu là wildcard.",
    69000,
    "Món chính",
    true,
    ["Thịt gà", "Ớt"],
  ],
  [
    "Bánh xèo O'Hara & Co",
    "Tên có dấu nháy đơn và dấu &.",
    58000,
    "Khai vị",
    true,
    ["Tôm", "Giá đỗ"],
  ],
  [
    "Cơm tấm sườn bì chả trứng ốp la đặc biệt kèm canh khổ qua dồn thịt và dưa chua nhà làm",
    "Tên rất dài để thử cắt chữ và giao diện.",
    99000,
    "Món chính",
    true,
    ["Sườn heo", "Gạo tẻ", "Trứng gà"],
  ],
  [
    "Phở bò tái nạm gầu gân sách đặc biệt không hành không quẩy nước béo riêng",
    null,
    89000,
    "Món chính",
    false,
    ["Thịt bò", "Bánh phở"],
  ],
];

function sinhMon() {
  const out = [];
  const seen = new Set(
    [...GOC, ...DAC_BIET].map((m) => boDau(m[0]).toLowerCase()),
  );
  const pool = [];
  for (const g of NHOM)
    for (const b of g.bases)
      for (const v of BIEN_THE) pool.push({ g, name: `${b} ${v}` });
  for (const { g, name } of shuffle(pool)) {
    if (out.length >= TARGET.dishes - GOC.length - DAC_BIET.length) break;
    const k = boDau(name).toLowerCase();
    if (seen.has(k)) continue;
    seen.add(k);
    // giá làm tròn 1.000đ; khoảng giá hẹp nên nhiều món TRÙNG GIÁ -> thử sort có tiêu chí phụ id
    const gia =
      (g.gia[0] + Math.floor(rand() * (g.gia[1] - g.gia[0] + 1))) * 1000;
    const dungMoTa = rand() > 0.15; // ~15% mô tả NULL
    out.push([
      name,
      dungMoTa ? `${pick(MO_TA)} ${name}.` : null,
      gia,
      g.cat,
      rand() > 0.15,
      g.ings,
    ]); // ~15% hết món
  }
  return out;
}

async function reset() {
  console.log("--reset --yes: xóa sạch dữ liệu 3 bảng...");
  await sequelize.sync({ force: true });
}

(async () => {
  // kiểm tra dữ liệu mẫu TRƯỚC khi chạm DB (lỗi thì không ghi dở)
  if (CHEFS.length < TARGET.chefs || INGREDIENTS.length < TARGET.ingredients)
    throw new Error(
      `Danh sách CHEFS (${CHEFS.length}) / INGREDIENTS (${INGREDIENTS.length}) ít hơn TARGET`,
    );
  for (const [lst, nm] of [
    [CHEFS, "CHEFS"],
    [INGREDIENTS, "INGREDIENTS"],
  ])
    if (new Set(lst.map((x) => x[0])).size !== lst.length)
      throw new Error(`${nm} có tên trùng`);
  const args = process.argv.slice(2);
  if (args.includes("--reset")) {
    if (!args.includes("--yes")) {
      console.error(
        "Từ chối: --reset sẽ XÓA SẠCH món ăn, đầu bếp, nguyên liệu. Thêm cả --yes nếu bạn chắc chắn.",
      );
      process.exit(1);
    }
    await reset();
  } else {
    await sequelize.sync(); // chỉ tạo bảng còn thiếu
  }
  await runMigrations(sequelize, () => {}); // bảo đảm có f_norm / index để search chạy ngay sau seed

  // --- đầu bếp (không có ràng buộc unique -> tự kiểm tra theo tên) ---
  const chefCu = await Chef.findAll({ attributes: ["id", "name"] });
  const coTen = new Set(chefCu.map((c) => c.name));
  const chefMoi = CHEFS.slice(0, TARGET.chefs)
    .filter(([name]) => !coTen.has(name))
    .map(([name, specialty]) => ({ name, specialty }));
  if (chefMoi.length) await Chef.bulkCreate(chefMoi);
  const chefs = await Chef.findAll({ where: { name: CHEFS.map((c) => c[0]) } });
  const chefByName = Object.fromEntries(chefs.map((c) => [c.name, c]));
  const chefList = CHEFS.slice(0, TARGET.chefs)
    .map(([n]) => chefByName[n])
    .filter(Boolean);

  // --- nguyên liệu (unique theo tên) ---
  await Ingredient.bulkCreate(
    INGREDIENTS.slice(0, TARGET.ingredients).map(([name, unit]) => ({
      name,
      unit,
    })),
    { ignoreDuplicates: true },
  );
  const ingAll = await Ingredient.findAll();
  const ing = Object.fromEntries(ingAll.map((i) => [i.name, i]));

  // --- món ăn: chỉ tạo món CHƯA có tên (unique theo tên) ---
  const monCu = new Set(
    (await Dish.findAll({ attributes: ["name"] })).map((d) => d.name),
  );
  const danhSach = [
    ...GOC.map(([name, description, price, category, available, ci, ings]) => ({
      name,
      description,
      price,
      category,
      available,
      chef: chefList[ci],
      ings,
    })),
    ...[...DAC_BIET, ...sinhMon()].map(
      ([name, description, price, category, available, ings], i) => ({
        name,
        description,
        price,
        category,
        available,
        chef: chefList[(i * 7 + 3) % chefList.length],
        ings,
      }),
    ),
  ];
  if (danhSach.length < TARGET.dishes)
    throw new Error(
      `Chỉ sinh được ${danhSach.length} tên món duy nhất (< ${TARGET.dishes}): thêm từ vào NHOM / BIEN_THE`,
    );
  if (!danhSach.every((m) => CATEGORIES.includes(m.category)))
    throw new Error("Danh mục seed không hợp lệ");

  // chỉ tạo phần CÒN THIẾU để tổng số món đạt TARGET (tính cả món đã có / món thêm tay qua CRUD): chạy lại không vượt, không trùng tên
  const can = Math.max(0, TARGET.dishes - monCu.size);
  const moi = danhSach.filter((m) => !monCu.has(m.name)).slice(0, can);
  const tao = await Dish.bulkCreate(
    moi.map(({ name, description, price, category, available, chef }) => ({
      name,
      description,
      price,
      category,
      available,
      chefId: chef.id,
      status: "published", // B5: món seed là món đã đăng (draft chỉ do editor tạo qua API)
    })),
    { returning: true },
  );
  const links = [];
  tao.forEach((dish, i) => {
    const ds = [...new Set(moi[i].ings)].map((n) => ing[n]).filter(Boolean);
    const them = shuffle(INGREDIENTS.map(([n]) => n))
      .slice(0, 1 + Math.floor(rand() * 3))
      .map((n) => ing[n])
      .filter(Boolean);
    for (const x of new Set([...ds, ...them]))
      links.push(`(${dish.id}, ${x.id})`);
  });
  for (let i = 0; i < links.length; i += 500)
    await sequelize.query(
      `INSERT INTO dish_ingredients ("dishId", "ingredientId", "createdAt", "updatedAt") SELECT v.d, v.i, now(), now() FROM (VALUES ${links.slice(i, i + 500).join(",")}) AS v(d, i) ON CONFLICT DO NOTHING`,
    );

  // --- báo cáo ---
  const dem = async (t) =>
    Number(
      (
        await sequelize.query(`SELECT count(*) AS n FROM ${t}`, {
          type: "SELECT",
        })
      )[0].n,
    );
  console.log(
    `Seed xong (tạo mới: ${tao.length} món, ${chefMoi.length} đầu bếp).`,
  );
  console.log("Số bản ghi hiện có:");
  console.log(
    `  dishes       ${await dem("dishes")}  (mục tiêu ${TARGET.dishes})`,
  );
  console.log(
    `  chefs        ${await dem("chefs")}  (mục tiêu ${TARGET.chefs})`,
  );
  console.log(
    `  ingredients  ${await dem("ingredients")}  (mục tiêu ${TARGET.ingredients})`,
  );
  console.log(`  dish_ingredients  ${await dem("dish_ingredients")}`);
  await sequelize.close();
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
