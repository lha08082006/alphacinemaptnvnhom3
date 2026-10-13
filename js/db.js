// js/db.js

const DB = {
    // Helper tạo ID tự động theo định dạng mong muốn
    generateId: {
        order: () => 'BC' + Math.random().toString(36).substring(2, 10).toUpperCase(), // BC + 8 chars
        txn: () => 'GW' + Math.random().toString(36).substring(2, 12).toUpperCase(),  // GW + 10 chars
        refund: () => 'RF' + Math.random().toString(36).substring(2, 10).toUpperCase(), // RF + 8 chars
        ticket: () => 'CS' + Math.random().toString(36).substring(2, 8).toUpperCase()  // CS + 6 chars
    },

    // Các hàm CRUD thao tác với localStorage
    all: function(table) {
        const data = localStorage.getItem(table);
        return data ? JSON.parse(data) : [];
    },

    get: function(table, id) {
        const items = this.all(table);
        // Hỗ trợ tìm kiếm theo id hoặc orderId hoặc txnId
        return items.find(i => i.id === id || i.orderId === id || i.txnId === id);
    },

    insert: function(table, item) {
        const items = this.all(table);
        items.push(item);
        localStorage.setItem(table, JSON.stringify(items));
        return item;
    },

    update: function(table, id, updates) {
        const items = this.all(table);
        const index = items.findIndex(i => i.id === id || i.orderId === id || i.txnId === id);
        if (index !== -1) {
            items[index] = { ...items[index], ...updates };
            localStorage.setItem(table, JSON.stringify(items));
            return items[index];
        }
        return null;
    },

    remove: function(table, id) {
        const items = this.all(table);
        const filtered = items.filter(i => i.id !== id && i.orderId !== id && i.txnId !== id);
        localStorage.setItem(table, JSON.stringify(filtered));
    },

    clear: function(table) {
        localStorage.removeItem(table);
    },

    // Reset toàn bộ DB (xoá local storage) và tạo mới
    resetAll: function() {
        localStorage.clear();
        if (typeof VirtualClock !== 'undefined') {
            VirtualClock.resetClock();
        }
        this.seed();
    },

    // Hàm seed khởi tạo dữ liệu mặc định ban đầu
    seed: function() {
        if (!localStorage.getItem('isSeeded')) {
            // Seed dữ liệu tĩnh từ DemoData (yêu cầu data.js phải được load trước)
            localStorage.setItem('movies', JSON.stringify(DemoData.movies));
            localStorage.setItem('cinemas', JSON.stringify(DemoData.cinemas));
            localStorage.setItem('rooms', JSON.stringify(DemoData.rooms));
            localStorage.setItem('combos', JSON.stringify(DemoData.combos));
            localStorage.setItem('accounts', JSON.stringify(DemoData.accounts));
            localStorage.setItem('paymentMethods', JSON.stringify(DemoData.paymentMethods));
            
            // Generate suất chiếu
            const showtimes = DemoData.generateShowtimes();
            localStorage.setItem('showtimes', JSON.stringify(showtimes));

            // Generate đơn hàng mẫu (lịch sử) để test giao dịch treo
            this.seedSampleData(showtimes);

            localStorage.setItem('isSeeded', 'true');
            console.log("Cơ sở dữ liệu đã được seed (khởi tạo) thành công.");
        }
    },

    // Tạo các đơn mẫu để thử nghiệm, phục vụ màn hình admin đối soát
    seedSampleData: function(showtimes) {
        const orders = [];
        const txns = [];
        const now = typeof VirtualClock !== 'undefined' ? VirtualClock.now() : new Date();
        
        // Cần tạo 40 đơn lịch sử
        // - Đa số PAID
        // - 4-5 giao dịch treo (Cổng SUCCESS, debited=true, callback LOST, Beta FAILED/PENDING_VERIFY)
        // - 2 FAILED thực sự
        // - 1 DELAYED callback

        const userEmail = DemoData.accounts[0].email;
        const methods = ['EWALLET_A', 'EWALLET_B', 'ATM', 'CC'];

        for (let i = 0; i < 40; i++) {
            const orderId = this.generateId.order();
            const txnId = this.generateId.txn();
            const method = methods[i % methods.length];
            const amount = 150000 + (Math.floor(Math.random() * 5) * 10000); // 150k - 190k
            const st = showtimes[i % showtimes.length];

            // Ngày tạo đơn rải rác trong 7 ngày qua
            const daysAgo = Math.floor(Math.random() * 7);
            const hoursAgo = Math.floor(Math.random() * 24);
            const createdAt = new Date(now.getTime() - (daysAgo * 24 * 60 * 60 * 1000) - (hoursAgo * 60 * 60 * 1000));
            
            let orderStatus = 'PAID';
            let txnStatus = 'SUCCESS';
            let callbackMode = 'OK';
            let debited = true;
            let callbackAt = new Date(createdAt.getTime() + 1000 * 30); // Callback ngay sau 30 giây

            if (i < 5) {
                // S1/S2: Giao dịch treo
                // Cổng trừ tiền thành công, callback rớt, Beta hủy đơn do timeout (PENDING_VERIFY hoặc FAILED)
                orderStatus = 'FAILED'; 
                txnStatus = 'SUCCESS';
                callbackMode = 'LOST';
                debited = true;
                callbackAt = null; // Chưa bao giờ gọi callback
            } else if (i === 5 || i === 6) {
                // S6: FAILED thực sự (khách hủy hoặc không đủ tiền)
                orderStatus = 'FAILED';
                txnStatus = 'FAILED';
                callbackMode = 'OK';
                debited = false;
            } else if (i === 7) {
                // S3: DELAYED callback (callback đến trễ 20 phút)
                orderStatus = 'PAID'; // Khách đã được xuất vé khi callback bù đến
                txnStatus = 'SUCCESS';
                callbackMode = 'DELAYED';
                debited = true;
                callbackAt = new Date(createdAt.getTime() + 1000 * 60 * 20); // Trễ 20p
            }

            const order = {
                orderId: orderId,
                userEmail: userEmail,
                movieId: st.movieId,
                cinemaId: st.cinemaId,
                showtimeId: st.id,
                seats: ['F5', 'F6'],
                combos: [{ id: 'cb1', qty: 1 }],
                amount: amount,
                status: orderStatus,
                createdAt: createdAt.toISOString(),
                holdExpiresAt: new Date(createdAt.getTime() + 10 * 60000).toISOString(),
                txnId: txnId,
                paidAt: orderStatus === 'PAID' ? callbackAt.toISOString() : null,
                callbackAt: callbackAt ? callbackAt.toISOString() : null,
                ticketId: orderStatus === 'PAID' ? this.generateId.ticket() : null
            };

            const txn = {
                txnId: txnId,
                orderId: orderId,
                method: method,
                amount: amount,
                status: txnStatus,
                debited: debited,
                callback: {
                    mode: callbackMode,
                    dispatchedAt: callbackAt ? callbackAt.toISOString() : null
                },
                createdAt: createdAt.toISOString()
            };

            orders.push(order);
            txns.push(txn);
        }

        // Sắp xếp giảm dần theo thời gian tạo mới nhất
        orders.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
        txns.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

        localStorage.setItem('beta_orders', JSON.stringify(orders));
        localStorage.setItem('gateway_txns', JSON.stringify(txns));
        localStorage.setItem('refunds', JSON.stringify([]));
    }
};