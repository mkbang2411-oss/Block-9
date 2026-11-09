# Kiểm tra giao diện bằng Playwright (Python): cần server chạy ở localhost:3000 + DB đã seed.
#   pip install playwright && playwright install chromium && python scripts/e2e/ui-check.py
from playwright.sync_api import sync_playwright
import json,sys
B="http://localhost:3000"
out=[]
def ok(n,c,x=""): out.append(("PASS" if c else "FAIL",n,x)); print(out[-1],flush=True)
with sync_playwright() as p:
    b=p.chromium.launch(); ctx=b.new_context(viewport={"width":1280,"height":800}); pg=ctx.new_page()
    errs=[]; pg.on("pageerror",lambda e:errs.append(str(e)))
    reqs=[]; pg.on("request",lambda r: reqs.append(r.url) if "/api/dishes" in r.url else None)
    pg.goto(B+"/login"); pg.wait_for_timeout(800)
    pg.goto(B+"/dishes"); pg.wait_for_selector(".luoi .o"); 
    ok("Tải /dishes: 9 ô (1 trang)", pg.locator(".luoi .o").count()==9, str(pg.locator(".luoi .o").count()))
    ok("Hiện tổng 1000 món", "1000" in pg.inner_text("#kq"), pg.inner_text("#kq"))
    # chef filter
    pg.fill("#loc-chef","co lan"); pg.wait_for_timeout(900)
    url=pg.url; ok("URL có chef=", "chef=co+lan" in url or "chef=co%20lan" in url, url)
    ok("Lọc đầu bếp: mọi ô ghi 'Đầu bếp ... Lan'", all("Lan" in t for t in pg.locator(".luoi .o small:nth-of-type(2)").all_inner_texts()), str(pg.locator(".luoi .o small:nth-of-type(2)").all_inner_texts()[:3]))
    pg.screenshot(path="/home/claude/e2e/1_chef_filter.png")
    # reload keeps
    pg.reload(); pg.wait_for_selector(".luoi .o"); ok("F5 giữ filter chef", pg.input_value("#loc-chef")=="co lan")
    # reset, search + sort + page
    pg.goto(B+"/dishes?q=pho&sort=price_asc&page=2"); pg.wait_for_selector(".luoi .o")
    ok("Bookmark q+sort+page mở đúng", pg.input_value("input[name=q]")=="pho" and "trang 2/" in pg.inner_text("#kq"), pg.inner_text("#kq"))
    # open detail by panel link then back with scroll (infinite mode)
    pg.goto(B+"/dishes?view=infinite"); pg.wait_for_selector(".luoi .o")
    n0=pg.locator(".luoi .o").count()
    for _ in range(4):
        pg.evaluate("document.querySelector('main.cuon').scrollTo(0, document.querySelector('main.cuon').scrollHeight)"); pg.wait_for_timeout(900)
    n1=pg.locator(".luoi .o").count(); ok("Infinite scroll tải thêm", n1>n0, f"{n0}->{n1}")
    ids=pg.locator(".luoi .o").evaluate_all("els=>els.map(e=>e.dataset.id)"); ok("Infinite: không lặp item", len(ids)==len(set(ids)))
    pg.screenshot(path="/home/claude/e2e/2_infinite.png")
    pg.evaluate("document.querySelector('main.cuon').scrollTo(0, 1500)"); pg.wait_for_timeout(400)
    top_before=pg.evaluate("document.querySelector('main.cuon').scrollTop")
    # click tile then panel link
    tile=pg.locator(".luoi .o").nth(30); tile.scroll_into_view_if_needed(); tile.click(); pg.wait_for_timeout(300)
    sel_id=pg.locator(".o.chon").get_attribute("data-id")
    link=pg.locator(".ct:not([hidden]) a:has-text('Trang chi tiết')"); ok("Panel có link Trang chi tiết", link.count()==1)
    link.click(); pg.wait_for_selector(".ct-ds"); ok("URL chi tiết /dishes/:id", "/dishes/"+sel_id==pg.url.replace(B,""), pg.url)
    detail=pg.url; ok("Chi tiết có Nguyên liệu", "Nguyên liệu" in pg.inner_text(".ct-ds"))
    pg.reload(); pg.wait_for_selector(".ct-ds"); ok("F5 chi tiết vẫn đúng món", pg.url==detail)
    def visible(): return pg.evaluate("(id)=>{const e=document.querySelector('.o[data-id=\\''+id+'\\']'); if(!e) return null; const r=e.getBoundingClientRect(); return r.top>=0 && r.bottom<=innerHeight}", sel_id)
    pg.go_back(); pg.wait_for_selector(".luoi .o"); pg.wait_for_timeout(1500)
    ok("Back từ chi tiết: món vừa xem nằm trong màn hình", visible() is True, str(pg.evaluate("document.querySelector('main.cuon').scrollTop")))
    ok("Back: vẫn infinite, đã tải >9 ô, đúng ?sel", pg.locator(".luoi .o").count()>9 and "sel="+sel_id in pg.url, pg.url)
    pg.go_forward(); pg.wait_for_selector(".ct-ds"); pg.click("a:has-text('Danh sách món')"); pg.wait_for_selector(".luoi .o"); pg.wait_for_timeout(1500)
    ok("Nút '← Danh sách món': món vừa xem nằm trong màn hình", visible() is True)
    pg.screenshot(path="/home/claude/e2e/5_back_restored.png")
    # F5 khong mo chi tiet -> khoi phuc scrollTop
    pg.goto(B+"/dishes?view=infinite&page=4"); pg.wait_for_selector(".luoi .o"); pg.wait_for_timeout(800)
    pg.evaluate("document.querySelector('main.cuon').scrollTo(0, 1400)"); pg.wait_for_timeout(500)
    pg.reload(); pg.wait_for_selector(".luoi .o"); pg.wait_for_timeout(1200)
    t3=pg.evaluate("document.querySelector('main.cuon').scrollTop"); ok("F5 (không mở chi tiết): khôi phục scrollTop", abs(t3-1400)<80, str(t3))
    # load more
    pg.goto(B+"/dishes?view=more"); pg.wait_for_selector(".luoi .o")
    pg.click("[data-a=them]"); pg.wait_for_timeout(800); ok("Load more nối 18 ô", pg.locator(".luoi .o").count()==18, str(pg.locator(".luoi .o").count()))
    pg.click("[data-a=them]"); pg.wait_for_timeout(800); ok("Load more lần 2: 27 ô, ?page=3", pg.locator(".luoi .o").count()==27 and "page=3" in pg.url, pg.url)
    pg.reload(); pg.wait_for_selector(".luoi .o"); pg.wait_for_timeout(500); ok("F5 ở load more: tải lại đủ 27 ô", pg.locator(".luoi .o").count()==27)
    # change filter resets
    pg.fill("input[name=q]","bun"); pg.wait_for_timeout(900); ok("Đổi q: reset về 9 ô, bỏ page", pg.locator(".luoi .o").count()<=9 and "page=" not in pg.url, pg.url)
    # mode switch via day keo
    pg.goto(B+"/dishes?q=pho&sort=price_desc&page=2"); pg.wait_for_selector(".luoi .o")
    pg.screenshot(path="/home/claude/e2e/3_pagination.png")
    btn=pg.locator("button.nut-keo"); btn.dispatch_event("click"); pg.wait_for_timeout(1200)
    ok("Dây kéo mở màn: aria-expanded=true", btn.get_attribute("aria-expanded")=="true")
    pg.screenshot(path="/home/claude/e2e/4_day_keo.png")
    ch=pg.locator("#man-keo button, #man-keo [role=radio], #man-keo a")
    print("lua chon:", ch.all_inner_texts())
    pg.locator("#man-keo button:has-text('Load more')").first.dispatch_event("click"); pg.wait_for_timeout(1500)
    ok("Chọn Load more qua dây: URL view=more, giữ q+sort, về trang 1", "view=more" in pg.url and "q=pho" in pg.url and "sort=price_desc" in pg.url and "page=" not in pg.url, pg.url)
    ok("Sau đổi chế độ: 9 ô (trang 1) + nút Xem thêm", pg.locator(".luoi .o").count()==9 and pg.locator("[data-a=them]").count()==1)
    pg.keyboard.press("Escape")
    ok("Không có lỗi JS", not errs, str(errs))
    b.close()
print(sum(1 for o in out if o[0]=="FAIL"),"fail")