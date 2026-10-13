const DemoData = {
    // ---- 15 PHIM ----
    movies: [
        { id: 'm1', title: 'Trại Buôn Người', genres: ['Hành động', 'Tâm lý'], duration: 135, ageRating: 'T18', status: 'nowShowing', synopsis: 'Một nhóm người đấu tranh sinh tồn.', hot: true, sortOrder: 1, releaseDate: null, sneakShow: null, trailer: { type: 'youtube', youtubeId: 'TUzx32ejTlY', duration: '2:15' }, imageUrl: 'https://files.betacorp.vn/media/images/2026/09/15/official-poster-trai-buon-nguoi-final-142318-150926-62.jpg' },
        { id: 'm2', title: 'Avengers: Hồi Kết - Phiên Bản Đặc Biệt A', genres: ['Khoa học', 'Viễn tưởng'], duration: 183, ageRating: 'T13', status: 'nowShowing', synopsis: 'Trận chiến cuối cùng.', hot: true, sortOrder: 2, releaseDate: null, sneakShow: null, trailer: { type: 'youtube', youtubeId: '_XvulZckXLQ', duration: '2:30' }, imageUrl: 'https://files.betacorp.vn/media/images/2026/09/03/encor-002a-g-vie-vn-4x5-134909-030926-27.jpg' },
        { id: 'm3', title: 'Quyết Cua Anh Này', genres: ['Hài hước', 'Tình cảm'], duration: 115, ageRating: 'T13', status: 'nowShowing', synopsis: 'Hành trình cưa đổ crush.', hot: false, sortOrder: 3, releaseDate: null, sneakShow: null, trailer: { type: 'youtube', youtubeId: 'C0qvz_M7opI', duration: '1:45' }, imageUrl: 'https://files.betacorp.vn/media%2fimages%2f2026%2f09%2f29%2f400x633%2D095119%2D290926%2D27.jpg' },
        { id: 'm4', title: 'Thần Sư Chung Quỳ: Linh Giới Đại Chiến', genres: ['Hoạt hình', 'Thần thoại'], duration: 96, ageRating: 'T13', status: 'nowShowing', synopsis: 'Hành trình trừ yêu diệt ma.', hot: false, sortOrder: 4, releaseDate: null, sneakShow: null, trailer: { type: 'youtube', youtubeId: 'mJ2pu6FazEA', duration: '1:30' }, imageUrl: 'https://files.betacorp.vn/media%2fimages%2f2026%2f09%2f23%2f400x633%2D145627%2D230926%2D40.jpg' },
        { id: 'm5', title: 'Lên Hương', genres: ['Tâm lý', 'Gia đình'], duration: 121, ageRating: 'T16', status: 'nowShowing', synopsis: 'Câu chuyện gia đình phức tạp.', hot: false, sortOrder: 5, releaseDate: null, sneakShow: null, trailer: { type: 'youtube', youtubeId: '', duration: '1:50' }, imageUrl: 'https://files.betacorp.vn/media%2fimages%2f2026%2f08%2f31%2flh%2Dposter%2Dpay%2Doff%2D01%2Dgreen%2Dw70xh100%2D102352%2D310826%2D82.jpg' },
        { id: 'm6', title: 'Út Lan 2', genres: ['Kinh dị'], duration: 107, ageRating: 'T18', status: 'nowShowing', synopsis: 'Sự trở lại của Út Lan.', hot: false, sortOrder: 6, releaseDate: null, sneakShow: null, trailer: { type: 'youtube', youtubeId: '', duration: '2:10' }, imageUrl: 'https://files.betacorp.vn/media%2fimages%2f2026%2f09%2f14%2ful2%2Dmain%2Ddam%2Dhoi%2Ddigital%2D094550%2D140926%2D42.jpg' },
        { id: 'm7', title: 'Khoá Chặt Cửa Nào Suzume', genres: ['Hoạt hình', 'Phiêu lưu'], duration: 122, ageRating: 'P', status: 'nowShowing', synopsis: 'Cuộc phiêu lưu đóng cửa.', hot: false, sortOrder: 7, releaseDate: null, sneakShow: null, trailer: { type: 'youtube', youtubeId: '', duration: '2:00' }, imageUrl: 'https://files.betacorp.vn/media%2fimages%2f2026%2f09%2f28%2fposter%2Dkhoa%2Dchat%2Dcua%2Dnao%2Dsuzum%2D1%2D092028%2D280926%2D82.jpg' },
        { id: 'm8', title: 'Trái Tim Quái Thú', genres: ['Hành động'], duration: 101, ageRating: 'T13', status: 'nowShowing', synopsis: 'Hành động rượt đuổi kịch tính.', hot: false, sortOrder: 8, releaseDate: null, sneakShow: null, trailer: { type: 'youtube', youtubeId: '', duration: '1:40' }, imageUrl: 'https://files.betacorp.vn/media%2fimages%2f2026%2f09%2f23%2f470x700%2D115017%2D230926%2D72.png' },
        { id: 'm9', title: 'Scotty: Giải Cứu Hoàng Thượng', genres: ['Hoạt hình', 'Phiêu lưu'], duration: 80, ageRating: 'P', status: 'nowShowing', synopsis: 'Chú chó nhỏ làm việc lớn.', hot: false, sortOrder: 9, releaseDate: null, sneakShow: null, trailer: { type: 'youtube', youtubeId: '', duration: '1:20' }, imageUrl: 'https://files.betacorp.vn/media%2fimages%2f2026%2f09%2f25%2fscotty%2D160809%2D250926%2D82.jpg' },
        { id: 'm10', title: 'Bát Tiên! Truy Tìm Lưu Ly Đăng', genres: ['Hoạt hình'], duration: 144, ageRating: 'K', status: 'nowShowing', synopsis: 'Truy tìm thần khí.', hot: false, sortOrder: 10, releaseDate: null, sneakShow: null, trailer: { type: 'youtube', youtubeId: '', duration: '2:05' }, imageUrl: 'https://files.betacorp.vn/media%2fimages%2f2026%2f08%2f27%2f400x633%2D150322%2D270826%2D52.jpg' },
        { id: 'm11', title: 'Pháo Hoa Lúc Bình Minh', genres: ['Hoạt hình'], duration: 76, ageRating: 'P', status: 'nowShowing', synopsis: 'Câu chuyện thanh xuân.', hot: false, sortOrder: 11, releaseDate: null, sneakShow: null, trailer: { type: 'youtube', youtubeId: '', duration: '1:15' }, imageUrl: 'https://files.betacorp.vn/media%2fimages%2f2026%2f08%2f27%2f040926%2Dphao%2Dhoa%2Dluc%2Dbinh%2Dminh%2D163706%2D270826%2D57.png' },
        { id: 'm12', title: 'Vùng Đất Quỷ Dữ', genres: ['Kinh dị', 'Hành động'], duration: 94, ageRating: 'T18', status: 'nowShowing', synopsis: 'Chiến đấu sinh tồn chống zombie.', hot: false, sortOrder: 12, releaseDate: null, sneakShow: null, trailer: { type: 'youtube', youtubeId: '', duration: '1:55' }, imageUrl: 'https://files.betacorp.vn/media%2fimages%2f2026%2f09%2f15%2f400x633%2D134138%2D150926%2D34.jpg' },
        { id: 'm13', title: 'Mẹ Mìn', genres: ['Kinh dị'], duration: 110, ageRating: 'T18', status: 'special', synopsis: '', hot: false, sortOrder: 13, releaseDate: null, sneakShow: { date: '20/10', time: '18:00', label: 'SNEAK TỪ 18H' }, trailer: { type: 'youtube', youtubeId: '', duration: '1:50' }, imageUrl: 'https://files.betacorp.vn/media%2fimages%2f2026%2f09%2f17%2fme%2Dmin%2Dteaser%2Dposter%2Ddkkc%2D23102026%2D132757%2D170926%2D76.jpg' },
        { id: 'm14', title: 'Chị Chị Em Em 3', genres: ['Tâm lý'], duration: 120, ageRating: 'T18', status: 'special', synopsis: '', hot: false, sortOrder: 14, releaseDate: null, sneakShow: { date: '16/10', time: '18:00', label: 'SNEAK' }, trailer: { type: 'youtube', youtubeId: '', duration: '1:50' }, imageUrl: 'https://files.betacorp.vn/media%2fimages%2f2026%2f10%2f01%2f400x633%2D120534%2D011026%2D90.jpg' },
        { id: 'm15', title: 'Án Mạng Karaoke', genres: ['Trinh thám'], duration: 100, ageRating: 'T18', status: 'comingSoon', synopsis: '', hot: false, sortOrder: 15, releaseDate: null, sneakShow: null, trailer: { type: 'youtube', youtubeId: '', duration: '1:50' }, imageUrl: 'https://files.betacorp.vn/media%2fimages%2f2026%2f09%2f30%2fan%2Dmang%2Dkaraoke%2Dkc%2D30%2D10%2D2026%2Dkt%2Dchuan%2D114723%2D300926%2D76.jpg' }
    ],

    // ---- THIẾT LẬP BANNER ----
    banners: [
        {
            id: 'slide1',
            theme: 'B9DB6C',
            title: 'THÁNG PHIM SIÊU QUÁI',
            items: [
                { movieId: 'm1', caption: 'SNEAK TỪ 18H', dateLabel: '', wide: false },
                { movieId: 'm2', caption: 'ĐANG CHIẾU', dateLabel: '', wide: false },
                { movieId: 'm3', caption: 'SNEAK CẢ NGÀY', dateLabel: '', wide: true },
                { movieId: 'm4', caption: 'ĐANG CHIẾU', dateLabel: '', wide: false },
                { movieId: 'm5', caption: 'SẮP CHIẾU', dateLabel: '', wide: false },
                { movieId: 'm6', caption: 'ĐANG CHIẾU', dateLabel: '', wide: false },
                { movieId: 'm7', caption: 'SNEAK 19H', dateLabel: '', wide: false }
            ]
        }
    ],


    cinemas: [
        { id: 'c1', name: 'Beta Cinemas Thái Nguyên', city: 'Thái Nguyên', address: 'Hoàng Gia Plaza, 259 Quang Trung', hotline: '0981234567' },
        { id: 'c2', name: 'Beta Cinemas Thanh Xuân', city: 'Hà Nội', address: 'Tầng hầm B1, Tòa nhà Golden West, 2 Lê Văn Thiêm', hotline: '0981234568' },
        { id: 'c3', name: 'Beta Cinemas Giải Phóng', city: 'Hà Nội', address: 'Tầng 3, Imperial Plaza, 360 Giải Phóng', hotline: '0981234569' },
        { id: 'c4', name: 'Beta Cinemas Quang Trung', city: 'TP.HCM', address: '628 Quang Trung, Phường 11, Gò Vấp', hotline: '0981234570' },
        { id: 'c5', name: 'Beta Cinemas Trần Quang Khải', city: 'TP.HCM', address: 'Tầng 2, 214 Trần Quang Khải, Tân Định, Quận 1', hotline: '0981234571' }
    ],

    rooms: [
        { id: 'r1', name: 'Phòng 1 (Standard)', layout: { rows: 8, cols: 12, aisles: [4, 9], vipRows: ['D', 'E', 'F'], doubleRows: ['H'] } },
        { id: 'r2', name: 'Phòng 2 (Large)', layout: { rows: 10, cols: 14, aisles: [5, 10], vipRows: ['E', 'F', 'G'], doubleRows: ['J'] } }
    ],

    // =========================================================================
    // DANH SÁCH COMBO VÀ ĐƯỜNG DẪN ẢNH (THAY THẾ ẢNH COMBO TẠI ĐÂY):
    // Bạn có thể đổi giá trị `img:` thành file ảnh của bạn (vd: 'images/my-combo.png')
    // hoặc dán trực tiếp link ảnh online (https://...).
    // Hoặc ghi đè trực tiếp các file ảnh trong thư mục: images/combos/
    // =========================================================================
    combos: [
        { id: 'cb1', name: 'Combo See Mê - Tai thỏ', desc: 'TIẾT KIỆM 56K!!! Sở hữu ngay: 1 Ly Tai Thỏ kèm nước + 1 Bắp (69oz)', price: 109000, img: 'images/combos/tai-tho.svg' },
        { id: 'cb2', name: 'Family Combo 69oz', desc: 'TIẾT KIỆM 95K!!! Gồm: 2 Bắp (69oz) + 4 Nước có gas (22oz) + 2 Snack Oishi (80g)', price: 159000, img: 'images/combos/family.svg' },
        { id: 'cb3', name: 'Combo See Mê - Ice Cream', desc: 'TIẾT KIỆM 56K!!! Sở hữu ngay: 1 Ly Ice Cream kèm nước + 1 Bắp (69oz)', price: 109000, img: 'images/combos/ice-cream.svg' },
        { id: 'cb4', name: 'Combo See Mê - Vảy cá', desc: 'TIẾT KIỆM 56K!!! Sở hữu ngay: 1 Ly Vảy cá kèm nước + 1 bắp (69oz)', price: 109000, img: 'images/combos/vay-ca.svg' },
        { id: 'cb5', name: 'Beta Combo 69oz', desc: 'TIẾT KIỆM 28K!!! Gồm: 1 Bắp (69oz) + 1 Nước có gas (22oz)', price: 69000, img: 'images/combos/beta-combo.svg' },
        { id: 'cb6', name: 'Combo See Mê - Mùi Phở', desc: 'SIÊU HOTTT!!! Combo phiên bản giới hạn: 1 Ly "Mùi Phở" hấp dẫn kèm nước có gas + 1 Bắp (69oz)', price: 109000, img: 'images/combos/mui-pho.svg' },
        { id: 'cb7', name: 'Combo See Mê - Kem hoa anh đào', desc: 'TIẾT KIỆM 56K!!! Sở hữu ngay: 1 Ly kem hoa anh đào kèm nước + 1 Bắp (69oz)', price: 109000, img: 'images/combos/kem-hoa-anh-dao.svg' }
    ],

    accounts: [
        { id: 'u1', email: 'khachhang@gmail.com', name: 'Khách Hàng', password: '123', role: 'USER' },
        { id: 'u2', email: 'admin@betacinemas.vn', name: 'Quản Trị Viên', password: 'admin', role: 'ADMIN' }
    ],

    paymentMethods: [
        { id: 'EWALLET_A', name: 'Ví điện tử A (Momo giả lập)', type: 'ewallet', active: true },
        { id: 'EWALLET_B', name: 'Ví điện tử B (ZaloPay giả lập)', type: 'ewallet', active: true },
        { id: 'ATM', name: 'Thẻ ATM nội địa (Napas)', type: 'atm', active: true },
        { id: 'CC', name: 'Thẻ quốc tế (Visa/Mastercard)', type: 'credit', active: true },
        { id: 'POINTS', name: 'Điểm tích lũy (Ngoài phạm vi demo)', type: 'points', active: false }
    ],

    // ---- HÀM TIỆN ÍCH ----

    _initDates: function () {
        if (this._datesInitialized) return;
        const baseDate = typeof VirtualClock !== 'undefined' ? VirtualClock.now() : new Date();

        // nowShowing (ra mắt cách đây 1-14 ngày)
        this.movies.filter(m => m.status === 'nowShowing').forEach((m, idx) => {
            const d = new Date(baseDate);
            d.setDate(d.getDate() - (idx + 2));
            m.releaseDate = d.toISOString().split('T')[0];
        });

        // comingSoon (ra mắt trong 3-10 ngày tới)
        this.movies.filter(m => m.status === 'comingSoon').forEach((m, idx) => {
            const d = new Date(baseDate);
            d.setDate(d.getDate() + (idx * 3) + 3);
            m.releaseDate = d.toISOString().split('T')[0];
        });

        // special/sneak (ra mắt hôm nay hoặc ngày mai)
        this.movies.filter(m => m.status === 'special').forEach((m, idx) => {
            const d = new Date(baseDate);
            d.setDate(d.getDate() + idx);
            m.releaseDate = d.toISOString().split('T')[0];
            if (m.sneakShow) {
                m.sneakShow.date = `${d.getDate().toString().padStart(2, '0')}/${(d.getMonth() + 1).toString().padStart(2, '0')}`;
            }
        });

        // Update banner dates based on releaseDates
        this.banners[0].items.forEach(item => {
            const m = this.movies.find(x => x.id === item.movieId);
            if (m) {
                const rd = new Date(m.releaseDate);
                const ddmm = `${rd.getDate().toString().padStart(2, '0')}/${(rd.getMonth() + 1).toString().padStart(2, '0')}`;
                if (!item.dateLabel && !item.caption.includes('SNEAK')) {
                    item.dateLabel = ddmm;
                }
            }
        });

        this._datesInitialized = true;
    },

    getMoviesByTab: function (tab) {
        this._initDates();
        let list = this.movies;
        if (tab === 'nowShowing') list = this.movies.filter(m => m.status === 'nowShowing');
        if (tab === 'comingSoon') list = this.movies.filter(m => m.status === 'comingSoon');
        if (tab === 'special') list = this.movies.filter(m => m.status === 'special');
        return this.sortMovies(list, tab);
    },

    getHeroItems: function (slideIndex) {
        this._initDates();
        return this.banners[slideIndex] || this.banners[0];
    },

    sortMovies: function (list, tab) {
        // Mặc định sort theo sortOrder
        return list.sort((a, b) => a.sortOrder - b.sortOrder);
    },

    generateShowtimes: function () {
        this._initDates();
        const showtimes = [];
        const baseDate = typeof VirtualClock !== 'undefined' ? VirtualClock.now() : new Date();
        baseDate.setHours(0, 0, 0, 0);

        let stId = 1;
        for (let day = 0; day < 7; day++) {
            const currentDate = new Date(baseDate);
            currentDate.setDate(currentDate.getDate() + day);

            DemoData.cinemas.forEach(cinema => {
                // Lấy phim nowShowing và special (nếu đến ngày)
                DemoData.movies.filter(m => m.status === 'nowShowing' || m.status === 'special').forEach(movie => {
                    if (movie.status === 'special') {
                        const mDate = new Date(movie.releaseDate);
                        if (currentDate.getTime() < mDate.getTime()) return; // Chưa đến ngày sneak
                    }

                    const numShows = Math.floor(Math.random() * 2) + 2;
                    for (let s = 0; s < numShows; s++) {
                        const showTime = new Date(currentDate);
                        const hour = 9 + Math.floor(Math.random() * 14);
                        const minute = Math.random() > 0.5 ? 0 : 30;
                        showTime.setHours(hour, minute, 0, 0);

                        const room = DemoData.rooms[Math.floor(Math.random() * DemoData.rooms.length)];
                        const format = Math.random() > 0.8 ? '3D' : '2D';

                        const pseudoSeed = (day * 100 + hour * 10 + s);
                        const bookedSeats = DemoData.generateBookedSeats(room.layout, pseudoSeed);

                        showtimes.push({
                            id: `ST${stId++}`, cinemaId: cinema.id, movieId: movie.id, roomId: room.id,
                            startTime: showTime.toISOString(), format: format,
                            prices: { 'REGULAR': 60000, 'VIP': 70000, 'DOUBLE': 140000 },
                            bookedSeats: bookedSeats
                        });
                    }
                });
            });
        }
        return showtimes;
    },

    generateBookedSeats: function (layout, seed) {
        const rows = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J', 'K'];
        const booked = [];
        const numBooked = (seed % 10) + 5;
        for (let i = 0; i < numBooked; i++) {
            const r = rows[(seed + i) % layout.rows];
            const c = ((seed * i) % layout.cols) + 1;
            const seatId = `${r}${c}`;
            if (!booked.includes(seatId)) booked.push(seatId);
        }
        return booked;
    }
};
