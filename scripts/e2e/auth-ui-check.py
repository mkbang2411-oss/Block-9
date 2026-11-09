"""Kiểm tra giao diện đăng nhập / đăng ký / quên mật khẩu / MFA (nửa đầu frontend Block 9) bằng Chromium headless.

Chạy: server đang chạy ở http://localhost:3000 với DEV_PRINT_MAIL=1, đã `npm run db:seed:users` (editor@example.com PHẢI chưa bật MFA), CHEF_INVITE_CODE=bep123.
    SERVER_LOG=/tmp/server.log SEED_PASSWORD=Passw0rd1 python3 scripts/e2e/auth-ui-check.py
Cần: pip install playwright && playwright install chromium; node (để tính mã TOTP bằng src/utils/totp.js).
"""
import json, os, re, subprocess, sys, time, urllib.request, uuid
from playwright.sync_api import sync_playwright

BASE = os.environ.get("BASE", "http://localhost:3000")
LOG = os.environ.get("SERVER_LOG", "/tmp/server.log")
PW = os.environ.get("SEED_PASSWORD", "Passw0rd1")
ROOT = os.path.join(os.path.dirname(__file__), "..", "..")
fails, total = [], 0

def check(name, cond, extra=""):
    global total
    total += 1
    print(("  ✓ " if cond else "  ✗ ") + name + (f"   [{extra}]" if (extra and not cond) else ""))
    if not cond: fails.append(name)

def api(method, path, body=None, token=None):
    req = urllib.request.Request(BASE + "/api" + path, method=method,
        data=json.dumps(body).encode() if body is not None else None,
        headers={"Content-Type": "application/json", **({"Authorization": "Bearer " + token} if token else {})})
    try:
        with urllib.request.urlopen(req) as r: return r.status, json.load(r)
    except urllib.error.HTTPError as e: return e.code, json.load(e)

def totp(secret, steps=0):
    # steps=1: mã của bước 30 giây kế tiếp (server chấp nhận ±1 bước và mỗi bước chỉ dùng một lần,
    # nên mã vừa dùng ở /mfa/enable không dùng lại được để đăng nhập)
    return subprocess.check_output(["node", "-e", f"console.log(require('./src/utils/totp').totpAt('{secret}', Date.now()+{steps}*30000))"], cwd=ROOT).decode().strip().zfill(6)

def log_tail(since):
    return open(LOG, encoding="utf8").read()[since:]

def esc_url(p): return p

with sync_playwright() as pw:
    br = pw.chromium.launch(**({"executable_path": os.environ["CHROMIUM_PATH"]} if os.environ.get("CHROMIUM_PATH") else {}))
    ctx = br.new_context()
    pg = ctx.new_page()
    errors = []
    pg.on("pageerror", lambda e: errors.append(str(e)))
    pg.on("console", lambda m: m.type == "error" and "Failed to load resource" not in m.text and errors.append(m.text))
    auth_headers = []
    pg.on("request", lambda r: r.url.startswith(BASE + "/api") and auth_headers.append((r.url, r.headers.get("authorization"))))
    token = lambda: pg.evaluate("localStorage.getItem('cqa-token')")
    def goto(path): pg.goto(BASE + path); pg.wait_for_selector("#app > *", timeout=8000); pg.wait_for_timeout(300)
    # giao diện ban đêm (giống Block 8): CAPTCHA giả lập là ô .dn-cap (tick mất ~0,7 giây); mã 6 số là 6 ô .dn-otp input
    def tick_cap(): pg.click("#captcha .dn-cap"); pg.wait_for_timeout(1000)
    def otp_fill(code):
        pg.evaluate("document.querySelectorAll('.dn-otp input').forEach(i => i.value = '')")
        pg.locator(".dn-otp input").first.focus(); pg.keyboard.type(code)
    def dang_xuat():
        # đăng xuất chỉ còn một lối: về trang chủ, bấm thuyền (#nut-thuyen), xác nhận "Đăng xuất" trong hộp hỏi,
        # rồi CHỜ sang /login (nước tràn 0,62 giây + lời gọi logout > 1 giây): chờ cố định dễ trượt, và goto sớm thì token chưa kịp xóa
        pg.goto(BASE + "/")
        try: pg.wait_for_selector("#nut-thuyen", timeout=8000)
        except Exception: return
        pg.click("#nut-thuyen")
        pg.wait_for_selector('[data-a="dx"]', timeout=4000)
        pg.click('[data-a="dx"]')
        try: pg.wait_for_url("**/login*", timeout=8000)
        except Exception: pass
        pg.wait_for_timeout(300)
    def login(email, pw_=PW):
        goto("/login"); pg.fill("#f-email", email); pg.fill("#f-password", pw_); pg.click("#nut"); pg.wait_for_timeout(2500)

    print("T-A. Chưa đăng nhập")
    goto("/dishes")
    check("trang khách /dishes chạy không token, có món", pg.locator("#app").inner_text().strip() != "" and "401" not in pg.title())
    check("request /dishes không có Authorization", all(a is None for u, a in auth_headers if "/dishes" in u))
    goto("/admin/chefs")
    check("/admin/chefs không token -> /login?next=", "/login" in pg.url and "next=%2Fadmin%2Fchefs" in pg.url, pg.url)
    goto("/")
    pg.click(".nha-hang", force=True); pg.wait_for_timeout(1500)
    check("chưa đăng nhập, bấm nhà hàng -> /login", pg.url.endswith("/login"), pg.url)
    check("không còn hộp 'chọn vai' ở trang đăng nhập", pg.locator("input[name=role]").count() == 0)

    print("T-A2. Nước tràn khi bấm 'Trang chủ' ở cảnh đêm")
    goto("/login")
    # SPA không tải lại trang nên biến này sống qua lần chuyển cảnh: ghi lại xem lớp nước (.nuoc-tran) và cờ .dang-nuoc có từng xuất hiện không
    pg.evaluate("""() => { window.__nuoc = { tran: false, dang: false };
      new MutationObserver(() => {
        if (document.querySelector('.nuoc-tran')) window.__nuoc.tran = true;
        if (document.body.classList.contains('dang-nuoc')) window.__nuoc.dang = true;
      }).observe(document.documentElement, { childList: true, subtree: true, attributes: true, attributeFilter: ['class', 'data-nuoc'] }); }""")
    pg.click(".dn-ve")
    pg.wait_for_url(BASE + "/", timeout=5000); pg.wait_for_timeout(1800)
    nuoc = pg.evaluate("window.__nuoc")
    check("bấm 'Trang chủ' ở /login: nước tràn lên (.nuoc-tran, .dang-nuoc) rồi sang /", pg.url == BASE + "/" and nuoc["tran"] and nuoc["dang"], f"{pg.url} {nuoc}")
    check("nước rút hết: không còn lớp phủ, không kẹt .dang-nuoc / data-nuoc",
          pg.locator(".nuoc-tran").count() == 0 and not pg.evaluate("document.body.classList.contains('dang-nuoc') || document.documentElement.hasAttribute('data-nuoc')"))

    print("T-B. Đăng nhập sai / CAPTCHA / thành công")
    login("viewer@example.com", "SaiMatKhau1")
    check("sai mật khẩu: ở lại /login, hiện lỗi", "/login" in pg.url and pg.locator("#loi").is_visible())
    check("sai mật khẩu: không có token", token() is None)
    check("sai lần 1: chưa hiện CAPTCHA", pg.locator("#captcha").is_hidden())
    for _ in range(2):
        pg.fill("#f-password", "SaiMatKhau1"); pg.click("#nut"); pg.wait_for_timeout(700)
    check("sai lần 3: hiện CAPTCHA", pg.locator("#captcha").is_visible())
    pg.fill("#f-password", PW); pg.click("#nut"); pg.wait_for_timeout(700)
    check("đúng mật khẩu nhưng chưa tick CAPTCHA: bị chặn phía client", "/login" in pg.url and token() is None)
    tick_cap(); pg.click("#nut")
    try: pg.wait_for_url("**/khach", timeout=8000)   # bcrypt + hiệu ứng cành cây có thể lâu hơn 1,5 giây trên máy chậm
    except Exception: pass
    check("tick CAPTCHA + đúng mật khẩu -> /khach", pg.url.endswith("/khach"), pg.url)
    t = token()
    check("accessToken nằm trong localStorage (cqa-token)", bool(t) and t.count(".") == 2)
    goto("/admin/chefs")
    check("viewer vào /admin/chefs (viewer đọc được đầu bếp)", "/admin/chefs" in pg.url)
    sent = [a for u, a in auth_headers if u.endswith("/api/chefs") or "/api/chefs?" in u]
    check("request /api/chefs có Authorization: Bearer", bool(sent) and all(a == "Bearer " + t for a in sent))
    goto("/login")
    check("đã đăng nhập mà mở /login -> chuyển đi, không hiện form", "/login" not in pg.url, pg.url)
    pg.goto(BASE + "/dishes"); pg.wait_for_selector("#app > *")
    dang_xuat()
    check("Đăng xuất -> /login, token bị xóa", "/login" in pg.url and token() is None)

    print("T-C. Token hỏng / hết hạn / sai chữ ký")
    pg.evaluate("localStorage.setItem('cqa-token', 'a.b.c')")
    goto("/admin/chefs")
    check("token rác: về /login, có thông báo, token bị xóa", "/login" in pg.url and pg.locator("#loi").is_visible() and token() is None, pg.url)
    pg.evaluate("localStorage.setItem('cqa-token', 'a.b.c')")
    goto("/dishes")
    check("token rác ở trang công khai: vẫn xem được thực đơn", "/dishes" in pg.url)
    # mở /login bằng token cũ -> hiện form (token đã bị xóa khi /auth/me trả 401)
    check("sau đó token đã bị dọn", token() is None)

    print("T-D. Lỗi 403 không đăng xuất")
    login("viewer@example.com")
    goto("/admin/dishes/1/delete")   # viewer không có quyền xóa
    pg.wait_for_timeout(500)
    if pg.locator("#app button.nut:not(.nut-phu)").count():
        pg.locator("#app button.nut:not(.nut-phu)").first.click(); pg.wait_for_timeout(900)
    check("viewer xóa món: bị chặn (403), vẫn còn token", token() is not None)
    api_s, api_b = api("DELETE", "/dishes/1", token=token())
    check("API trả 403 FORBIDDEN cho viewer", api_s == 403 and api_b["error"]["code"] == "FORBIDDEN")
    dang_xuat()

    print("T-E. Quên / đặt lại mật khẩu")
    mail = f"reset{uuid.uuid4().hex[:6]}@example.com"
    # tạo tài khoản bằng API để có email thật
    since = len(open(LOG, encoding="utf8").read())
    goto("/forgot-password")
    pg.fill("#f-email", "viewer@example.com"); pg.click("#nut"); pg.wait_for_timeout(1200)
    check("forgot: hiện thông báo chung", pg.locator("#xong").is_visible())
    m = re.search(r"reset-password\?token=[\w-]+", log_tail(since))
    check("email chứa link /reset-password?token=", bool(m))
    goto("/reset-password?token=sai-token")
    check("link sai: báo không dùng được", "không dùng được" in pg.locator(".dn-tieude").inner_text().lower())
    goto("/" + m.group(0))
    check("link đúng: hiện form đặt lại", pg.locator("#f-password").count() == 1)
    check("trang reset đặt meta referrer=no-referrer", pg.locator("meta[name=referrer]").get_attribute("content") == "no-referrer")
    pg.fill("#f-password", "Passw0rd1"); pg.fill("#f-passwordConfirm", "Khac0khop1"); pg.click("#nut"); pg.wait_for_timeout(500)
    check("mật khẩu nhập lại không khớp: báo lỗi ô", pg.locator("#f-passwordConfirm.loi").count() == 1)
    pg.fill("#f-password", "Moi0Matkhau1"); pg.fill("#f-passwordConfirm", "Moi0Matkhau1"); pg.click("#nut"); pg.wait_for_timeout(1500)
    check("đổi xong -> /login", "/login" in pg.url, pg.url)
    check("không cấp token sau khi đổi mật khẩu", token() is None)
    check("link reset không còn dùng lại được", api("GET", "/auth/reset-password/check?token=" + m.group(0).split("=")[1])[1].get("ok") is False)
    pg.goto(BASE + "/" + m.group(0)); pg.wait_for_timeout(1200)
    check("mở lại link cũ: báo không dùng được", "không dùng được" in pg.locator(".dn-tieude").inner_text().lower())
    login("viewer@example.com", "Moi0Matkhau1")
    check("đăng nhập bằng mật khẩu mới", pg.url.endswith("/khach"), pg.url)
    dang_xuat()
    # trả lại mật khẩu mẫu cho các test sau (forgot-password có hồi chờ 60s nên không gọi lại được ngay -> ghi thẳng DB)
    subprocess.check_call(["node", "-e", f"""require('dotenv').config();const {{User}}=require('./src/models');const b=require('bcryptjs');
      User.update({{passwordHash:b.hashSync('{PW}',12)}},{{where:{{email:'viewer@example.com'}}}}).then(()=>process.exit(0))"""], cwd=ROOT)

    print("T-F. Đăng ký 3 bước")
    new = f"sv{uuid.uuid4().hex[:6]}@example.com"
    since = len(open(LOG, encoding="utf8").read())
    goto("/register")
    pg.fill("#f-email", new); pg.click("#nut"); pg.wait_for_timeout(500)
    check("bước 1: chưa tick CAPTCHA bị chặn", pg.locator(".dn-otp").count() == 0)
    tick_cap(); pg.click("#nut"); pg.wait_for_timeout(1500)
    check("bước 2: ô nhập OTP", pg.locator(".dn-otp").count() == 1)
    otp = re.search(r"\b(\d{6})\b", log_tail(since)).group(1)
    otp_fill("000000" if otp != "000000" else "111111"); pg.click("#nut"); pg.wait_for_timeout(800)
    check("OTP sai: báo lỗi, ở lại bước 2", pg.locator("#loi-otp").inner_text().strip() != "" and pg.locator(".dn-otp").count() == 1)
    otp_fill(otp); pg.click("#nut"); pg.wait_for_timeout(1200)
    check("bước 3: form thông tin", pg.locator("#f-passwordConfirm").count() == 1)
    pg.fill("#f-name", "Nguyen Van Thu"); pg.fill("#f-password", "yeu"); pg.fill("#f-passwordConfirm", "yeu"); pg.click("#nut"); pg.wait_for_timeout(800)
    check("mật khẩu yếu: ô password đỏ + luật ✗ (chặn ngay ở client, server cũng kiểm lại)", pg.locator("[data-field=password] input.loi").count() == 1 and pg.locator(".dn-dk li.bad").count() >= 1)
    pg.fill("#f-password", "Thu0Matkhau1"); pg.fill("#f-passwordConfirm", "Thu0Matkhau1"); pg.fill("#f-inviteCode", ""); pg.click("#nut"); pg.wait_for_timeout(1500)
    check("đăng ký xong -> /login, chưa có token", "/login" in pg.url and token() is None, pg.url)
    login(new, "Thu0Matkhau1")
    check("đăng nhập tài khoản mới -> /khach (role viewer)", pg.url.endswith("/khach"), pg.url)
    check("role của tài khoản mới là viewer", api("GET", "/auth/me", token=token())[1]["data"]["role"] == "viewer")
    dang_xuat()

    print("T-G. MFA")
    s, d = api("POST", "/auth/login", {"email": "editor@example.com", "password": PW}); tk = d["data"]["accessToken"]
    s, d = api("POST", "/mfa/setup", token=tk); secret = d["data"]["secret"]
    s, d = api("POST", "/mfa/enable", {"code": totp(secret)}, token=tk)
    rec = d["data"]["recoveryCodes"]; check("(chuẩn bị) bật MFA cho editor", s == 200 and len(rec) == 10)
    login("editor@example.com")
    check("mật khẩu đúng + bật MFA -> /mfa, chưa có token", pg.url.endswith("/mfa") and token() is None, pg.url)
    otp_fill("123456" if totp(secret) != "123456" else "654321"); pg.click("#nut"); pg.wait_for_timeout(800)
    check("mã sai: báo lỗi, vẫn ở /mfa, chưa có token", pg.locator("#loi").is_visible() and pg.url.endswith("/mfa") and token() is None)
    otp_fill(totp(secret, 1)); pg.click("#nut"); pg.wait_for_timeout(2500)
    check("mã đúng -> vào khu quản trị với token", "/admin/dishes" in pg.url and token() is not None, pg.url)
    dang_xuat()
    login("editor@example.com")
    pg.click("#doi"); pg.fill("#f-recoveryCode", rec[0]); pg.click("#nut"); pg.wait_for_timeout(2500)
    check("mã khôi phục -> đăng nhập được", "/admin/dishes" in pg.url and token() is not None, pg.url)
    dang_xuat()
    login("editor@example.com")
    pg.reload(); pg.wait_for_timeout(800)
    check("F5 ở /mfa mất challenge (chỉ trong bộ nhớ) -> /login", "/login" in pg.url, pg.url)
    check("challenge không nằm trong localStorage/sessionStorage", "eyJ" not in pg.evaluate("JSON.stringify(localStorage)+JSON.stringify(sessionStorage)"))
    # tắt MFA để trả lại trạng thái ban đầu
    s, d = api("POST", "/auth/login", {"email": "editor@example.com", "password": PW})
    s, d = api("POST", "/auth/mfa/verify", {"challenge": d["data"]["challenge"], "recoveryCode": rec[1]})
    api("POST", "/mfa/disable", {"password": PW, "recoveryCode": rec[2]}, token=d["data"]["accessToken"])

    print("T-H. Khóa 429 + next an toàn")
    for _ in range(10): api("POST", "/auth/login", {"email": "khoa@example.com", "password": "Sai0Matkhau"})
    goto("/login"); pg.fill("#f-email", "khoa@example.com"); pg.fill("#f-password", "Sai0Matkhau")
    if pg.locator("#captcha").is_visible(): tick_cap()
    pg.click("#nut"); pg.wait_for_timeout(900)
    check("bị khóa: nút đếm ngược, bị vô hiệu", pg.locator("#nut").is_disabled() and "thử lại sau" in pg.locator("#nut").inner_text().lower())
    goto("/login?next=//evil.com"); pg.fill("#f-email", "admin@example.com"); pg.fill("#f-password", PW); pg.click("#nut"); pg.wait_for_timeout(1500)
    pg.wait_for_function("!location.pathname.startsWith('/login')", timeout=8000)   # chờ trang sau đăng nhập dựng xong (bcrypt + chuyển trang có thể > 1,5 giây)
    check("next=//evil.com bị bỏ qua, ở lại cùng origin", pg.url.startswith(BASE), pg.url)
    dang_xuat()
    goto("/login?next=/admin/ingredients"); pg.fill("#f-email", "admin@example.com"); pg.fill("#f-password", PW)
    if pg.locator("#captcha").is_visible(): tick_cap()
    pg.click("#nut"); pg.wait_for_timeout(1500)
    check("next=/admin/ingredients được theo sau khi đăng nhập", "/admin/ingredients" in pg.url, pg.url)

    print("T-I. Lỗi JS")
    check("không có lỗi JS / console error", not errors, "; ".join(errors[:3]))
    br.close()

print(f"\n{total - len(fails)}/{total} đạt")
sys.exit(1 if fails else 0)
