# Thư mục Scripts & Công cụ hỗ trợ

Thư mục này chứa các script Python tự động hóa, patch và kiểm tra dữ liệu cho dự án Beta Cinemas, được phân loại thành các nhóm liên quan:

### 1. `fixes/` (11 script)
Các script sửa lỗi markup, thẻ iframe, referrer, đường dẫn ảnh và giao diện:
- `fix_all_html_referrer.py`: Chuẩn hóa referrer policy cho các file HTML.
- `fix_banner_images.py`, `fix_banner_images2.py`: Cập nhật và sửa đường dẫn banner.
- `fix_iframe.py`: Sửa nhúng iframe trailer/video.
- `fix_images.py`: Chuẩn hóa đường dẫn hình ảnh trên các trang.
- `fix_layout.py`: Vá các lỗi layout và cấu trúc header/footer.
- `insert_giave.py`, `insert_giave_fix.py`, `remove_giave.py`: Thêm/xóa/điều chỉnh phần giá vé.
- `remove_global_referrer.py`: Gỡ bỏ thẻ referrer toàn cục.
- `update_warning_fix.py`: Sửa hiển thị cảnh báo độ tuổi.

### 2. `tools/` (8 script)
Các công cụ tra cứu, kiểm tra kích thước ảnh, test URL và mã hóa font/encoding:
- `check_img.py`: Kiểm tra kích thước và tỉ lệ ảnh banner.
- `find_banner.py`, `find_banner_html.py`: Quét tìm vị trí và thẻ banner trong HTML.
- `find_comments.py`: Tìm kiếm các đoạn comment trong mã nguồn HTML.
- `find_giave.py`: Quét tìm vị trí bảng giá vé.
- `test_decode.py`: Kiểm tra giải mã UTF-8 / cp1252 khi xử lý tiếng Việt.
- `test_url.py`, `test_url2.py`: Kiểm tra tính hợp lệ của các URL tài nguyên bên ngoài.

### 3. `updates/` (34 script)
Các script cập nhật nội dung trang, responsive CSS, lịch chiếu, khuyến mãi và dữ liệu phim:
- `build_spa.py`: Ghép nối các phần giao diện SPA.
- `inject_showtimes.py`: Bổ sung lịch chiếu vào file dữ liệu.
- `update_data.py`, `update_data_image.py`: Cập nhật mock data phim và hình ảnh.
- `update_gia_ve_*.py`: Cập nhật định dạng, kích thước và URL bảng giá vé.
- `update_grid_*.py`, `update_hero_css.py`, `update_title_css.py`, `update_style_fluid.py`: Tối ưu hóa CSS responsive cho lưới phim và hero banner.
- `update_layout*.py`: Đồng bộ layout navigation, footer và fluid grid trên toàn bộ trang.
- `update_movie*.py`: Cập nhật cấu trúc hiển thị trang phim chi tiết.
- `update_promo*.py`: Cập nhật các trang chi tiết khuyến mãi (HSSV, combo...).
- `update_schedule_html.py`, `update_sch_*.py`: Cập nhật trang lịch chiếu và dữ liệu suất chiếu.
- `update_trailer_*.py`: Cập nhật logic xem trailer và popup video.
- `update_warning.py`: Cập nhật cảnh báo phân loại độ tuổi khán giả.
