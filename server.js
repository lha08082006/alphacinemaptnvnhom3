/**
 * Server chính của dự án Beta Cinemas.
 * Hỗ trợ 2 chế độ:
 * 1. Chế độ Frontend / Vercel Services (service 'frontend'):
 *    Phục vụ toàn bộ giao diện tĩnh Frontend, các route HTML thân thiện,
 *    và chuyển tiếp (proxy) các request API nội bộ sang service 'api' qua process.env.API_URL.
 * 2. Chế độ Monolith Local (khi chạy độc lập không qua Vercel):
 *    Khởi chạy server tích hợp trọn gói từ api/src/server.js.
 */
'use strict';

const path = require('path');
const express = require('express');

// Chạy service 'frontend' nếu có API_URL hoặc đang chạy trên Vercel
if (process.env.API_URL || process.env.VERCEL) {
  const app = express();
  const PORT = process.env.PORT || 3000;

  // Phục vụ tài nguyên tĩnh Frontend (hỗ trợ tự động nhận diện đuôi .html)
  app.use(express.static(path.join(__dirname), { extensions: ['html', 'htm'] }));

  // Trang chủ và các route HTML giao diện khách hàng
  app.get('/', (_req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
  });
  app.get(['/dang-nhap', '/login'], (_req, res) => {
    res.sendFile(path.join(__dirname, 'dang-nhap.html'));
  });
  app.get('/booking', (_req, res) => {
    res.sendFile(path.join(__dirname, 'booking.html'));
  });
  app.get('/seats', (_req, res) => {
    res.sendFile(path.join(__dirname, 'seats.html'));
  });
  app.get('/combo', (_req, res) => {
    res.sendFile(path.join(__dirname, 'combo.html'));
  });
  app.get('/checkout', (_req, res) => {
    res.sendFile(path.join(__dirname, 'checkout.html'));
  });
  app.get('/result', (_req, res) => {
    res.sendFile(path.join(__dirname, 'result.html'));
  });
  app.get('/my-orders', (_req, res) => {
    res.sendFile(path.join(__dirname, 'my-orders.html'));
  });
  app.get('/support', (_req, res) => {
    res.sendFile(path.join(__dirname, 'support.html'));
  });
  app.get('/support-tracking', (_req, res) => {
    res.sendFile(path.join(__dirname, 'support-tracking.html'));
  });
  app.get('/faq', (_req, res) => {
    res.sendFile(path.join(__dirname, 'faq.html'));
  });
  app.get('/inbox', (_req, res) => {
    res.sendFile(path.join(__dirname, 'inbox.html'));
  });

  // Giao diện Quản trị viên (Admin)
  app.get(['/admin', '/admin/login'], (_req, res) => {
    res.sendFile(path.join(__dirname, 'admin', 'login.html'));
  });
  app.get('/admin/dashboard', (_req, res) => {
    res.sendFile(path.join(__dirname, 'admin', 'index.html'));
  });

  // Chuyển tiếp các request gọi API nội bộ tới service 'api' thông qua biến binding API_URL (nếu có)
  app.use('/api', async (req, res) => {
    if (!process.env.API_URL) {
      return res.status(502).json({
        ok: false,
        error: { code: 'API_URL_MISSING', message: 'Chưa cấu hình binding API_URL' },
      });
    }

    try {
      const targetUrl = new URL(`/api${req.url}`, process.env.API_URL);
      const headers = { ...req.headers };
      delete headers.host;

      const fetchOptions = {
        method: req.method,
        headers,
      };

      if (!['GET', 'HEAD'].includes(req.method)) {
        fetchOptions.body = req;
        fetchOptions.duplex = 'half';
      }

      const response = await fetch(targetUrl, fetchOptions);
      res.status(response.status);
      response.headers.forEach((val, key) => res.setHeader(key, val));
      const buf = await response.arrayBuffer();
      res.send(Buffer.from(buf));
    } catch (err) {
      res.status(502).json({
        ok: false,
        error: {
          code: 'SERVICE_UNAVAILABLE',
          message: 'Lỗi kết nối nội bộ tới service api',
          details: err.message,
        },
      });
    }
  });

  if (!process.env.VERCEL && require.main === module) {
    const server = app.listen(PORT, () => {
      console.log(`[frontend service] Frontend đang chạy tại cổng ${PORT}`);
    });
    app.server = server;
  }

  module.exports = app;
} else {
  module.exports = require('./api/src/server.js');
}
