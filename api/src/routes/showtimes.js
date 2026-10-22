'use strict';

const express = require('express');
const { z } = require('zod');
const knex = require('../db/knex');
const clock = require('../lib/clock');
const { asyncHandler, sendOk } = require('../lib/http');
const { AppError } = require('../lib/errors');
const { validate } = require('../middleware/validate');

const router = express.Router();

/**
 * GET /showtimes/:id/seats
 * Lấy sơ đồ ghế thực tế từ bảng showtimes, seats và showtime_seats.
 * Hoàn toàn không dùng Math.random().
 */
router.get(
  '/:id/seats',
  validate({ params: z.object({ id: z.coerce.number().int().positive() }) }),
  asyncHandler(async (req, res) => {
    const showtimeId = req.valid.params.id;
    const nowIso = clock.nowIso();

    // 1. Lấy thông tin suất chiếu, phim, phòng chiếu và rạp
    const showtime = await knex('showtimes as st')
      .join('movies as m', 'st.movie_id', 'm.id')
      .join('rooms as r', 'st.room_id', 'r.id')
      .join('cinemas as c', 'r.cinema_id', 'c.id')
      .where('st.id', showtimeId)
      .select(
        'st.id as showtime_id',
        'st.starts_at',
        'st.ends_at',
        'st.format',
        'st.price_standard',
        'st.price_vip',
        'st.price_couple',
        'st.status as showtime_status',
        'st.room_id',
        'm.id as movie_id',
        'm.title as movie_title',
        'm.age_rating',
        'm.duration_min',
        'm.genres_json',
        'm.poster_style_json',
        'r.name as room_name',
        'c.name as cinema_name'
      )
      .first();

    if (!showtime) {
      throw new AppError('NOT_FOUND');
    }

    // 2. Lấy toàn bộ danh sách ghế trong phòng chiếu
    const allSeats = await knex('seats')
      .where({ room_id: showtime.room_id })
      .orderBy(['row_label', 'col_number']);

    // 3. Lấy trạng thái các ghế đã bán hoặc đang giữ trong suất chiếu này
    const bookedSeats = await knex('showtime_seats')
      .where({ showtime_id: showtimeId })
      .select('seat_id', 'state', 'held_until', 'order_id');

    const bookedMap = new Map();
    for (const bs of bookedSeats) {
      bookedMap.set(bs.seat_id, bs);
    }

    // 4. Tổng hợp trạng thái từng ghế
    const seatList = allSeats.map((s) => {
      let status = 'AVAILABLE';
      const booked = bookedMap.get(s.id);

      if (booked) {
        if (booked.state === 'SOLD') {
          status = 'SOLD';
        } else if (booked.state === 'HELD') {
          // Kiểm tra xem thời gian giữ ghế đã hết hạn chưa
          if (booked.held_until && new Date(booked.held_until).getTime() > new Date(nowIso).getTime()) {
            status = 'HELD';
          } else {
            status = 'AVAILABLE'; // Hết hạn -> tự động xem như trống
          }
        }
      }

      // Xác định giá vé theo loại ghế
      let price = showtime.price_standard;
      if (s.seat_type === 'VIP') {
        price = showtime.price_vip;
      } else if (s.seat_type === 'COUPLE') {
        price = showtime.price_couple;
      }

      return {
        id: s.id,
        row: s.row_label,
        col: s.col_number,
        label: `${s.row_label}${s.col_number}`,
        type: s.seat_type,
        pairCol: s.pair_col,
        price,
        status,
      };
    });

    let posterUrl = null;
    try {
      const posterData = typeof showtime.poster_style_json === 'string'
        ? JSON.parse(showtime.poster_style_json)
        : (showtime.poster_style_json || {});
      posterUrl = posterData.url || posterData.imageUrl || null;
    } catch (_) {
      posterUrl = null;
    }

    sendOk(res, {
      showtime: {
        id: showtime.showtime_id,
        movieId: showtime.movie_id,
        movieTitle: showtime.movie_title,
        ageRating: showtime.age_rating,
        durationMin: showtime.duration_min,
        genres: typeof showtime.genres_json === 'string' ? JSON.parse(showtime.genres_json) : showtime.genres_json,
        imageUrl: posterUrl,
        cinemaName: showtime.cinema_name,
        roomName: showtime.room_name,
        startsAt: showtime.starts_at,
        endsAt: showtime.ends_at,
        format: showtime.format,
        prices: {
          STANDARD: showtime.price_standard,
          VIP: showtime.price_vip,
          COUPLE: showtime.price_couple,
        },
      },
      seats: seatList,
    });
  })
);

/**
 * GET /showtimes
 * Lấy danh sách lịch chiếu theo rạp và ngày.
 * Query: cinemaId, cinema, date (YYYY-MM-DD), movieId
 */
router.get(
  '/',
  validate({
    query: z.object({
      cinemaId: z.coerce.number().int().positive().optional(),
      cinema: z.string().optional(),
      date: z.string().optional(),
      movieId: z.coerce.number().int().positive().optional(),
    }),
  }),
  asyncHandler(async (req, res) => {
    const { cinemaId, cinema, date, movieId } = req.valid.query;

    // 1. Lấy danh sách rạp để frontend tạo bộ lọc
    const cinemas = await knex('cinemas')
      .whereNot('id', 999)
      .select('id', 'name', 'city', 'address', 'hotline')
      .orderBy('id');

    let targetCinemaId = cinemaId;
    if (!targetCinemaId && cinema) {
      const found = cinemas.find(c => String(c.id) === String(cinema) || c.name.toLowerCase().includes(cinema.toLowerCase()));
      if (found) targetCinemaId = found.id;
    }
    if (!targetCinemaId && cinemas.length > 0) {
      targetCinemaId = cinemas[0].id; // Mặc định rạp đầu tiên
    }

    // 2. Lấy các suất chiếu
    let query = knex('showtimes as st')
      .join('movies as m', 'st.movie_id', 'm.id')
      .join('rooms as r', 'st.room_id', 'r.id')
      .join('cinemas as c', 'r.cinema_id', 'c.id')
      .where('st.status', 'OPEN');

    if (targetCinemaId) {
      query = query.where('c.id', targetCinemaId);
    }

    if (date) {
      query = query.where('st.starts_at', 'like', `${date}%`);
    }

    if (movieId) {
      query = query.where('m.id', movieId);
    }

    const showtimes = await query
      .select(
        'st.id',
        'st.starts_at',
        'st.ends_at',
        'st.format',
        'st.price_standard',
        'st.price_vip',
        'st.price_couple',
        'st.status',
        'r.id as room_id',
        'r.name as room_name',
        'c.id as cinema_id',
        'c.name as cinema_name',
        'm.id as movie_id',
        'm.title as movie_title',
        'm.age_rating',
        'm.duration_min',
        'm.genres_json',
        'm.poster_style_json'
      )
      .orderBy(['m.sort_order', 'm.id', 'st.starts_at']);

    // 3. Gom nhóm theo từng phim
    const movieMap = new Map();
    for (const st of showtimes) {
      if (!movieMap.has(st.movie_id)) {
        let posterUrl = null;
        try {
          const posterData = typeof st.poster_style_json === 'string'
            ? JSON.parse(st.poster_style_json)
            : (st.poster_style_json || {});
          posterUrl = posterData.url || posterData.imageUrl || null;
        } catch (_) {}

        movieMap.set(st.movie_id, {
          movieId: st.movie_id,
          movieTitle: st.movie_title,
          ageRating: st.age_rating,
          durationMin: st.duration_min,
          genres: typeof st.genres_json === 'string' ? JSON.parse(st.genres_json) : st.genres_json,
          posterUrl,
          showtimes: [],
        });
      }

      const startsDate = new Date(st.starts_at);
      const timeStr = st.starts_at.length >= 16 ? st.starts_at.substring(11, 16) : '';
      const hour = startsDate.getUTCHours(); // giờ UTC hoặc giờ trong ISO

      movieMap.get(st.movie_id).showtimes.push({
        id: st.id,
        startsAt: st.starts_at,
        endsAt: st.ends_at,
        time: timeStr,
        format: st.format,
        roomName: st.room_name,
        priceStandard: st.price_standard,
        priceVip: st.price_vip,
        priceCouple: st.price_couple,
        isLate: hour >= 15 || timeStr >= '22:00', // Suất chiếu muộn
      });
    }

    sendOk(res, {
      cinemas,
      selectedCinemaId: targetCinemaId,
      selectedDate: date || null,
      totalShowtimes: showtimes.length,
      movies: Array.from(movieMap.values()),
    });
  })
);

module.exports = router;
