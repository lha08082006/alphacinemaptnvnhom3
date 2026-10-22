# BETA CINEMAS DEMO - HỆ THỐNG ĐẶT VÉ & ĐỐI SOÁT CỔNG THANH TOÁN TỰ ĐỘNG
> **Dự án phục vụ bài thuyết trình nhóm môn Phân tích Nghiệp vụ (Business Analysis)**  
> **Chủ đề**: Giải quyết bài toán Giao dịch treo (Hanging Transaction) trong thanh toán trực tuyến bằng Cơ chế Đối soát hai chiều (Two-way Reconciliation) & Tự động Hoàn tiền (Auto Refund).

---

## 1. Hướng Dẫn Cài Đặt & Khởi Chạy

Dự án được xây dựng bằng **Node.js + Express thuần**, hoàn toàn **In-Memory** (không cần cài cơ sở dữ liệu, không cần ngrok, không cần API key ngoài).

### Bước 1: Mở Terminal tại thư mục dự án
```bash
cd d:\web\beta-cinemas-demo\beta-payment-demo
```
*(Hoặc từ thư mục gốc `d:\web\beta-cinemas-demo`: chạy `npm run demo`)*

### Bước 2: Cài đặt thư viện (chỉ express)
```bash
npm install
```

### Bước 3: Khởi chạy máy chủ
```bash
npm start
```
Màn hình console sẽ hiển thị:
```text
================================================================
  BETA CINEMAS - DEMO LUỒNG THANH TOÁN & ĐỐI SOÁT HOÀN TIỀN
  Giao diện khách: http://localhost:3000
  Cổng quản trị:   http://localhost:3000/admin/login
================================================================
```

---

## 2. Danh Sách Tài Khoản Thử Nghiệm

Mật khẩu dùng chung cho tất cả tài khoản: `123456` (hoặc `123`). Trên các trang đăng nhập đều có **nút 1-click Quick Login** để bấm phát đăng nhập ngay trong buổi thuyết trình.

| Vai trò | Email đăng nhập | Phân quyền truy cập | Mục đích demo |
| :--- | :--- | :--- | :--- |
| **Khách hàng** | `khach@demo.vn` | Giao diện đặt vé (`/`, `/seats`, `/orders`, `/support`) | Đặt vé, chọn ghế, thanh toán, nhận vé, gửi khiếu nại |
| **Quản lý (Manager)** | `manager@demo.vn` | Toàn quyền tất cả các trang quản trị (`/admin/*`) | Xem tổng quan doanh thu, danh sách user, kiểm soát hệ thống |
| **Kế toán (Accountant)** | `ketoan@demo.vn` | Đối soát (`/admin/reconcile`), Hoàn tiền, Báo cáo CSV | Chạy đối soát, duyệt hoàn tiền, xuất báo cáo tài chính |
| **CSKH (Support)** | `cskh@demo.vn` | Giám sát đơn, Hàng đợi khiếu nại (`/admin/tickets`) | Tiếp nhận ticket lỗi giao dịch, cập nhật tiến độ cho khách |
| **Kỹ thuật (IT)** | `it@demo.vn` | Giám sát 3 bảng, Cấu hình timeout (`/admin/settings`) | Bật tắt As-is/To-be, chỉnh thời gian timeout, xem Audit Logs |

---

## 3. Kịch Bản Demo Từng Bước Cho Buổi Thuyết Trình

### KỊCH BẢN 1: Thanh Toán Thành Công (Happy Path - Luồng Chuẩn)
* **Mục tiêu**: Chứng minh luồng nghiệp vụ tích hợp cổng thanh toán lý tưởng khi không có sự cố mạng.
1. **Bước 1**: Khách hàng mở `http://localhost:3000`, chọn phim *Trại Buôn Người*, bấm **"Đặt vé ngay"**.
2. **Bước 2**: Tại trang chọn ghế (`/seats`), chọn ghế **A5, A6** (Tổng: 150.000đ) ➔ Bấm **"Tiếp tục thanh toán"**.
3. **Bước 3**: Đăng nhập tài khoản khách: `khach@demo.vn / 123456` (hoặc bấm nút Quick Login).
4. **Bước 4**: Tại trang xác nhận (`/checkout`), chọn phương thức **Cổng VNPay**.
5. **Bước 5**: Giao diện cổng giả lập hiện ra với mã QR. Bấm kịch bản:  
   👉 **(1) Thanh toán thành công (Happy Path)**.
6. **Bước 6**: Cổng trừ tiền và gửi ngay Webhook IPN ➔ Hệ thống tự động chuyển về trang `/result` ➔ Tự động mở vé điện tử E-Ticket tại `/ticket/:orderId` với mã vé `TK...` và mã QR check-in rạp.

---

### KỊCH BẢN 2: Giao Dịch Treo ở Quy Trình Hiện Tại (As-is)
* **Vấn đề thực tế**: Khách hàng đã bị trừ tiền trong tài khoản ví/ngân hàng, nhưng do mạng chập chờn, Webhook IPN bị rớt trên đường truyền. Sau 15 giây, website Beta Cinemas đánh rớt đơn thành `FAILED` và nhả ghế ra. Khách hàng mất tiền mà không có vé, sinh ra khiếu nại gay gắt!
1. **Bước 1**: Đảm bảo hệ thống đang ở chế độ **AS-IS** (Mặc định).
2. **Bước 2**: Khách hàng vào đặt ghế **C1, C2** ➔ Chọn cổng **Ví MoMo**.
3. **Bước 3**: Tại giao diện cổng MoMo, bấm kịch bản:  
   👉 **(2) MẤT CALLBACK (Gây lỗi treo đơn As-is)**.
4. **Bước 4**: Cổng ghi nhận `SUCCESS` (Khách đã bị trừ tiền trong ví), nhưng **cố tình không gửi IPN sang website**.
5. **Bước 5**: Quay lại website kiểm tra tại trang `/result`:
   - Sau 15 giây timeout, đơn hàng bị đổi sang: **`FAILED` (Thất bại / Quá hạn)**.
   - Ghế C1, C2 bị hệ thống nhả tự do ra ngoài!
6. **Bước 6**: Mở trang Quản trị `http://localhost:3000/admin`:
   - Thẻ đỏ cảnh báo: **`GIAO DỊCH TREO = 1`**!
   - Vào mục *Báo cáo kế toán* (`/admin/reports`): Xuất hiện khoản **Chênh lệch 150.000đ** (Cổng thu tiền nhưng vé không xuất).
7. **Bước 7**: Khách hàng vào mục **🎧 HỖ TRỢ** (`/support`), nhập mã đơn và email ➔ Hệ thống phát hiện ngay: *"Phát hiện giao dịch treo: Ví đã trừ tiền nhưng đơn bị rớt"*. Khách gửi form khiếu nại CSKH sinh mã Ticket có hạn SLA 24h.

---

### KỊCH BẢN 3: Khắc Phục Bằng Đối Soát Tự Động & Hoàn Tiền (To-be)
* **Giải pháp đề xuất**:
  1. Khi timeout 15s xảy ra, hệ thống **không đánh rớt ngay** mà chuyển sang `PENDING_VERIFY`, gia hạn giữ ghế thêm 15 phút để bảo vệ khách.
  2. Công cụ Đối soát tự động (Reconciliation Engine) chạy định kỳ so khớp 2 chiều giữa Cổng và Website.
  3. **Nếu ghế vẫn còn trống**: Hệ thống tự động xác nhận `PAID`, chốt bán ghế và cấp vé bù cho khách.
  4. **Nếu ghế đã bị người khác mua**: Hệ thống tự động tạo lệnh Hoàn tiền (`REFUND_PENDING` ➔ `REFUNDED`), trả lại tiền về ví cho khách, chênh lệch kế toán về 0.

#### Thao tác Demo:
1. **Bước 1**: Mở trang Quản trị Đối soát (`/admin/reconcile`), chuyển công tắc sang: **🛡️ TO-BE**.
2. **Bước 2**: Đặt vé ghế **D3, D4** qua **ZaloPay** ➔ Bấm kịch bản: **(2) MẤT CALLBACK**.
3. **Bước 3**: Khách hàng kiểm tra trang `/result`:
   - Sau 15s timeout, trạng thái chuyển thành: **`PENDING_VERIFY` (Đang xác minh & Bảo lưu ghế)**. Ghế không bị nhả!
4. **Bước 4**: Tiến trình nền To-be (chạy mỗi 10s) hoặc Kế toán bấm **"⚡ Chạy đối soát ngay"**:
   - Hệ thống quét giao dịch ZaloPay đã `SUCCESS` ➔ Phát hiện đơn đang chờ.
   - Ghế D3, D4 vẫn đang an toàn ➔ Hệ thống **tự động cấp vé `PAID` ngay lập tức**!
   - Khách nhận thông báo chuông: *"Khắc phục đơn treo thành công! Vé TK... đã sẵn sàng"*.
5. **Bước 5 (Trường hợp ghế đã bị người khác mua)**:
   - Với đơn Kịch bản 2 cũ (ghế C1, C2 đã bị hủy và ai đó đã mua): Khi chạy Đối soát, hệ thống phát hiện ghế không còn trống ➔ Tự động kích hoạt **Hoàn tiền thông minh**:
     - Đơn chuyển sang `REFUND_PENDING` ➔ Tiền hoàn về ví (`REFUNDED`).
     - Trang Hoàn tiền (`/admin/refunds`) hiển thị lệnh hoàn tiền minh bạch, chống hoàn trùng lặp.
     - Khách hàng nhận thông báo *"Đã hoàn trả 150.000đ về ví thành công"*.

---

## 4. Sơ Đồ Luồng Nghiệp Vụ (Dạng Văn Bản Cho Slide Thuyết Trình)

### Sơ đồ 1: Luồng Nghiệp Vụ Hiện Tại (As-is) - Nguyên nhân sinh giao dịch treo
```text
+--------------+                +---------------+                 +--------------------+
|  Khách Hàng  |                | Website Beta  |                 | Cổng TT (VNPay...) |
+-------+------+                +-------+-------+                 +---------+----------+
        |                               |                                   |
        | 1. Chọn ghế & Bấm thanh toán  |                                   |
        +------------------------------>|                                   |
        |                               | 2. Giữ ghế (HOLDING)              |
        |                               |    Tạo giao dịch AWAITING_PAYMENT |
        |                               +---------------------------------->|
        | 3. Quét QR thanh toán         |                                   |
        +------------------------------------------------------------------>|
        |                               |                                   | 4. Trừ tiền tài khoản
        |                               |                                   |    Ghi nhận SUCCESS
        |                               |    X (Rớt mạng / Timeout 15s)     |
        |                               |< - - - - - - - - - - - - - - - - -+ (MẤT IPN / LỖI MẠNG)
        |                               |
        |                               | 5. Hết 15s timeout:
        |                               |    - Đơn chuyển FAILED
        |                               |    - Nhả ghế ra cho người khác!
        |<------------------------------+
        | 6. Nhận thông báo "Thất bại"  |
        |    (Nhưng ví đã bị trừ tiền!) |
        |    ==> GIAO DỊCH TREO (AS-IS) |
```

---

### Sơ đồ 2: Luồng Nghiệp Vụ Đề Xuất (To-be) - Bảo vệ ghế & Đối soát tự động
```text
+--------------+                +---------------+                 +--------------------+
|  Khách Hàng  |                | Website Beta  |                 | Cổng TT (VNPay...) |
+-------+------+                +-------+-------+                 +---------+----------+
        |                               |                                   |
        | 1. Timeout 15s rớt IPN        |                                   |
        |                               | 2. Chuyển PENDING_VERIFY          |
        |                               |    Gia hạn giữ ghế thêm 15 phút!  |
        |<------------------------------+                                   |
        | Thông báo "Đang đối soát"     |                                   |
        |                               |                                   |
        |                               |=== [TIẾN TRÌNH ĐỐI SOÁT TỰ ĐỘNG] ===|
        |                               | 3. Quét so khớp 2 chiều GD Cổng   |
        |                               +---------------------------------->|
        |                               |<----------------------------------+
        |                               |    Phát hiện Cổng đã SUCCESS!     |
        |                               |                                   |
        |                 +-------------+-------------+                     |
        |                 |                           |                     |
        |       [Ghế vẫn còn trống]          [Ghế đã bị người khác mua]     |
        |                 |                           |                     |
        |         4a. Chuyển PAID             4b. Tạo lệnh hoàn tiền        |
        |             Khóa ghế SOLD               Chuyển REFUND_PENDING     |
        |             Cấp vé điện tử              Hoàn tiền về ví khách     |
        |                 |                           |                     |
        |<----------------+                           |                     |
        | Nhận vé xem phim thành công!                |                     |
        |<--------------------------------------------+                     |
        | Nhận lại đủ 100% tiền hoàn về ví!                                 |
```

---

## 5. Bảng So Sánh Giả Lập vs Cổng Thanh Toán Thật (VNPay Sandbox)

| Hạng mục nghiệp vụ | Cổng Giả Lập trong Demo này | Cổng Thanh Toán VNPay Thật |
| :--- | :--- | :--- |
| **Giao thức kết nối** | Trực tiếp trong Node.js qua Event & HTTP local | HTTP POST REST API + Chữ ký số |
| **Bảo mật chữ ký (Checksum)** | Ký và xác thực **HMAC-SHA256** qua Secret Key nội bộ | Ký và xác thực **HMAC-SHA512** qua `vnp_HashSecret` |
| **Tính toàn vẹn số tiền** | Server tự tính từ đơn, từ chối client can thiệp | Kiểm tra `vnp_Amount` khớp số tiền đơn hàng gốc |
| **Cơ chế Webhook IPN** | Giả lập phát IPN kèm 5 kịch bản (mất mạng, trễ 20s, sai tiền) | Máy chủ VNPay gọi tự động `GET/POST` qua Internet |
| **Xử lý trùng lặp (Idempotency)** | Chặn theo `Idempotency-Key` & `txnRef` | Chặn cập nhật nếu đơn đã ở trạng thái cuối |
| **Môi trường chạy** | Chạy Offline 100% trên `localhost:3000` không cần ngrok | Cần Domain công khai hoặc ngrok để nhận Webhook |

---

## 6. Kết luận & Điểm sáng của Đề án
1. **Minh họa trực quan**: Giúp hội đồng và giảng viên quan sát ngay lập tức sự khác biệt sống còn giữa cơ chế thụ động **As-is** (khách mất tiền oan) và cơ chế tự động bảo vệ **To-be** (giữ ghế và đối soát bù).
2. **Chuẩn mực nghiệp vụ**: Áp dụng chặt chẽ máy trạng thái hữu hạn (**Finite State Machine**), kiểm tra tính bất biến của dữ liệu tài chính (luôn lưu `INTEGER VND`, không dùng số thực).
3. **Phân quyền Zero-trust**: Tách bạch tuyệt đối cổng khách hàng và cổng quản trị với Cookie riêng biệt và kiểm tra quyền tại tầng Controller Backend (`requireRole`).
