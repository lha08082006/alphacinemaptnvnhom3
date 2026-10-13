# Từ điển Dữ liệu (Data Dictionary)

## Bảng `orders`
Lưu trữ thông tin đơn hàng, đại diện cho quá trình đặt vé của người dùng (từ lúc giữ ghế đến khi thanh toán thành công).
- **order_id**: Mã đơn hàng (PK). Ví dụ: `BC12345678`. (REQ-02, BR-02)
- **user_id**: Khóa ngoại tham chiếu đến bảng `users`.
- **showtime_id**: Khóa ngoại tham chiếu `showtimes`.
- **status**: Trạng thái đơn (HOLDING, AWAITING_PAYMENT, PAID, FAILED, CANCELLED, EXPIRED...). (BR-04, BR-05)
- **amount_total**: Tổng tiền (bằng amount_tickets + amount_combos). CHECK(amount_total >= 0). (BR-12)
- **hold_expires_at**: Hạn chót giữ ghế (ISO-8601). Quá hạn này đơn bị Hủy và nhả ghế. (BR-04)

## Bảng `order_seats`
Chi tiết các ghế được đặt trong đơn hàng (nhằm tính tiền). Giới hạn tối đa 8 ghế qua Trigger. (BR-01)
- **order_id**: PK, FK
- **seat_id**: PK, FK
- **price**: Giá bán tại thời điểm đặt (để tránh thay đổi giá sau này).

## Bảng `showtime_seats`
Nguồn sự thật duy nhất về trạng thái ghế của suất chiếu (HELD, SOLD). Đảm bảo không xảy ra đặt trùng. (BR-03, BR-04)
- **showtime_id**: PK, FK
- **seat_id**: PK, FK
- **state**: Trạng thái (HELD, SOLD).
- **held_until**: Thời gian hết hạn giữ ghế (phải bằng hold_expires_at của đơn). 

## Bảng `refunds` (Beta)
Quản lý các khoản hoàn tiền (do lỗi hệ thống, hủy vé tự động qua SLA, hoặc đối soát).
- **refund_id**: PK, mã hoàn tiền (RF...). (REQ-05)
- **order_id**: FK, tham chiếu tới orders.
- **gateway_txn_id**: ID giao dịch bên phía cổng thanh toán. (UNIQUE partial index WHERE status != 'REJECTED' để tránh hoàn 2 lần)
- **status**: Trạng thái (CHECKING, SENT, BANK_PROCESSING, COMPLETED, REJECTED). (BR-07)
- **sla_breached**: Cờ báo hiệu quá thời hạn SLA (24h). (SLA-01)

## Bảng `txns` (Gateway)
Giao dịch thanh toán tại cổng thanh toán.
- **txn_id**: PK (GW...)
- **merchant_order_ref**: Tham chiếu đến attempt_id của Beta.
- **debited**: Cờ báo hiệu khách hàng đã bị trừ tiền (thành công hoặc treo). (BR-06)
