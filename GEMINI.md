# Quy tắc Phát triển Backend - Dự án Beta Cinemas

## 1. Thông tin Dự án & Công nghệ
- **Dự án**: Website đặt vé xem phim Beta Cinemas.
- **Vị trí Backend**: Thư mục `api/`.
- **Môi trường & Công nghệ cốt lõi**:
  - Node.js 22 LTS, CommonJS (`require`, không dùng ESM).
  - Express 4.
  - SQLite qua `better-sqlite3` + `Knex`.
  - Kiểm tra dữ liệu: `zod`.
  - Testing: `jest` + `supertest` (chạy qua `npm test`).
- **Cổng thanh toán**: **VNPay (sandbox)**.

---

## 2. Thành phần ĐÃ CÓ SẴN (BẢO LƯU - TUYỆT ĐỐI KHÔNG VIẾT LẠI)
- **State Machine**: `src/services/orderStateMachine.js` (`assertTransition`, `ORDER_STATUS`, `TRANSITIONS`, `canTransition`, `isTerminal`).
- **Thư viện tiện ích (`src/lib/`)**:
  - `ids.js`: Sinh mã hiển thị chuẩn (`BC...`, `RF...`, `CS...`, `GW...`).
  - `errors.js`: `ERROR_CODES` và lớp lỗi `AppError`.
  - `money.js`: Định dạng và tính toán tiền tệ.
  - `clock.js`: Quản lý thời gian ảo phục vụ đối soát.
  - `http.js`: Wrapper fetch/HTTP client.
  - `hmac.js`: Sinh và xác thực chữ ký HMAC.
  - `time.js`, `logger.js`.
- **Middleware (`src/middleware/`)**:
  - `validate.js`: Validate schema Zod cho body/params/query.
  - `errorHandler.js`: Xử lý lỗi tập trung, trả response chuẩn `{ ok: false, error: { code, message, details, requestId } }`.
  - `requestId.js`: Gán `X-Request-Id`.
  - `notFound.js`: Xử lý 404.
- **Hệ thống Migration (001 - 005)**:
  - `001_catalog.js`: `users`, `cinemas`, `rooms`, `seats`, `movies`, `showtimes`, `combos`, `system_settings`.
  - `002_booking.js`: `orders`, `order_seats`, `order_combos`, `showtime_seats`, `order_status_history`.
  - `003_payment.js`: `payment_attempts`, `webhook_events`.
  - `004_recon_refund.js`: `refunds`, `recon_runs`, `recon_items`.
  - `005_ops.js`: `support_tickets`, `support_ticket_notes`, `notifications`.
- **Đặc tả nghiệp vụ**: `docs/SPEC.md` (Quy tắc từ `BR-01` đến `BR-12`).

---

## 3. Các Quy tắc Bắt buộc (Core Constraints)
1. **Tiền tệ**: Luôn là số nguyên VND (`INTEGER VND`, ràng buộc `CHECK >= 0`), tuyệt đối không dùng số thực / float.
2. **Thời gian**: Lưu chuỗi ISO-8601 UTC (`TEXT ISO-8601 UTC`), tên cột kết thúc bằng `_at`.
3. **Chuyển trạng thái đơn hàng**:
   - Mọi sự thay đổi trạng thái của đơn hàng (`orders.status`) BẮT BUỘC phải kiểm tra hợp lệ bằng hàm `assertTransition(fromStatus, toStatus)` từ `orderStateMachine.js`.
   - BẮT BUỘC phải ghi nhận lịch sử vào bảng `order_status_history` ngay trong cùng giao dịch.
4. **Giao dịch CSDL (Transaction)**:
   - Mọi thao tác thay đổi dữ liệu liên quan nhiều bảng hoặc cập nhật trạng thái đơn hàng PHẢI nằm trong `knex.transaction(async (trx) => { ... })`.
5. **Xử lý lỗi**:
   - Sử dụng `AppError` từ `src/lib/errors.js` kèm mã lỗi chuẩn từ `ERROR_CODES`.
   - Thông điệp lỗi bằng tiếng Việt thân thiện, rõ ràng, an toàn khi hiển thị cho khách hàng.
6. **Bảo mật**:
   - Tuyệt đối không commit bí mật, API key, Secret key, Token vào mã nguồn / git.
   - Đọc qua biến môi trường (`.env`), kiểm tra nghiêm ngặt bằng Zod tại `src/config/env.js`.

---

## 4. Quy trình Thực hiện Từng bước (Workflow mỗi bước)
Khi triển khai tính năng mới hoặc chỉnh sửa code, BẮT BUỘC thực hiện theo 5 bước:
1. **Đọc code liên quan trước**: Khảo sát kỹ các file, hàm, bảng dữ liệu và logic hiện hữu trước khi chạm vào mã nguồn.
2. **Nêu kế hoạch ngắn**: Trình bày tóm tắt phương án triển khai dự kiến trước khi bắt đầu code.
3. **Viết code + Test Jest**: Viết code tinh gọn, chuẩn mực, kèm theo bộ kiểm thử bằng Jest & Supertest.
4. **Chạy kiểm thử (`npm test`)**: Chạy lệnh test đảm bảo 100% test suites pass trước khi kết thúc bước.
5. **Tóm tắt file đã thay đổi**: Báo cáo rõ ràng danh sách các file đã tạo mới hoặc chỉnh sửa.
