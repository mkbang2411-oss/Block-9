// Chi tiết một món: GET /api/dishes/:id  (id sai / không có -> API trả 404 -> router hiện màn hình 404)
import { api } from "../api.js";
import { getRole } from "../state.js";
import { giaDong } from "../resources.js";
import { esc, dishThumb, thanhTren, nhoAnhLoi } from "../utils.js";
import { quayLai } from "../list-config.js";

export async function load(ctx) {
  const [d, role] = await Promise.all([
    api.get("dishes", ctx.params.id),
    getRole(),
  ]);
  // về lại danh sách đúng trang / bộ lọc / sắp xếp lúc trước (chưa từng vào danh sách thì mở danh sách và chọn món này)
  const ve = quayLai("/dishes", { sel: d.id, giu: true });
  return {
    title: d.name,
    am: "quan",
    html: `<div class="nen nen-kinh"></div><div class="mo"></div>
<main class="man bep ds cuon">
  ${thanhTren({ themHref: ve, themLabel: "← Danh sách món", role })}
  <section class="hop hop-giua rong">
    <div class="ct-dau"><span class="bieu">${dishThumb(d, true, true)}</span><h2>${esc(d.name)}</h2></div>
    <dl class="ct-ds">
      <dt>Giá</dt><dd>${giaDong(d.price)}</dd>
      <dt>Mô tả</dt><dd>${esc(d.description || "—")}</dd>
      <dt>Danh mục</dt><dd>${esc(d.category || "—")}</dd>
      <dt>Tình trạng</dt><dd><span class="the ${d.available ? "ok" : "het"}">${d.available ? "Còn bán" : "Hết món"}</span></dd>
      <dt>Đầu bếp</dt><dd>${esc(d.chef ? d.chef.name + (d.chef.specialty ? " (" + d.chef.specialty + ")" : "") : "—")}</dd>
      <dt>Nguyên liệu</dt><dd>${esc(d.ingredients && d.ingredients.length ? d.ingredients.map((i) => i.name).join(", ") : "—")}</dd>
    </dl>
    <div class="nut-hang"><a class="nut nut-phu" href="${esc(ve)}">Danh sách món</a><a class="nut" href="/khach">Chọn món ở bàn</a></div>
  </section>
</main>`,
    mount: (root, c) => nhoAnhLoi(root, c.signal),
  };
}
