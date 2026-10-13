-- docs/QUERIES.sql
-- Các câu lệnh truy vấn mẫu và kế hoạch thực thi (EXPLAIN QUERY PLAN)

-- 1. Danh sách ghế của suất chiếu (id=1) kèm trạng thái hiện tại (nối bảng seats và showtime_seats)
EXPLAIN QUERY PLAN
SELECT 
    s.id AS seat_id,
    s.row_label,
    s.col_number,
    s.seat_type,
    COALESCE(ss.state, 'AVAILABLE') AS status
FROM seats s
LEFT JOIN showtime_seats ss 
    ON s.id = ss.seat_id AND ss.showtime_id = 1
WHERE s.room_id = (SELECT room_id FROM showtimes WHERE id = 1)
ORDER BY s.row_label, s.col_number;

-- 2. Tìm các đơn đang bị treo (đã quá hạn hold_expires_at nhưng trạng thái vẫn là AWAITING_PAYMENT) để đối soát
EXPLAIN QUERY PLAN
SELECT order_id, amount_total, current_attempt_id, hold_expires_at
FROM orders
WHERE status = 'AWAITING_PAYMENT' 
  AND hold_expires_at < datetime('now');

-- 3. Báo cáo doanh thu theo phim trong tháng (chỉ tính đơn PAID)
EXPLAIN QUERY PLAN
SELECT 
    m.title,
    COUNT(DISTINCT o.order_id) AS total_orders,
    SUM(o.amount_tickets) AS ticket_revenue
FROM orders o
JOIN showtimes st ON o.showtime_id = st.id
JOIN movies m ON st.movie_id = m.id
WHERE o.status = 'PAID'
GROUP BY m.id, m.title
ORDER BY ticket_revenue DESC;

-- 4. Tìm các giao dịch cần hoàn tiền (đối soát lệch: Beta FAILED/CANCELLED nhưng Gateway đã DEBITED)
EXPLAIN QUERY PLAN
SELECT 
    ri.order_id, 
    ri.gateway_txn_id, 
    ri.amount_gateway
FROM recon_items ri
JOIN recon_runs rr ON ri.run_id = rr.run_id
WHERE ri.classification = 'NO_TICKET_DEBITED' 
  AND ri.action = 'AUTO_REFUND'
  AND rr.status = 'DONE';

-- 5. Lịch sử trạng thái của một đơn hàng (dành cho CSKH)
EXPLAIN QUERY PLAN
SELECT 
    at, 
    from_status, 
    to_status, 
    actor_type, 
    reason
FROM order_status_history
WHERE order_id = 'BC123456'
ORDER BY at DESC;
