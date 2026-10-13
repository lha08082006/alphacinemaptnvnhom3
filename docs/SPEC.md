# SPEC - Demo Beta Cinemas (giao dịch treo)

## A. Kiến trúc mô phỏng (khớp 4 làn sơ đồ AS-IS)
- **Khách hàng**: Các trang giao diện (`index.html`, `schedule.html`, `seats.html`, `combo.html`, `checkout.html`, `result.html`, `my-orders.html`, v.v.).
- **Website Beta**: `js/beta-core.js` + bảng `beta_orders`.
- **Cổng thanh toán (bên thứ ba)**: `gateway.html` + `js/gateway-core.js` + bảng `gateway_txns`; API giả `getTxnStatus(txnId)`, `refund(txnId, amount)`.
- **Vận hành**: `admin/*` (IT, Kế toán, CSKH, Quản lý) + `js/reconcile.js`.
- **Callback (webhook)**: Là kênh RIÊNG với việc trình duyệt khách quay về Beta: cổng gọi `betaCore.receiveCallback(payload)` sau khi xử lý; trình duyệt khách quay về `result.html` và chờ trạng thái đơn.

## B. Bảng dữ liệu (localStorage, thao tác qua js/db.js)
- `beta_orders`: `{ orderId, userEmail, movieId, cinemaId, showtimeId, seats[], combos[], amount, status, createdAt, holdExpiresAt, txnId, paidAt, callbackAt }`
- `gateway_txns`: `{ txnId, orderId, method, amount, status (PENDING|SUCCESS|FAILED|CANCELLED), debited (bool), callback: { mode ("OK"|"LOST"|"DELAYED"), sentAt, deliveredAt }, refund: { ref, status }, createdAt }`
- `refunds`: `{ refundId, orderId, txnId, amount, type ("AUTO"|"MANUAL"), status (CHECKING|SENT|BANK_PROCESSING|COMPLETED|REJECTED), detectedAt, sentAt, completeEta, checks: { a, b, c, d, e }, slaBreached }`
- `notifications`: `{ id, orderId, channel ("web"|"email"|"sms"), title, body, createdAt, read }`
- `support_tickets`: `{ ticketId, orderId, contact, source ("CUSTOMER"|"SYSTEM"), status, createdAt, notes[] }`
- `recon_runs`: `{ runId, runAt, scanned, mismatches, autoRefunds, flagged }`
- `settings`: `{ mode ("ASIS"|"TOBE", mặc định ASIS), reconcileIntervalMin (5|15, mặc định 15), callbackTimeoutSec (15), holdMinutes (5), pendingVerifyHoldMin (15), refundSendDelayMin (30) }`
- `sessionStorage`: `currentUser`, `currentOrderId`

## C. Trạng thái đơn (beta_orders.status)
```
HOLDING -> AWAITING_PAYMENT -> PAID
                            -> FAILED | CANCELLED
                            -> PENDING_VERIFY (chỉ TO-BE) -> PAID | REFUND_PENDING -> REFUNDED
HOLDING -> EXPIRED (hết giờ giữ ghế)
```

## D. Quy tắc nghiệp vụ
- **BR-01**: Tối đa 8 ghế mỗi đơn.
- **BR-02**: Giữ ghế đếm ngược `holdMinutes` từ lúc bấm "Tiếp tục" ở bước chọn ghế; hết giờ mà đơn còn `HOLDING` -> `EXPIRED`, tự động nhả ghế.
- **BR-03**: Chỉ callback `SUCCESS` hợp lệ (khớp `txnId`, `orderId`, số tiền) mới chuyển `PAID` và phát hành vé; callback trùng lặp chỉ xử lý đúng 1 lần (Idempotency).
- **BR-04 (AS-IS)**: Quá `callbackTimeoutSec` không có callback -> nhả ghế, chuyển `FAILED`, hiển thị "Thanh toán thất bại". Việc phát hiện bị trừ tiền hoàn toàn phụ thuộc vào việc khách tự đối chiếu biến động số dư và liên hệ CSKH.
- **BR-05 (TO-BE)**: Quá timeout -> chuyển `PENDING_VERIFY`, giao diện hiển thị "Đang xác thực giao dịch", giữ ghế thêm `pendingVerifyHoldMin`; tuyệt đối không hiển thị "thất bại" gây hoang mang cho khách.
- **BR-06 (TO-BE)**: Cứ mỗi `reconcileIntervalMin` (giờ ảo): hệ thống tự động quét các đơn `PENDING_VERIFY` và các đơn `FAILED`/`EXPIRED` có `txnId`, gọi API giả của cổng đối chiếu trạng thái với Beta.
- **BR-07**: Chỉ tự động hoàn tiền khi thỏa mãn đủ 5 điều kiện (5 Golden Rules):
  - (a) Cổng thanh toán xác nhận giao dịch `SUCCESS` và `debited = true`.
  - (b) Beta chưa có vé `PAID` hợp lệ cho `orderId` / `txnId`.
  - (c) Số tiền yêu cầu hoàn khớp chính xác với số tiền cổng đã trừ.
  - (d) Chưa từng có lệnh hoàn tiền nào (`refund`) được lập cho `txnId` này.
  - (e) Đơn hàng chưa bị can thiệp xử lý thủ công bởi CSKH.
  *(Nếu thiếu bất kỳ điều kiện nào -> gắn cờ "Cần CSKH xem xét", không tự hoàn).*
- **BR-08**: Lệnh hoàn tiền phải được phát đi tối đa trong 24 giờ kể từ `detectedAt`; quá hạn hệ thống sẽ kích hoạt cảnh báo SLA. Tiền về tài khoản khách sau 3-7 ngày làm việc; giao diện phân tách rõ 2 mốc thời gian: "Đã gửi lệnh hoàn" và "Tiền đã về".
- **BR-09**: Thông báo đa kênh trạng thái: "Đang xử lý" / "Thành công" / "Thất bại - Đã tạo lệnh hoàn tiền". Kênh thông báo theo thứ tự: Web -> Email -> SMS (mô phỏng ghi bản ghi vào bảng `notifications`).
- **BR-10**: Callback `SUCCESS` đến muộn khi đơn đang ở trạng thái `PENDING_VERIFY` -> chuyển ngay sang `PAID` và xuất vé; tiến trình đối soát tự động bỏ qua đơn đã `PAID`.
- **BR-11**: Chống nhấp thanh toán nhiều lần (Idempotent UI & disable submit button).
- **BR-12 (AS-IS)**: Quy trình CSKH thủ công: Tiếp nhận khiếu nại -> Tra soát thủ công qua cổng/sao kê (1-3 ngày làm việc) -> Xác nhận giao dịch treo -> Tạo lệnh hoàn tiền thủ công.