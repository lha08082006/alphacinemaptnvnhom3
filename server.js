/**
 * Server chính của dự án Beta Cinemas.
 * Hỗ trợ 2 chế độ:
 * 1. Chế độ Vercel Services (khi có process.env.API_URL):
 *    Đóng vai trò service 'app' phục vụ Frontend tĩnh, các route thân thiện,
 *    và chuyển tiếp (proxy) các request API nội bộ sang service 'api' qua process.env.API_URL.
 * 2. Chế độ Monolith Local (khi chạy độc lập không có API_URL):
 *    Khởi chạy server tích hợp trọn gói từ api/src/server.js.
 */
'use strict';

if (process.env.API_URL) {
  const path = require('path');
  const express = require('express');
  const app = express();
  const PORT = process.env.PORT || 3000;

  // Phục vụ tài nguyên tĩnh Frontend
  app.use(express.static(path.join(__dirname)));

  // Route alias thân thiện cho giao diện web
  app.get('/dang-nhap', (_req, res) => {
    res.sendFile(path.join(__dirname, 'dang-nhap.html'));
  });
  app.get('/booking', (_req, res) => {
    res.sendFile(path.join(__dirname, 'booking.html'));
  });
  app.get('/seats', (_req, res) => {
    res.redirect('/booking');
  });
  app.get('/checkout', (_req, res) => {
    res.sendFile(path.join(__dirname, 'checkout.html'));
  });
  app.get('/result', (_req, res) => {
    res.sendFile(path.join(__dirname, 'result.html'));
  });
  app.get(['/admin', '/admin/login'], (_req, res) => {
    res.sendFile(path.join(__dirname, 'admin', 'login.html'));
  });

  // Chuyển tiếp các request gọi API nội bộ tới service 'api' thông qua biến binding API_URL
  app.use('/api', async (req, res) => {
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

  const server = app.listen(PORT, () => {
    console.log(`[app service] Frontend đang chạy tại cổng ${PORT} (API_URL=${process.env.API_URL})`);
  });

  module.exports = server;
} else {
  module.exports = require('./api/src/server.js');
}

