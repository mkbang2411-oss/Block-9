# Kế hoạch chuyển Block 7 (CSR) sang JWT

Block 7 là SPA+ REST API nhưng "đăng nhập" mới chỉ là chọn vai bằng cookie; Block 8 có
xác thực thật nhưng là SSR và chưa có MFA, RBAC/ABAC. Kế hoạch: đưa luồng đăng ký/
đăng nhập/ đăng xuất/ quên mật khẩu của Block 8 sang API của Block 7 dùng JWT, viết
thêm MFA+ RBAC/ABAC theo file txt, và chuyển phần trang home mới (thuyền, cô gái, vé
hành khách) sang SPA.


---

## 1. Hiện trạng hai block
Hạng mục Block 7 (CSR) Block 8 (SSR)

Kiến trúc SPA frontend/ + REST /api, EJS render phía server
cùng origin

Đăng nhập Chọn vai user/admin, không mật Email+ mật khẩu (bcrypt),
khẩu, cookie role cookie sid+ bảng sessions

Đăng ký/ OTP/ quên Không có Có: CAPTCHA→ OTP email→
mật khẩu tạo tài khoản; link đặt lại 30
phút

Chố ng dò mật khẩu Không Sai 3 lần→ CAPTCHA, sai 10
lần→ khóa5 phút, rate limit
theo IP

Đăng xuất POST /api/auth/logout xóa POST /logout hủy phiên
cookie trong DB (bấm thuyền ở trang
phố)

Phân quyền requireAdminApi dựa vào cookie Role tài khoản customer/
role (client tự chọn được) chef+ vai đang chọn

CSRF Không có Double-submit token

MFA, RBAC/ABAC, Không có Không có (chỉ nằm trong file
JWT txt)

Trang home Phố+ hộp chọn vai Thêm thuyền= đăng xuất, cô
gái= vé hành khách+ avatar,
chưa đăng nhập thì bấm nhà
hàng ra /login, kiểm tra vai

Lưu ý: file txt nói "chuyển MFA, recovery code, RBAC/ABAC từ Bài 1 sang API", nhưng
Block 8 chưa có các phần này nên sẽ phải viết mới trực tiếp trên API, không phải copy.


---

## 2. Cần chốt trước khi code
Mình đang giả định theo cột "Đề xuất". Bạn đổi ý mục nào thì báo, mình sẽ sửa lại kế hoạch.

# Vấn đề Đề xuất Lý do

Q1 Role tài Đổi customer/ chef thành viewer Khớp RBAC trong file txt
khoản/ editor/ admin (customer→ (Viewer đọc, Editor
viewer, chef→ editor, admin cấp đọc/tạo/sửa, Admin thêm
bằng script). Vai "Khách/ Đầu bế p" xóa)
chọn ở phố chỉ là giao diện

Q2 Dữ liệu cho Thêm users.chefId (nối bảng Editor chỉ sửa món có chefId
ABAC chefs) và dishes.status= draft của mình và còn draft; hiện
/ published chưa có hai cột này

Q3 Mã lỗi đăng INVALID_CREDENTIALS, Đề không nói rõ status; tránh
nhập ACCOUNT_NOT_ACTIVATED trả HTTP việc SPA xóa token/ chuyển
200 + ok:false (lỗi nghiệp vụ như trang mỗi khi gõ sai mật khẩu
NOT_FOUND hiện tại). 401 chỉ dành
cho thiếu/ sai/ hết hạn token. Đổi
tên UNAUTHORIZED thành
UNAUTHENTICATED

Q4 Nơi lưu localStorage (try/catch), access Đề yêu cầu chứng minh sửa
token token sống 15 phút, không làm localStorage không tăng
refresh token. Ghi rõ rủi ro XSS trong quyền; frontend đã có hàm
README esc() để escape

Q5 Thu hồi Thêm users.tokenVersion, JWT Đơn giản hơn danh sách jti;
token mang claim tv; +1 khi đổi mật khẩu, đúng gợi ý trong file txt
khóa tài khoản, đổi role. Bảng
sessions không dùng nữa

Q6 Thư viện jsonwebtoken (HS256, cố định B8 đã dùng bcryptjs+
algorithms ), otplib+ qrcode, nodemailer
bcryptjs, nodemailer

Q7 Editor và scripts/set-role.js <email> Tài khoản không tự chọn được
chefId <role> [chefId]; mã mời đầu bếp mình đứng tên
CHEF_INVITE_CODE chỉ lên editor,
admin gán chefId sau


---

## 3. Thứ tự làm và mức ưu tiên
P0 = nền tảng, thiếu là các phần sau không chạy; P1 = yêu cầu cốt lõi của file txt; P2 = cần
nhưng phụ thuộc P0/P1; P3 = hoàn thiện. Home của Block 8 chỉ cần xong Đợt 1 là làm song
song được.

Đợt Nội dung Ưu Xong khi
tiên

1 Nền JWT: model User, jwt.js, P0 Đăng nhập bằng email/mật khẩu;
middleware authenticate, POST gọi /api/chefs có token được,
/api/auth/login (chưa MFA), GET không token thì 401; trang khách
/api/auth/me, đổi mã lỗi, CORS cho vẫn tìm kiếm/ phân trang như cũ
Authorization; frontend gắn Bearer
ở api.js+ trang đăng nhập mới

2 Đăng ký3 bước (CAPTCHA→ OTP→ P1 Đủ luồng như Block 8, tài khoản
thông tin), quên/ đặt lại mật khẩu, pending không nhận token
đếm sai+ khóa, rate limit 429; trang
SPA tương ứng

3 RBAC+ ABAC cho CRUD, thêm P1 Viewer 403 khi ghi, Editor 403 khi
users.chefId+ dishes.status; ẩn xóa hay sửa món người khác, Admin
nút/ route guard ở giao diện sửa được; request gửi trực tiếp
cũng bị chặn

4 MFA TOTP: setup, enable, verify, P1 Password đúng mà chưa MFA thì
recovery code, xác thực lại thao tác không có accessToken; mã dùng
nhạy cảm; trang MFA rồi bị từ chối

5 Home từ Block 8: thuyền đăng xuất, P2 Trang phố của Block 7 có đủ tính
cô gái+ vé+ avatar, chưa đăng nhập năng như Block 8
→ /login, kiểm tra vai, ảnh/ CSS/
âm thanh

6 Dọn code SSR chết, cập nhật P2 / Qua bảng kiểm thử mục 8; không
API.md, README, mock-server, P3 còn file không dùng
test-search.js; chụp bằng chứng


---

## 4. Backend
Loại: THÊM= file/ bảng/ endpoint mới, ĐỔI= sửa cái đang có, GIỮ= không đụng.

# Việc Loại File (Block 7) Nguồn Block 8 / ghi chú Ưu
tiên

B1 Cài thêm bcryptjs, THÊM package.json,.env.example.env.example của B8 P0
jsonwebtoken, nodemailer,
otplib, qrcode; thêm biến
.env: JWT_SECRET (≥ 32 byte),
JWT_EXPIRES_IN, APP_URL,
MAIL_* / SMTP_*, RECAPTCHA_*,
CHEF_INVITE_CODE;
CORS_ORIGIN ghi origin cụ thể

B2 Model User (thêm role THÊM src/models/User.js, Copy User.js của B8, P0
viewer/editor/admin, chefId, models/index.js đổi role, bỏ avatar nếu
tokenVersion, mfaEnabled, chưa làm home
mfaSecret, mfaLastStep,
failedMfa, mfaLockedUntil)

B3 Model RegisterOtp, THÊM src/models/ Copy nguyên từ B8 P1
PasswordReset

B4 Model RecoveryCode( userId, THÊM src/models/RecoveryCode.js Mới, B8 không có P1
codeHash, usedAt, batchId)

B5 Thêm cột dishes.status THÊM models/Dish.js, Mới. Seed: món cũ đặt P1
(draft/published); đưa vào parse, admin/resources.js, published
serializer, seed, form api/serializers.js,
scripts/seed.js

B6 Thêm migrate cột thiếu cho DB THÊM src/utils/migrate.js, Copy P0
đang có dữ liệu( users.chefId, src/server.js addMissingColumns của
dishes.status) B8; gọi sau
sequelize.sync()

B7 Copy tiện ích: security.js, THÊM src/utils/ B8. rateLimit.js sửa P0 / P1
validators.js, mailer.js, để trả 429
recaptcha.js, rateLimit.js, RATE_LIMITED theo định
cleanup.js dạng API (hiện render
trang lỗi)

B8 jwt.js: ký+ verify HS256, cố THÊM src/utils/jwt.js Mới. Từ chối none và P0
định algorithms, claim sub, token tự khai thuật toán
exp, iss, aud, jti, tv; loại
token riêng cho challenge MFA
(sống ngắ n, chỉ dùng ở
/mfa/verify)

B9 Middleware authenticate: ĐỔI src/middleware/auth.js, Thay attachRole/ P0
verify token→ đọc user+ role từ src/api/middleware.js requireAdminApi dùng
DB (không tin claim role) → so cookie role
tokenVersion→ gắn req.user.
Thiếu/ sai chữ ký→ 401
UNAUTHENTICATED, hết hạn→ 401
TOKEN_EXPIRED

# Việc Loại File (Block 7) Nguồn Block 8 / ghi chú Ưu
tiên

B10 POST /api/auth/login: kiểm ĐỔI src/routes/api.js (gắn router Port logic từ P0
tra mật khẩu (bcrypt, hash giả mới src/routes/auth-api.js tại routes/auth.js của B8
khi email không tồn tại), đếm sai /api/auth) (dòng 159–320), đổi
15 phút, CAPTCHA từ lần sai thứ redirect 303 thành JSON
3, khóa5 phút sau 10 lần, { ok, data}
ACCOUNT_NOT_ACTIVATED; đúng
mật khẩu+ MFA bật→ trả
next:"mfa" + challenge, chưa
có accessToken

B11 GET /api/auth/me: trả{ id, ĐỔI auth-api.js Hiện trả{ role} từ P0
name, email, role, chefId, cookie
mfaEnabled}

B12 POST /api/auth/logout (client ĐỔI auth-api.js Giữ endpoint để SPA gọi P0
xóa token; server trả ok) thố ng nhất

B13 Đăng ký: THÊM auth-api.js Copy logic B8 (dòng 323– P1
/api/auth/register/otp, 630)
/register/verify, /register
(role mặc định viewer, bỏ qua
role client gửi)

B14 Quên/ đặt lại mật khẩu: link THÊM auth-api.js, mailer.js B8 dòng 632–790; đổi P1
email trỏ về trang SPA /reset- baseUrl sang URL của
password?token=; đổi xong SPA
tokenVersion+ 1, gửi mail
"mật khẩu đã đổi"; không tắt
MFA, không cấp token

B15 Mã lỗi: đổi UNAUTHORIZED→ ĐỔI src/api/errors.js, – P0
UNAUTHENTICATED; thêm api/middleware.js, API.md
TOKEN_EXPIRED,
INVALID_CREDENTIALS,
ACCOUNT_NOT_ACTIVATED,
RATE_LIMITED (429),
MFA_REQUIRED,
INVALID_MFA_CODE; sửa câu
FORBIDDEN (không còn "cần role
admin")

B16 CORS: chỉ cho origin trong ĐỔI src/api/middleware.js Hiện đang phản chiếu P0
CORS_ORIGIN, Access-Control- header yêu cầu và bật
Allow-Headers: Content-Type, credentials
Authorization, bỏ Allow-
Credentials (không còn
cookie), không dùng*; trả
preflight OPTIONS 204

# Việc Loại File (Block 7) Nguồn Block 8 / ghi chú Ưu
tiên

B17 RBAC: bảng quyền role→ hành THÊM src/api/permissions.js, Mới P1
động( dish:read/ create/ src/routes/api.js
update/ delete, tương tự chef,
ingredient); middleware
requirePermission(action)
thay requireAdminApi. GET
/api/dishes vẫn công khai; GET
/api/chefs, /ingredients cho
viewer trở lên

B18 ABAC cho PATCH/ DELETE món ĐỔI src/routes/api.js (3 đoạn Mới P1
theo thứ tự: 401 → 403 theo role router.post/ patch/ delete ),
→ 404 → 403 theo thuộc tính→ admin/resources.js
thực hiện. Editor chỉ sửa món
chefId= user.chefId và
status= draft; đọc lại bản ghi
trong transaction lúc ghi. POST
món: Editor bị ép chefId= của
mình. Không dùng role,
chefId, status từ body để
quyết định quyền

B19 MFA TOTP: POST THÊM src/routes/mfa.js, Mới. Chấp nhận bước P1
/api/mfa/setup (tạo secret, src/utils/totp.js thời gian hiện tại± 1; lưu
mfaEnabled=false, trả QR), mfaLastStep để không
/mfa/enable (nhập mã6 số→ dùng lại; sai quá giới hạn
bật, tạo recovery code, hiện1 thì khóa tạm
lần), POST
/api/auth/mfa/verify
(challenge+ OTP hoặc recovery
→ cấp accessToken)

B20 Recovery code: lưu hash từng mã THÊM src/routes/mfa.js Mới P1
+ usedAt, mỗi mã dùng1 lần, tạo
nhóm mới thì nhóm cũ vô hiệu

B21 Xác thực lại (mật khẩu+ TOTP THÊM src/routes/mfa.js Mới P1
hoặc recovery) cho: đổi thiết bị,
tắt MFA, xem/ tạo lại recovery
code

B22 Serializer người dùng: không bao THÊM src/api/serializers.js– P0
giờ trả passwordHash,
mfaSecret, hash recovery; JWT
payload chỉ gồm định danh,
không chứa mật khẩu/ secret/
dữ liệu cá nhân

B23 scripts/set-role.js <email> THÊM scripts/set-role.js, B8 có sẵn bản2 role P2
<role> [chefId]; seed3 tài scripts/seed.js
khoản mẫu viewer/ editor/
admin

# Việc Loại File (Block 7) Nguồn Block 8 / ghi chú Ưu
tiên

B24 Gắn startCleanup() vào THÊM src/server.js, B8; bỏ phần P2
server.js (dọn OTP, link đặt lại, utils/cleanup.js Session.destroy
tài khoản chưa kích hoạt)

B25 Không copy csrf.js (không GIỮ– Ghi lý do vào README P2
còn cookie xác thực nên không (bỏ
có CSRF) qua)

B26 Giữ nguyên: list-query.js, GIỮ– Tìm kiếm+ phân trang–
runList, serializers của phải y như trước
CRUD, upload ảnh món,
/api/options, /api/health,
định dạng{ ok, data, meta}

5. Frontend( frontend/js)

# Việc Loại File Ghi chú Ưu
tiên

F1 Gắn Authorization: ĐỔI api.js Hiện đang dùng cookie P0
Bearer <token> ở MỘT role
chỗ trong request(), chỉ
gửi tới API_BASE; bỏ
credentials:
"include"; thêm
api.auth.* (login,
register, otp, forgot, reset,
mfa)

F2 state.js: lưu token ĐỔI state.js– P0
(localStorage, bọc
try/catch) + thông tin me;
getRole() thành
getMe(); vai đang chọn
(Khách/ Đầu bế p) chỉ là
trạng thái giao diệ n, không
gửi lên server để quyết
định quyền

# Việc Loại File Ghi chú Ưu
tiên

F3 Xử lý lỗi: 401 → xóa token ĐỔI router.js (hàm Đổi UNAUTHORIZED→ P0
và về /login; taoView ), api.js UNAUTHENTICATED; route
TOKEN_EXPIRED tương tự guard chỉ là lớp giao diện
kèm thông báo; 403 → báo
không đủ quyền, giữ
token; 429 → báo thử lại;
mất mạng/ 500 không
đăng xuất

F4 Trang đăng nhập: thay ĐỔI pages/login.js Port giao diện từ P0
form "chọn vai" bằng email views/login.ejs+
+ mật khẩu, CAPTCHA khi public/js/dang-
server bảo, đếm ngược khi nhap.js (775 dòng)
bị khóa, link quên mật thành ES module; bỏ
khẩu, tab đăng ký <form action> +
_csrf

F5 Đăng ký3 bước (email+ THÊM pages/register.js– P1
CAPTCHA→ OTP→ họ tên, (hoặc tab trong
mật khẩu, mã mời) login.js)

F6 Trang quên mật khẩu và THÊM pages/forgot.js, Trang đặt lại nên đặt P1
đặt lại mật khẩu( ? pages/reset.js Referrer-Policy: no-
token= ) referrer

F7 Trang nhập mã MFA sau THÊM pages/mfa-verify.js Giữ challenge trong bộ P1
khi mật khẩu đúng (OTP6 nhớ, không lưu vào
số hoặc recovery code) localStorage

F8 Trang bảo mật tài khoản: THÊM pages/security.js– P1
bật MFA (QR, nhập mã,
hiện recovery code một
lần), tắt MFA, tạo lại
recovery code (hỏi lại mật
khẩu+ mã)

F9 Khai báo route mới: ĐỔI main.js, router.js– P1
/register, /forgot-
password, /reset-
password, /mfa,
/account/security; đổi
role: "admin" thành
kiểm tra đăng nhập+ role
thật từ /me

# Việc Loại File Ghi chú Ưu
tiên

F10 Khu quản trị theo role: ĐỔI pages/listing.js, Chỉ là UX; mọi quyền đã P1 /
Viewer chỉ đọc (ẩn Thêm/ pages/admin-form.js, kiểm ở B17–B18 P2
Sửa/ Xóa); Editor không pages/admin-delete.js
thấ y Xóa; ẩn nút Sửa với
món không thuộc mình
hoặc đã published; form
món của Editor khóaô đầu
bếp= chefId của mình.
Server vẫn là nơi quyết
định

F11 Thêmô status (draft/ ĐỔI resources.js, – P1
published) cho món ăn pages/admin-form.js,
list-config.js

F12 Thanh trên: thêm Đăng ĐỔI utils.js( thanhTren) – P2
xuất, Bảo mật khi đã đăng
nhập; giữ nút Đăng nhập
khi chưa

F13 Trang khách /dishes, GIỮ pages/khach.js, Chỉ chạy lại để chắc P0
/khach, chi tiết món: chạy listing.js, dish- không hỏng
được khi không có token, detail.js
tìm kiếm/ phân trang/ ba
chế độ hiển thị giữ nguyên

F14 Escape mọi dữ liệu người ĐỔI pages/listing.js, Rà lại xem đã dùng P1
dùng khi render pages/khach.js esc() chưa
innerHTML( listing.js
có6 chỗ, khach.js có1
chỗ ), vì token nằm ở
localStorage

6. Trang home: phần Block 8 có mà Block 7 chưa có
Phần sinh con phố( pho.js ), kéo phố, mũi tên "Nhà hàng hướng này" và mặt đất đã giố ng
nhau, giữ bản Block 7. Chỉ còn các mục sau.

# Việc Loại File (Block 7) Nguồn Block 8 Ưu
tiên

H1 Khi vào trang chủ đang ĐỔI pages/home.js (hàm routes/pages.js chỉ xoá P0
gọi api.logout() ("ra load) cookie vai
phố= tự thoát vai"). Với
JWT điều này sẽ đăng
xuất mỗi lần ra phố nên
phải bỏ; chỉ reset vai
đang chọn ở client

H2 Thuyền= đăng xuất: khi THÊM pages/home.js views/home.ejs (khối P1
đã đăng nhập, thuyền là thuyen ),
nút, bấm thì lắc+ tiế ng public/js/home.js
nước+ hộp "Bạn có (đoạn "thuyền= đăng
chắc muốn đăng xuất?"; xuất")
đồ ng ý thì gọi
api.logout(), xóa
token, về /login

H3 Chưa đăng nhập: bấm ĐỔI pages/home.js, public/js/common.js P1
nhà hàng thì chạy hiệu effects.js (thêm hàm nuocTran
ứng nước tràn rồi sang nuocTran)
/login (thay vì mở hộp
chọn vai)

H4 Hộp chọn vai: tài khoản ĐỔI pages/home.js home.js dòng 137–156 P1
viewer chọn Đầu bếp
thì hiện hộp "Vai trò
không hợp lệ" và tự
chuyển về Khách hàng;
lấ y role từ
/api/auth/me, vào
/admin thật sự vẫn do
server quyết định

H5 Cô gái áo dài ở đầu phố: THÊM pages/home.js views/home.ejs (khối P2
chỉ hiện khi đã đăng cong-dn) + home.js
nhập; bấm mở Vé hành (hàm moVe, khoảng 300
khách (tên+ avatar dòng)
tròn), tiế ng cười

# Việc Loại File (Block 7) Nguồn Block 8 Ưu
tiên

H6 Đổi/ chỉnh ảnh đại diệ n: THÊM pages/home.js+ auth- routes/auth.js dòng P2
kéo, zoom, cắt vuông api.js, models/User.js 837–869,
512px trên trình duyệ t, utils/storage.js
gửi multipart tới POST( uploadAvatar)
/api/auth/avatar kèm
Bearer; backend resize
+ lưu Supabase
( avatarUrl,
avatarPath)

H7 Dùng daDangNhap từ ĐỔI pages/home.js data-dn, data-tk trong P1
getMe() thay cho biến home.ejs
EJS; trang chủ vẫn mở
được khi chưa đăng
nhập

H8 Phím mũi tên không dạo ĐỔI pages/home.js public/js/home.js dòng P3
phố khi đang mở hộp 69–75
thoại/ vé: kiểm tra
.lop:not([hidden])
thay cho
hopVai.hidden

H9 Copy ảnh và âm thanh THÊM frontend/img/, public/img/, P2
còn thiếu: img/pho/co- frontend/audio/ public/audio/ của B8
gai.webp, bang-dang-
nhap.webp, bang-dang-
xuat.webp, img/dang-
nhap/ (4 ảnh),
audio/co-gai-cuoi-
1..4.mp3. img/day-
keo.webp chỉ có ở Block
7, giữ

H10 CSS: port các khối của ĐỔI frontend/css/style.css public/css/style.css P2
B8 (nút thuyền→ style.min.css (B8 4.920 dòng, B7 4.184
.thuyen-nut/.bam/ dòng)
.lac,.cong-dn,.co-
gai-nut,.ve-*,.lop-
ve,.dn-* ) và gộp khối
<style> trong
partials/auth-
style.ejs; không ghi
đè phần danh sách+
dây kéo của B7; chạy
npm run build:css

# Việc Loại File (Block 7) Nguồn Block 8 Ưu
tiên

H11 am-thanh.js: thêm ĐỔI frontend/js/am-thanh.js public/js/am-thanh.js P3
hàm giong() và tiế ng
cuoi từ B8, merge tay
vì B7 đã đổi kieu thành
hàm và window.Am cho
SPA

7. Xoá/ dọn
README nói SSR cũ đã bỏ, nhưng các file dưới đây vẫn còn trong zip; app.js chỉ mount
/api nên chúng không còn chạy. Xoá sau khi Đợt 1 chạy ổn để dễ so sánh khi cần.

# Xoá/ bỏ File Lý do Ưu
tiên

X1 Route SSR cũ src/routes/admin.js, Không được mount; auth.js P2
public.js, pages.js, cũ dùng cookie role
auth.js (bản chọn vai)

X2 Giao diện EJS+ tài src/views/**, public/ (css, frontend/ đã thay thế P3
nguyên SSR js, img/bep.jpg ), ( pho.js đã chuyển sang
src/utils/pho.js frontend/js/pho.js)

X3 Middleware vai bằng attachRole, requireAdmin, Thay bằng authenticate+ P0
cookie hằ ng ROLES trong requirePermission (khi
src/middleware/auth.js; làm
requireAdminApi trong B9)
api/middleware.js

X4 Endpoint chọn vai POST /api/auth/login{ Thay bằng đăng nhập thật P0
role} và cookie role

X5 Thư viện không dùng cookie-parser, method- Không còn cookie xác thực, P3
nữa override, ejs trong không còn form SSR; xoá
package.json app.use(cookieParser())

X6 Giao diện "chọn vai pages/login.js bản cũ, Chỉ còn chonVai ở hộp trên P1
không mật khẩu" chonVai trong trang đăng trang chủ
nhập

X7 mock- auth theo cookie role Lệ ch hợp đồ ng mới; sửa cho P3
server/server.js khớp JWT hoặc bỏ và xoá
script mock

# Xoá/ bỏ File Lý do Ưu
tiên

X8 Tài liệu cũ README "chưa triển khai xác Viết lại theo JWT, ghi rủi ro còn P2
thực bằng mật khẩu" và "form lại (XSS lấ y token, token đã cấp
render từ máy chủ"; API.md còn dùng đến khi hết hạn)
mục auth, mã UNAUTHORIZED,
câu "vai user/ admin"

8. Kiểm thử và bằng chứng nghiệm thu
Bằ ng chứng nên gồm ảnh giao diệ n, tab Network, tab Application→ Local Storage, request
gửi trực tiếp (curl/ Postman), dữ liệu DB liên quan. Che Authorization, token, OTP,
secret trước khi nộ p.

# Chứng minh Cách làm Kết quả mong đợi Đợt

T1 Không token GET /api/chefs không 401 UNAUTHENTICATED1
header

T2 Token sai chữ ký Sửa1 ký tự trong token, đổi 401 UNAUTHENTICATED1
/ sửa payload/ role trong payload
alg: none

T3 Token hết hạn Đặt JWT_EXPIRES_IN=5s rồi 401 TOKEN_EXPIRED1
chờ

T4 Preflight CORS Chạy web ở origin khác (vd Origin đúng được, origin lạ1
localhost:5173 ), xem bị chặn
OPTIONS có Allow-
Headers: Authorization;
thử origin lạ

T5 API công khai giữ Chạy npm run Vẫn pass1
tìm kiếm+ phân test:search (102 kiểm tra);
trang sửa chỗ đang gửi Cookie:
role=admin thành Bearer
token

T6 Tài khoản Đăng nhập email chưa kích Không có accessToken; 2
pending/ sai mật hoạt; sai mật khẩu3 / 10 lần CAPTCHA lần 3, khóa lần
khẩu 10; server áp CAPTCHA và
rate limit (429)

# Chứng minh Cách làm Kết quả mong đợi Đợt

T7 Reset mật khẩu Đặt lại xong đăng nhập Token cũ bị từ chố i; nếu đã 2/
bật MFA thì vẫn phải qua4
MFA

T8 RBAC Viewer POST món; Editor 403, 403, 200; dữ liệu3
DELETE món; Admin không đổi khi 403
DELETE

T9 ABAC Editor PATCH món của đầu 403, 403, 200, 200 3
bếp khác; món của mình
nhưng published; món của
mình+ draft; Admin sửa
món người khác

T10 Không tin client Sửa role/ chefId/ status Quyền không tăng, 3
trong localStorage và trong request gửi thẳng cũng bị
body request chặn

T11 MFA chưa xong Password đúng, chưa nhập Không có accessToken; 4
mã; dùng challenge gọi challenge không gọi được
/api/chefs API nghiệp vụ

T12 Mã dùng lại Nhập lại TOTP đã dùng; Bị từ chối/ khóa tạm4
recovery code dùng lần 2;
sai quá giới hạn

T13 Thao tác nhạy Tắt MFA/ xem recovery Yêu cầu mật khẩu+ mã4
cảm code khi đang có token

T14 Trang home Đăng xuất bằng thuyền; ra Đúng như Block 8 5
phố không bị đăng xuất; tài
khoản viewer chọn Đầu
bế p; đổi avatar
