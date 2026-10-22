'use strict';

const request = require('supertest');
const { createApp } = require('../src/app');

describe('Showtimes API & Seat Layout Verification', () => {
  let app;

  beforeAll(() => {
    app = createApp();
  });

  describe('GET /api/v1/showtimes', () => {
    it('should return showtimes list grouped by movie and list of cinemas', async () => {
      const res = await request(app)
        .get('/api/v1/showtimes')
        .expect(200);

      expect(res.body.ok).toBe(true);
      expect(Array.isArray(res.body.data.cinemas)).toBe(true);
      expect(res.body.data.cinemas.length).toBeGreaterThan(0);
      expect(Array.isArray(res.body.data.movies)).toBe(true);
    });

    it('should filter showtimes by cinemaId and date', async () => {
      const res = await request(app)
        .get('/api/v1/showtimes?cinemaId=2&date=2026-10-22')
        .expect(200);

      expect(res.body.ok).toBe(true);
      expect(res.body.data.selectedCinemaId).toBe(2);
      expect(res.body.data.selectedDate).toBe('2026-10-22');
      if (res.body.data.movies.length > 0) {
        const movie = res.body.data.movies[0];
        expect(movie.movieTitle).toBeDefined();
        expect(Array.isArray(movie.showtimes)).toBe(true);
        expect(movie.showtimes.length).toBeGreaterThan(0);
        expect(movie.showtimes[0].time).toBeDefined();
      }
    });
  });

  describe('GET /api/v1/showtimes/:id/seats', () => {
    it('should return full 96 seats for a 12-column standard room without skipping columns', async () => {
      const res = await request(app)
        .get('/api/v1/showtimes/1/seats')
        .expect(200);

      expect(res.body.ok).toBe(true);
      const { showtime, seats } = res.body.data;
      expect(showtime.id).toBe(1);
      expect(seats.length).toBe(96);

      // Kiểm tra hàng A có đủ 12 cột từ 1 đến 12 không bị khuyết
      const rowA = seats.filter((s) => s.row === 'A');
      expect(rowA.length).toBe(12);
      expect(rowA.map((s) => s.col)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]);

      // Kiểm tra hàng H (ghế đôi) có đủ 12 cột và các cặp ghép đôi chuẩn
      const rowH = seats.filter((s) => s.row === 'H');
      expect(rowH.length).toBe(12);
      expect(rowH.every((s) => s.type === 'COUPLE')).toBe(true);
      expect(rowH.find((s) => s.col === 1).pairCol).toBe(2);
      expect(rowH.find((s) => s.col === 2).pairCol).toBe(1);
    });
  });
});
