# Demo thanh toán QR - Beta Cinemas (giao dịch treo, đối soát, hoàn tiền)

Website đặt vé + cổng thanh toán giả lập chạy chung 1 project. Node.js + Express, dữ liệu lưu trong bộ nhớ (tắt server là mất), không cần khóa API hay ngrok.

## Cách chạy
```bash
npm install
npm start
```
Mở http://localhost:3000. Trang quản trị/đối soát: http://localhost:3000/admin (nên mở ở tab riêng cạnh trang đặt vé).

| Trang | Đường dẫn |
|---|---|
| Chọn ghế | `/` |
| Thanh toán QR | `/pay/:orderCode` |
| Cổng thanh toán giả (app ngân hàng) | `/gateway/:orderCode` |
| Vé điện tử | `/ticket/:orderCode` |
| Quản trị / đối soát | `/admin` |

Thời gian giữ ghế chỉnh được ở trang chọn ghế (mặc định 180 giây). Nên đặt **15-20 giây** khi demo giao dịch treo cho nhanh. Nút "Reset dữ liệu demo" ở `/admin`.

## Kịch bản demo

### Demo 1 - Thanh toán thành công
1. Vào `/`, chọn vài ghế, bấm **THANH TOÁN** (đơn PENDING, ghế chuyển vàng "đang giữ", đồng hồ đếm ngược).
2. Ở trang thanh toán, bấm "Mở app ngân hàng giả lập" (tab mới), chọn **Thanh toán thành công**.
3. Cổng ghi giao dịch SUCCESS và gửi webhook có chữ ký. Trang thanh toán tự chuyển sang vé. Ở `/admin`: đơn PAID, ghế SOLD, nhật ký đủ từng bước.

### Demo 2 - Giao dịch treo (As-is, đối soát TẮT)
1. Ở `/admin` đảm bảo công tắc "Đối soát tự động" **TẮT** (nhãn đỏ AS-IS).
2. Đặt thời gian giữ ghế 15 giây, chọn ghế, bấm Thanh toán.
3. Trên cổng giả chọn **Thanh toán nhưng MẤT CALLBACK**.
4. Chờ hết giờ: trang thanh toán báo "hết hạn", đơn EXPIRED, ghế được nhả. Ở `/admin`, bảng cổng vẫn ghi SUCCESS + "đã trừ tiền" và webhook "KHÔNG GỬI". **Khách mất tiền, không có vé, website không biết gì.**

### Demo 3 - Bật đối soát (To-be)
1. Giữ nguyên tình huống của Demo 2 (đơn EXPIRED, cổng đã trừ tiền).
2. Bật công tắc "Đối soát tự động" (hoặc bấm **CHẠY ĐỐI SOÁT NGAY**).
3. Vì ghế còn trống: đơn chuyển PAID, ghế SOLD, **xuất vé** (xem `/ticket/<mã đơn>`).
4. Biến thể hoàn tiền: tạo đơn mới, chọn **MẤT CALLBACK**, chờ hết hạn, rồi dùng một đơn khác mua đúng ghế đó (thanh toán thành công). Chạy đối soát: ghế đã bị người khác mua nên hệ thống tạo lệnh **hoàn tiền**: đơn REFUNDED, giao dịch cổng REFUNDED, có log.

### Các kịch bản phụ
- **Callback đến muộn (20 giây)**: nếu đơn còn hạn thì PAID bình thường; nếu đã hết hạn thì đơn NEEDS_REVIEW (đối soát sẽ cấp lại vé nếu ghế còn trống).
- **Sai số tiền**: đơn NEEDS_REVIEW, đối soát không tự sửa; ở `/admin` bấm "Hoàn tiền" để nhân viên xử lý.

## Quy tắc xử lý (tóm tắt)
- Webhook `POST /webhooks/payment`: kiểm tra chữ ký HMAC-SHA256 (header `X-Signature`, secret trong `server.js`), chống trùng theo mã giao dịch, so khớp số tiền, kiểm tra hạn đơn.
- Job hết hạn mỗi 5 giây: đơn PENDING quá hạn thành EXPIRED và nhả ghế (hành vi As-is gây lỗi treo).
- Đối soát: với mỗi giao dịch SUCCESS mà đơn chưa PAID: đơn còn PENDING hoặc ghế còn trống thì cấp lại vé; ghế đã bị mua thì hoàn tiền; lệch tiền thì để nhân viên xử lý.
