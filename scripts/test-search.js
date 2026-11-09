// Test tự động cho search / filter / sort / phân trang (chạy trên DB thật theo .env).
// Chỉ ĐỌC dữ liệu, trừ một nhóm test CRUD ở cuối: tạo 1 nguyên liệu tạm rồi xóa ngay (có dọn dẹp cả khi test lỗi).
//   npm run db:migrate && npm run db:seed && npm run test:search
require("dotenv").config();
const app = require("../src/app");
const { sequelize } = require("../src/models");

let pass = 0;
const fails = [];
let base;
// Xác thực bằng JWT: tạo tài khoản admin/viewer tạm trong DB rồi ký token (xem main bên dưới). Bearer thay cho cookie role cũ.
let ADMIN = {};
let VIEWER = {};

async function send(method, path, body) {
  const res = await fetch(base + path, {
    method,
    headers: { ...ADMIN, "Content-Type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
  });
  const b = await res.json();
  return { status: res.status, body: b, data: b.data, err: b.error };
}
async function get(path, headers = ADMIN) {
  const res = await fetch(base + path, { headers });
  const body = await res.json();
  return {
    status: res.status,
    body,
    data: body.data,
    meta: body.meta,
    err: body.error,
  };
}
function t(name, cond, extra) {
  if (cond) pass++;
  else fails.push(name + (extra ? "  -> " + extra : ""));
}
const names = (r) => r.data.map((x) => x.name);
const boDau = (s) =>
  s
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/đ/g, "d")
    .toLowerCase();
const q = (o) => "?" + new URLSearchParams(o).toString();

(async () => {
  process.env.JWT_SECRET = process.env.JWT_SECRET || "test-secret-test-secret-test-secret-123456";
  const bcrypt = require("bcryptjs");
  const { User } = require("../src/models");
  const { signAccess } = require("../src/utils/jwt");
  await sequelize.sync();
  const tag = Date.now().toString(36);
  const mkUser = (role) =>
    User.create({ name: "Test Search", email: `ts-${role}-${tag}@t.test`, passwordHash: bcrypt.hashSync("Mk9xTest123", 4), role, emailVerifiedAt: new Date() });
  const uAdmin = await mkUser("admin");
  const uViewer = await mkUser("viewer");
  ADMIN = { Authorization: `Bearer ${signAccess(uAdmin)}` };
  VIEWER = { Authorization: `Bearer ${signAccess(uViewer)}` };
  const srv = app.listen(0);
  base = `http://127.0.0.1:${srv.address().port}`;
  try {
    // ---------- Seed ----------
    const all = await get("/api/dishes?pageSize=1");
    t(
      "Seed: >= 1.000 món ăn",
      all.meta.total >= 1000,
      `total=${all.meta.total}`,
    );
    t(
      "Seed: >= 60 đầu bếp",
      (await get("/api/chefs?pageSize=1")).meta.total >= 60,
    );
    t(
      "Seed: có đủ nguyên liệu để demo (>= 100)",
      (await get("/api/ingredients?pageSize=1")).meta.total >= 100,
    );
    const all60 = (await get("/api/dishes?all=true")).data;
    t(
      "Seed: có món mô tả NULL, món hết, món trùng giá, tên không dấu",
      all60.some((d) => d.description === null) &&
        all60.some((d) => !d.available) &&
        new Set(all60.map((d) => d.price)).size < all60.length &&
        all60.some((d) => d.name === "Pho ga ta"),
    );
    const N = all.meta.total;

    // ---------- Phân trang ----------
    const p1 = await get("/api/dishes?pageSize=10&page=1");
    const p2 = await get("/api/dishes?pageSize=10&page=2");
    t(
      "Phân trang: 10 món/trang",
      p1.data.length === 10 && p1.meta.pageSize === 10,
    );
    t(
      "Phân trang: total = tổng toàn bộ, không phải số item của trang",
      p1.meta.total === N,
    );
    t("Phân trang: totalPages đúng", p1.meta.totalPages === Math.ceil(N / 10));
    t(
      "Phân trang: trang 1 và 2 không trùng",
      !p1.data.some((a) => p2.data.some((b) => a.id === b.id)),
    );
    const last = await get(
      `/api/dishes?pageSize=10&page=${Math.ceil(N / 10) + 50}`,
    );
    t(
      "Phân trang: page vượt giới hạn -> ok:true, items rỗng, total vẫn đúng (không kẹp)",
      last.body.ok === true &&
        last.data.length === 0 &&
        last.meta.total === N &&
        last.meta.page === Math.ceil(N / 10) + 50,
    );
    const adv = await get(
      "/api/dishes?mode=advanced&q=pho&available=false&pageSize=60",
    );
    const bas = await get(
      "/api/dishes?mode=basic&q=pho&available=false&pageSize=60",
    );
    t(
      "mode=advanced được chấp nhận, ghép q + available bằng AND",
      adv.body.ok === true &&
        adv.meta.mode === "advanced" &&
        adv.data.every((d) => d.available === false),
    );
    t(
      "advanced và basic cùng q + cùng bộ lọc -> cùng kết quả",
      names(adv).join("|") === names(bas).join("|"),
    );
    t(
      "advanced: minPrice > maxPrice -> VALIDATION_FAILED",
      (await get("/api/dishes?mode=advanced&q=pho&minPrice=9&maxPrice=1")).err
        ?.code === "VALIDATION_FAILED",
    );
    for (const bad of [
      "page=0",
      "page=-1",
      "page=abc",
      "page=1.5",
      "pageSize=0",
      "pageSize=61",
      "pageSize=abc",
      "pageSize=100000",
    ]) {
      const r = await get("/api/dishes?" + bad);
      t(
        `Validate ${bad}`,
        r.body.ok === false && r.err.code === "VALIDATION_FAILED",
      );
    }
    // duyệt hết các trang: đủ N món, không mất / không lặp
    const seen = new Set();
    for (let pg = 1; pg <= Math.ceil(N / 50); pg++)
      (await get(`/api/dishes?pageSize=50&page=${pg}`)).data.forEach((d) =>
        seen.add(d.id),
      );
    t(
      "Duyệt mọi trang: không mất, không lặp item",
      seen.size === N,
      `seen=${seen.size}/${N}`,
    );

    // ---------- Search cơ bản ----------
    const pho = await get("/api/dishes?q=pho&pageSize=60");
    t(
      "Search 'pho' tìm được 'Phở ...' (có dấu)",
      names(pho).some((n) => /^Phở/.test(n)),
    );
    t(
      "Search 'pho' tìm được 'Pho ga ta' (không dấu)",
      names(pho).includes("Pho ga ta"),
    );
    const PHO = await get("/api/dishes?q=PHỞ&pageSize=60");
    t(
      "Search không phân biệt hoa/thường/dấu: PHỞ = pho",
      PHO.meta.total === pho.meta.total,
      `${PHO.meta.total} vs ${pho.meta.total}`,
    );
    t(
      "Search: 'bun bo' tìm 'Bún bò ...'",
      names(await get("/api/dishes?q=bun%20bo&pageSize=60")).some((n) =>
        /^Bún bò/.test(n),
      ),
    );
    t(
      "Search: chuỗi ở GIỮA ('lá lốt')",
      names(await get("/api/dishes?q=la%20lot")).includes(
        "Bò 100% nướng lá lốt",
      ),
    );
    t(
      "Search: chuỗi ở CUỐI ('o la đặc biệt' không dấu = 'dac biet')",
      (await get("/api/dishes?q=dac%20biet&pageSize=60")).meta.total > 0,
    );
    t(
      "Search: nhiều khoảng trắng như 1",
      (await get("/api/dishes?q=%20%20bun%20%20%20bo%20%20")).meta.total ===
        (await get("/api/dishes?q=bun%20bo")).meta.total,
    );
    t(
      "Search: rỗng = không điều kiện",
      (await get("/api/dishes?q=")).meta.total === N,
    );
    t(
      "Search: chỉ khoảng trắng = không điều kiện",
      (await get("/api/dishes?q=%20%20%20")).meta.total === N,
    );
    const none = await get("/api/dishes?q=zzzkhongcoketqua");
    t(
      "Không có kết quả: ok=true, items=[], total=0",
      none.body.ok === true && none.data.length === 0 && none.meta.total === 0,
    );
    t(
      "Search q quá dài -> VALIDATION_FAILED",
      (await get("/api/dishes?q=" + "a".repeat(101))).err?.code ===
        "VALIDATION_FAILED",
    );

    // ---------- Ký tự đặc biệt ----------
    t(
      "'%' chỉ khớp tên chứa '%'",
      names(await get("/api/dishes?q=%25")).join("|") ===
        "Bò 100% nướng lá lốt",
      names(await get("/api/dishes?q=%25"))
        .slice(0, 3)
        .join("|"),
    );
    t(
      "'_' chỉ khớp tên chứa '_'",
      names(await get("/api/dishes?q=_")).join("|") === "Gà_rán sốt cay",
      names(await get("/api/dishes?q=_"))
        .slice(0, 3)
        .join("|"),
    );
    t(
      "Dấu nháy đơn: không lỗi SQL",
      names(await get("/api/dishes?q=O%27Hara")).includes(
        "Bánh xèo O'Hara & Co",
      ),
    );
    for (const evil of [
      "'; DROP TABLE dishes; --",
      '" OR 1=1 --',
      "\\",
      "!",
      "%'",
      "a\\",
    ]) {
      const r = await get("/api/dishes?q=" + encodeURIComponent(evil));
      t(
        `Input nguy hiểm không gây lỗi: ${evil}`,
        r.status === 200 && r.body.ok === true && r.meta.total === 0,
      );
    }
    t(
      "Bảng dishes vẫn còn sau test injection",
      (await get("/api/dishes?pageSize=1")).meta.total === N,
    );

    // ---------- Search ở 3 tab ----------
    t(
      "Tab Đầu bếp: 'nguyen van an' tìm 'Nguyễn Văn An'",
      names(await get("/api/chefs?q=nguyen%20van%20an")).includes(
        "Nguyễn Văn An",
      ),
    );
    t(
      "Tab Nguyên liệu: 'thit bo' tìm 'Thịt bò'",
      names(await get("/api/ingredients?q=thit%20bo")).includes("Thịt bò"),
    );
    t(
      "Tab Đầu bếp: chuyên môn 'pho' (không dấu) tìm được",
      (await get("/api/chefs?specialty=pho")).meta.total >= 1,
    );

    // ---------- Filter nâng cao ----------
    const f0 = await get("/api/dishes?minPrice=0&pageSize=1");
    t("minPrice=0 hợp lệ và không bỏ qua", f0.body.ok && f0.meta.total === N);
    const av0 = await get("/api/dishes?available=false&pageSize=60");
    t(
      "available=false: chỉ món hết",
      av0.body.ok &&
        av0.meta.total > 0 &&
        av0.meta.total < N &&
        av0.data.every((d) => d.available === false),
    );
    const avT = await get("/api/dishes?available=true&pageSize=1");
    t("available=true + false = tổng", avT.meta.total + av0.meta.total === N);
    const rg = await get(
      "/api/dishes?minPrice=30000&maxPrice=50000&pageSize=60",
    );
    t(
      "Khoảng giá: mọi món nằm trong [30k, 50k]",
      rg.meta.total > 0 &&
        rg.data.every((d) => d.price >= 30000 && d.price <= 50000),
    );
    const both = await get(
      "/api/dishes?q=ca%20phe&category=" +
        encodeURIComponent("Đồ uống") +
        "&available=true&maxPrice=40000&pageSize=60",
    );
    t(
      "Kết hợp nhiều filter bằng AND",
      both.body.ok &&
        both.meta.total > 0 &&
        both.data.every(
          (d) =>
            /ca phe/.test(boDau(d.name)) &&
            d.category === "Đồ uống" &&
            d.available &&
            d.price <= 40000,
        ),
    );
    t(
      "minPrice > maxPrice -> VALIDATION_FAILED",
      (await get("/api/dishes?minPrice=90000&maxPrice=1000")).err?.code ===
        "VALIDATION_FAILED",
    );
    for (const bad of [
      "minPrice=abc",
      "minPrice=-5",
      "available=maybe",
      "category=Khong",
      "mode=lol",
      "sortBy=password",
      "sortOrder=sideways",
      "sort=DROP",
    ])
      t(
        `Validate ${bad}`,
        (await get("/api/dishes?" + bad)).err?.code === "VALIDATION_FAILED",
      );
    t(
      "Điều kiện rỗng được bỏ qua",
      (await get("/api/dishes?category=&minPrice=&available=")).meta.total ===
        N,
    );

    // ---------- Sort ----------
    const pa = await get("/api/dishes?sortBy=price&sortOrder=asc&pageSize=60");
    const pd = await get("/api/dishes?sortBy=price&sortOrder=desc&pageSize=60");
    const inc = (a, k) => a.every((x, i) => i === 0 || a[i - 1][k] <= x[k]);
    t("Sort giá tăng dần", inc(pa.data, "price"));
    t("Sort giá giảm dần", inc([...pd.data].reverse(), "price"));
    t(
      "Sort giá: món đắt nhất ở trang 1 khi giảm dần (sort trên TOÀN BỘ trước khi cắt trang)",
      pd.data[0].price ===
        Math.max(
          ...(await get("/api/dishes?all=true")).data.map((d) => d.price),
        ),
    );
    t(
      "Sort legacy sort=price_desc = sortBy=price&sortOrder=desc",
      names(await get("/api/dishes?sort=price_desc&pageSize=60")).join() ===
        names(pd).join(),
    );
    // trùng giá: thứ tự ổn định theo id
    const same = pa.data.filter(
      (d, i, a) => i > 0 && a[i - 1].price === d.price,
    );
    t("Có món trùng giá để thử sort ổn định", same.length > 0);
    t(
      "Trùng giá: id tăng dần",
      pa.data.every(
        (d, i, a) =>
          i === 0 || a[i - 1].price !== d.price || a[i - 1].id < d.id,
      ),
    );
    const na = await get("/api/dishes?sortBy=name&sortOrder=asc&pageSize=5");
    const nz = await get("/api/dishes?sortBy=name&sortOrder=desc&pageSize=5");
    t("Sort tên A-Z và Z-A khác nhau", names(na).join() !== names(nz).join());
    const sp = [];
    for (let pg = 1; pg <= 5; pg++)
      (
        await get(
          `/api/dishes?sortBy=price&sortOrder=desc&pageSize=20&page=${pg}`,
        )
      ).data.forEach((d) => sp.push(d));
    t(
      "Sort + phân trang: 5 trang liên tiếp vẫn giảm dần và không lặp",
      inc([...sp].reverse(), "price") &&
        new Set(sp.map((d) => d.id)).size === sp.length,
    );
    t(
      "Đổi sort không giữ page cũ: page=1 cho kết quả đầu bảng sort mới",
      (await get("/api/dishes?sortBy=price&sortOrder=asc&pageSize=1&page=1"))
        .data[0].price === pa.data[0].price,
    );

    // ---------- Full-text ----------
    const ft = await get(
      "/api/dishes?mode=fulltext&q=gia%20truyen&pageSize=60",
    );
    t(
      "Full-text tìm trong MÔ TẢ (khác basic)",
      ft.body.ok && ft.meta.total >= 0 && ft.meta.mode === "fulltext",
    );
    const ft2 = await get(
      "/api/dishes?mode=fulltext&q=" +
        encodeURIComponent("hầm xương") +
        "&pageSize=60",
    );
    t(
      "Full-text: 'hầm xương' tìm ra 'Phở bò' (từ mô tả)",
      names(ft2).includes("Phở bò"),
    );
    t(
      "Full-text: mô tả NULL không gây lỗi (tên vẫn tìm được)",
      names(await get("/api/dishes?mode=fulltext&q=xoi")).includes("Xôi"),
    );
    t(
      "Full-text: sắp theo relevance mặc định",
      ft2.meta.sortBy === "relevance",
    );
    t(
      "Full-text: q rỗng = không điều kiện",
      (await get("/api/dishes?mode=fulltext&q=")).meta.total === N,
    );
    t(
      "Full-text: ký tự lạ không lỗi",
      (
        await get(
          "/api/dishes?mode=fulltext&q=" + encodeURIComponent("& | ! ( ) ' :*"),
        )
      ).body.ok === true,
    );

    // ---------- Fuzzy ----------
    const fz = await get(
      "/api/dishes?mode=fuzzy&q=" +
        encodeURIComponent("phơ bo") +
        "&pageSize=60",
    );
    t(
      "Fuzzy: gõ sai 'phơ bo' vẫn ra món Phở",
      fz.body.ok && names(fz).some((n) => /ph[oở]/i.test(n)),
    );
    const fz2 = await get("/api/dishes?mode=fuzzy&q=spagheti");
    t(
      "Fuzzy: 'spagheti' ra 'Spaghetti sốt cà'",
      names(fz2).includes("Spaghetti sốt cà"),
      names(fz2).slice(0, 3).join("|"),
    );
    t(
      "Fuzzy: sort theo similarity giảm dần (mặc định relevance)",
      fz2.meta.sortBy === "relevance" && names(fz2)[0] === "Spaghetti sốt cà",
    );
    const fz3 = await get("/api/dishes?mode=fuzzy&q=qqqxxxzzz");
    t(
      "Fuzzy: không có kết quả -> ok, items=[], total=0",
      fz3.body.ok && fz3.meta.total === 0,
    );
    t(
      "Fuzzy: q rỗng = không điều kiện",
      (await get("/api/dishes?mode=fuzzy&q=%20")).meta.total === N,
    );
    t(
      "Fuzzy: chefs gõ sai 'nguyen van ann'",
      names(await get("/api/chefs?mode=fuzzy&q=nguyen%20van%20ann")).includes(
        "Nguyễn Văn An",
      ),
    );
    t(
      "Fuzzy: nguyên liệu gõ sai 'thit boo'",
      names(await get("/api/ingredients?mode=fuzzy&q=thit%20boo")).includes(
        "Thịt bò",
      ),
    );
    t(
      "Fuzzy: sort giá vẫn dùng được khi người dùng chọn",
      inc(
        (
          await get(
            "/api/dishes?mode=fuzzy&q=pho&sortBy=price&sortOrder=asc&pageSize=60",
          )
        ).data,
        "price",
      ),
    );

    // ---------- Lọc theo TÊN ĐẦU BẾP (màn tìm nâng cao: tên món + đầu bếp + giá) ----------
    const cl = await get(
      "/api/dishes?chef=" + encodeURIComponent("cô lan") + "&pageSize=60",
    );
    t(
      "Chef filter: 'cô lan' -> mọi món do đầu bếp tên chứa 'Lan' nấu",
      cl.body.ok &&
        cl.meta.total > 0 &&
        cl.data.every((d) => /lan/.test(boDau(d.chef.name))),
      `total=${cl.meta.total}`,
    );
    t(
      "Chef filter: không dấu + hoa thường ('CO LAN') = có dấu",
      (await get("/api/dishes?chef=CO%20LAN&pageSize=60")).meta.total ===
        cl.meta.total,
    );
    t(
      "Chef filter: chuỗi ở GIỮA tên ('van an' trong 'Nguyễn Văn An')",
      (await get("/api/dishes?chef=van%20an&pageSize=60")).data.some(
        (d) => d.chef.name === "Nguyễn Văn An",
      ),
    );
    t(
      "Chef filter: khoảng trắng thừa như 1",
      (await get("/api/dishes?chef=%20%20co%20%20%20lan%20")).meta.total ===
        cl.meta.total,
    );
    const cmb = await get(
      "/api/dishes?q=pho&chef=lan&minPrice=40000&maxPrice=90000&available=true&sortBy=price&sortOrder=asc&pageSize=60",
    );
    t(
      "Chef + tên món + khoảng giá + còn bán (AND) + sort giá",
      cmb.body.ok &&
        cmb.data.every(
          (d) =>
            /pho/.test(boDau(d.name)) &&
            /lan/.test(boDau(d.chef.name)) &&
            d.price >= 40000 &&
            d.price <= 90000 &&
            d.available,
        ) &&
        inc(cmb.data, "price"),
      `total=${cmb.meta.total}`,
    );
    t(
      "Chef filter: total khớp tổng số món khi duyệt hết trang",
      (await (async () => {
        let n = 0;
        for (let pg = 1; pg <= Math.ceil(cl.meta.total / 5); pg++)
          n += (await get(`/api/dishes?chef=lan&pageSize=5&page=${pg}`)).data
            .length;
        return n;
      })()) === (await get("/api/dishes?chef=lan&pageSize=1")).meta.total,
    );
    t(
      "Chef filter: '%' không phải wildcard",
      (await get("/api/dishes?chef=%25")).meta.total === 0,
    );
    t(
      "Chef filter: không có đầu bếp -> ok, total=0",
      (await get("/api/dishes?chef=zzzkhongco")).meta.total === 0,
    );
    t(
      "Chef filter: rỗng = bỏ qua",
      (await get("/api/dishes?chef=%20")).meta.total === N,
    );

    // ---------- Search cơ bản = advanced khi chỉ có q ----------
    t(
      "Basic và (q + filter rỗng) cho cùng tập kết quả",
      (await get("/api/dishes?q=bun&pageSize=60")).meta.total ===
        (
          await get(
            "/api/dishes?q=bun&category=&minPrice=&maxPrice=&pageSize=60",
          )
        ).meta.total,
    );

    // ---------- focus (bookmark chi tiết) ----------
    const sample = (
      await get("/api/dishes?sortBy=price&sortOrder=desc&pageSize=10&page=3")
    ).data[4];
    const fo = await get(
      `/api/dishes?sortBy=price&sortOrder=desc&pageSize=10&focus=${sample.id}`,
    );
    t(
      "focus=<id> trả đúng trang chứa món đó",
      fo.meta.page === 3 && fo.data.some((d) => d.id === sample.id),
      `page=${fo.meta.page}`,
    );

    // ---------- Quyền + lỗi ----------
    t(
      "Dishes công khai (không cần vai)",
      (await get("/api/dishes?pageSize=1", {})).body.ok === true,
    );
    t(
      "Chefs không có vai -> 401",
      (await get("/api/chefs", {})).status === 401,
    );
    t(
      "Chefs viewer đọc được (200), nhưng POST /chefs -> 403",
      (await get("/api/chefs?pageSize=1", VIEWER)).body.ok === true &&
        (await fetch(base + "/api/chefs", { method: "POST", headers: { ...VIEWER, "Content-Type": "application/json" }, body: JSON.stringify({ name: "X Y" }) })).status === 403,
    );
    t("Route /api sai -> 404", (await get("/api/khong-co")).status === 404);
    t(
      "Id sai kiểu -> NOT_FOUND",
      (await get("/api/dishes/abc")).err?.code === "NOT_FOUND",
    );

    // ---------- CRUD <-> danh sách / total (tạo 1 nguyên liệu tạm, luôn xóa lại) ----------
    const TEN = "Zzz nguyên liệu thử " + Date.now();
    const nlTotal = async () =>
      (await get("/api/ingredients?pageSize=1")).meta.total;
    const before = await nlTotal();
    let newId = null;
    try {
      const c = await send("POST", "/api/ingredients", {
        name: TEN,
        unit: "kg",
      });
      newId = c.data && c.data.id;
      t(
        "CRUD: tạo nguyên liệu",
        c.body.ok === true && !!newId,
        JSON.stringify(c.err),
      );
      t(
        "CRUD: total tăng 1 và tìm thấy ngay",
        (await nlTotal()) === before + 1 &&
          names(
            await get("/api/ingredients?q=" + encodeURIComponent(TEN)),
          ).includes(TEN),
      );
      const u = await send("PATCH", `/api/ingredients/${newId}`, {
        name: TEN + " sửa",
        unit: "g",
      });
      t(
        "CRUD: sửa -> tìm theo tên mới thấy, tên cũ + đuôi 'sửa' khớp",
        u.body.ok === true &&
          names(
            await get("/api/ingredients?q=" + encodeURIComponent(TEN + " sua")),
          ).length === 1,
      );
      t(
        "CRUD: lọc unit=g thấy bản ghi vừa sửa",
        names(
          await get(
            "/api/ingredients?unit=g&q=" +
              encodeURIComponent("Zzz nguyên liệu thử") +
              "&pageSize=60",
          ),
        ).some((n) => n.startsWith(TEN)),
      );
    } finally {
      if (newId) {
        const d = await send("DELETE", `/api/ingredients/${newId}`);
        t("CRUD: xóa", d.body.ok === true);
        t("CRUD: total về như cũ sau khi xóa", (await nlTotal()) === before);
      }
    }
  } finally {
    srv.close();
    await User.destroy({ where: { email: [uAdmin.email, uViewer.email] } });
    await sequelize.close();
  }
  console.log(`\nĐạt ${pass} / ${pass + fails.length} kiểm tra.`);
  if (fails.length) {
    console.log("THẤT BẠI:\n - " + fails.join("\n - "));
    process.exit(1);
  }
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
