// Sinh ngẫu nhiên con phố ở trang chủ (trước đây chạy ở server: src/utils/pho.js, nay chạy ngay trên trình duyệt).
//   [dãy cắt] [dãy nhà 1] [dãy nhà 2] [nhà hàng ở cuối phố] [dãy cắt]
// Cây thưa và cách xa nhau; xe hàng rong gần nhau hơn; nhà hàng KHÔNG có xe/cây chắn phía trước.
// Mọi khoảng cách tính theo đơn vị --u của CSS (các hằng số bố cục phải khớp style.css).
const rnd = (a, b) => a + Math.random() * (b - a);

const SO_XE = 2; // số xe hàng rong trên cả phố
const XE_CACH = [34, 60]; // khoảng cách giữa 2 xe liên tiếp (tâm - tâm)
const CAY_CACH = 115; // khoảng cách TỐI THIỂU giữa tâm 2 cây (~ 1 dãy phố = 115.7u)

// ---- bố cục (khớp style.css): chiều cao dãy nhà 48u, nhà hàng 58u ----
const DAY_RONG = (48 * 2200) / 913; // ~115.7u
const NH_RONG = (58 * 1100) / 1286; // ~49.6u
const CUT_T = 62; // dãy cắt ở đầu phố (chỉ thấy phần phải)
const CUT_P = 95; // dãy cắt sau nhà hàng (chỉ thấy phần trái)
const CHONG = 3.6; // 2 dãy chồng lên nhau
const S_T = 0;
const S_1 = S_T + CUT_T - CHONG;
const S_2 = S_1 + DAY_RONG - CHONG;
const S_P = S_2 + DAY_RONG - CHONG - 1.6 + NH_RONG - 2.4;

const XE = {
  xe1: { w: 11.6 }, // xe dù xanh vàng
  xe2: { w: 15.5 }, // xe bánh mì
  xe3: { w: 11.6 }, // xe nước mía
};
const CAY_W = 37;

const mk = (cls, rong, start) => ({ cls, rong, start, props: [] });
const pct = (u, d) => (u / d.rong) * 100;

export function taoPho() {
  const cutT = mk("cut-t", CUT_T, S_T);
  const d1 = mk("", DAY_RONG, S_1);
  const d2 = mk("", DAY_RONG, S_2);
  const cutP = mk("cut-p", CUT_P, S_P);
  const trees = []; // tâm cây (toạ độ toàn phố)

  const them = (day, loai, w, x, extra = {}) =>
    day.props.push({
      loai,
      x: +x.toFixed(1),
      anh: loai,
      lat: Math.random() < 0.5 ? -1 : 1,
      ...extra,
    });

  // ---- cây: thưa, cách nhau xa ----
  const cayVao = (day, xMin, xMax, dam = false) => {
    for (let i = 0; i < 200; i++) {
      const x = rnd(xMin, xMax - pct(CAY_W, day));
      const g = day.start + ((x + pct(CAY_W, day) / 2) / 100) * day.rong;
      if (trees.every((t) => Math.abs(t - g) >= CAY_CACH)) {
        trees.push(g);
        them(day, "cay", CAY_W, x, dam ? { dam: true } : {});
        return;
      }
    }
  };
  // cây NGAY BÊN PHẢI nhà hàng (luôn có, đặt trước), màu đậm hơn (class cay-dam)
  cayVao(cutP, 2, 47, true);
  cayVao(d2, 0, 68);
  cayVao(d1, 0, 94);
  cayVao(cutT, 4, 96); // thường không vừa chỗ -> bỏ qua

  // ---- xe hàng rong: kiểu không trùng, đặt gần nhau ----
  const kieu = Object.keys(XE).sort(() => Math.random() - 0.5);
  const xeVao = (g, loai) => {
    const w = XE[loai].w;
    if (trees.some((t) => Math.abs(t - g) < (CAY_W + w) / 2 + 3)) return false;
    for (const day of [d1, d2]) {
      const x = ((g - w / 2 - day.start) / day.rong) * 100;
      // dãy 2 chừa ~25% bên phải để xe không dính sát nhà hàng
      if (x >= 3 && x + pct(w, day) <= (day === d2 ? 74 : 97)) {
        them(day, loai, w, x);
        return true;
      }
    }
    return false;
  };
  const gMin = S_1 + 10,
    gMax = S_2 + DAY_RONG * 0.74 - 10;
  // thử lại cả cụm xe nếu chưa đủ SO_XE (cây to nên đôi khi chiếm chỗ)
  for (let lan = 0; lan < 60; lan++) {
    [d1, d2].forEach((d) => (d.props = d.props.filter((p) => p.loai === "cay")));
    let truoc = null,
      dat = 0;
    for (let i = 0; i < SO_XE; i++) {
      const loai = kieu[i % kieu.length];
      for (let k = 0; k < 40; k++) {
        const g =
          truoc === null
            ? rnd(gMin, gMax)
            : truoc + (Math.random() < 0.5 ? -1 : 1) * rnd(XE_CACH[0], XE_CACH[1]);
        if (g >= gMin && g <= gMax && xeVao(g, loai)) {
          truoc = g;
          dat++;
          break;
        }
      }
    }
    if (dat === SO_XE) break;
  }
  // một số xe (ngẫu nhiên, ít nhất 1) đứng sát mép lề hơn
  const xes = [d1, d2].flatMap((d) => d.props.filter((p) => p.loai !== "cay"));
  xes.forEach((p) => (p.gan = Math.random() < 0.5));
  if (xes.length && !xes.some((p) => p.gan))
    xes[Math.floor(Math.random() * xes.length)].gan = true;

  return { days: [cutT, d1, d2, cutP] };
}
