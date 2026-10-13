'use strict';

const fs = require('fs');
const path = require('path');
const clock = require('../../../lib/clock');

function loadDemoData() {
  const dataPath = path.join(__dirname, '../../../../../../js/data.js');
  const code = fs.readFileSync(dataPath, 'utf8');
  const window = {};
  // Cung cấp VirtualClock giả để data.js chạy được _initDates()
  const VirtualClock = { now: () => clock.now() };
  
  // Chạy code data.js trong một function tạm
  const fn = new Function('window', 'VirtualClock', code + '\nreturn window.DemoData;');
  const data = fn(window, VirtualClock);
  
  // Khởi tạo ngày tháng
  data._initDates();
  return data;
}

exports.seed = async function (knex) {
  const data = loadDemoData();
  
  // 1. Cinemas
  await knex('cinemas').del();
  const cinemas = data.cinemas.map(c => ({
    id: parseInt(c.id.replace('c', ''), 10),
    code: c.id.toUpperCase(),
    name: c.name,
    city: c.city,
    address: c.address,
    hotline: c.hotline,
  }));
  await knex('cinemas').insert(cinemas);

  // 2. Rooms & Seats
  await knex('seats').del();
  await knex('rooms').del();
  const rooms = [];
  const seats = [];
  
  for (let cIdx = 0; cIdx < cinemas.length; cIdx++) {
    const cinema = cinemas[cIdx];
    for (let rIdx = 0; rIdx < data.rooms.length; rIdx++) {
      const r = data.rooms[rIdx];
      const roomId = cIdx * 10 + rIdx + 1; // 11, 12, 21, 22...
      rooms.push({
        id: roomId,
        cinema_id: cinema.id,
        name: r.name,
        room_type: '2D', // Giả định
      });
      
      // Tạo ghế cho phòng này
      const layout = r.layout;
      let seatIdCounter = roomId * 1000;
      for (let i = 0; i < layout.rows; i++) {
        const rowLabel = String.fromCharCode(65 + i);
        const isVip = layout.vipRows && layout.vipRows.includes(rowLabel);
        const isDouble = layout.doubleRows && layout.doubleRows.includes(rowLabel);
        
        for (let j = 1; j <= layout.cols; j++) {
          if (layout.aisles && layout.aisles.includes(j)) continue; // Lối đi
          
          const seatType = isDouble ? 'COUPLE' : (isVip ? 'VIP' : 'STANDARD');
          let pairCol = null;
          
          if (isDouble) {
            // Cứ 2 cột liền nhau là 1 cặp (giả định đơn giản: cột lẻ và chẵn tiếp theo)
            if (j % 2 !== 0 && !layout.aisles.includes(j+1) && j < layout.cols) {
              pairCol = j + 1;
            } else if (j % 2 === 0 && !layout.aisles.includes(j-1)) {
              pairCol = j - 1;
            }
          }
          
          seats.push({
            id: seatIdCounter++,
            room_id: roomId,
            row_label: rowLabel,
            col_number: j,
            seat_type: seatType,
            pair_col: pairCol,
          });
        }
      }
    }
  }
  await knex('rooms').insert(rooms);
  // SQLite limits insert size, batch seats
  for (let i = 0; i < seats.length; i += 500) {
    await knex('seats').insert(seats.slice(i, i + 500));
  }

  // 3. Movies
  await knex('movies').del();
  const movies = data.movies.map((m, idx) => {
    return {
      id: parseInt(m.id.replace('m', ''), 10),
      slug: `movie-${m.id}`,
      title: m.title,
      genres_json: JSON.stringify(m.genres),
      duration_min: m.duration,
      age_rating: m.ageRating === 'K' ? 'P' : m.ageRating, // Map K to P if needed
      status: m.status === 'nowShowing' ? 'NOW_SHOWING' : (m.status === 'comingSoon' ? 'COMING_SOON' : 'SPECIAL'),
      synopsis: m.synopsis || 'Chưa có thông tin tóm tắt.',
      director: 'Đang cập nhật',
      cast_json: JSON.stringify(['Đang cập nhật']),
      language: 'Tiếng Việt',
      release_date: m.releaseDate || '2026-01-01',
      sneak_at: null,
      is_hot: !!m.hot,
      sort_order: m.sortOrder || 999,
      poster_style_json: JSON.stringify({ url: m.imageUrl }),
      trailer_json: JSON.stringify(m.trailer || {}),
    };
  });
  await knex('movies').insert(movies);

  // 4. Combos
  await knex('combos').del();
  const combos = data.combos.map(c => ({
    id: parseInt(c.id.replace('cb', ''), 10),
    name: c.name,
    description: c.desc,
    price: c.price,
    is_active: true,
  }));
  await knex('combos').insert(combos);

  // 5. Showtimes (Sinh lịch chiếu 7 ngày)
  await knex('showtimes').del();
  const showtimes = [];
  const now = clock.now();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  
  let showtimeIdCounter = 1;
  // Sinh suất chiếu ngẫu nhiên nhưng cố định (dựa trên math mộc)
  for (let d = 0; d < 7; d++) {
    const showDate = new Date(today.getTime() + d * 86400000);
    const dateStr = showDate.toISOString().split('T')[0];
    
    for (const cinema of cinemas) {
      const cinemaRooms = rooms.filter(r => r.cinema_id === cinema.id);
      
      for (const room of cinemaRooms) {
        // Mỗi phòng chiếu 3 phim mỗi ngày
        for (let s = 0; s < 3; s++) {
          const movieId = movies[(cinema.id + room.id + d + s) % movies.length].id;
          const movie = movies.find(m => m.id === movieId);
          
          const startHour = 9 + s * 4; // 9:00, 13:00, 17:00
          const startsAt = new Date(`${dateStr}T${startHour.toString().padStart(2, '0')}:00:00Z`);
          const endsAt = new Date(startsAt.getTime() + (movie.duration_min + 15) * 60000);
          
          showtimes.push({
            id: showtimeIdCounter++,
            movie_id: movieId,
            room_id: room.id,
            starts_at: startsAt.toISOString(),
            ends_at: endsAt.toISOString(),
            format: '2D',
            price_standard: 50000,
            price_vip: 60000,
            price_couple: 120000,
            status: 'OPEN',
          });
        }
      }
    }
  }
  await knex('showtimes').insert(showtimes);
  
  // 6. Bán sẵn một số ghế (Showtime Seats)
  await knex('showtime_seats').del();
  const soldSeats = [];
  for (let i = 0; i < showtimes.length; i+=5) { // Chọn 1/5 số suất chiếu
    const st = showtimes[i];
    const roomSeats = seats.filter(s => s.room_id === st.room_id);
    
    // Bán 3 ghế đầu tiên của phòng
    for (let j = 0; j < Math.min(3, roomSeats.length); j++) {
      soldSeats.push({
        showtime_id: st.id,
        seat_id: roomSeats[j].id,
        state: 'SOLD',
        order_id: null, // Mua tại quầy
        held_until: null,
      });
    }
  }
  
  for (let i = 0; i < soldSeats.length; i += 500) {
    await knex('showtime_seats').insert(soldSeats.slice(i, i + 500));
  }
};
