'use strict';

/**
 * MIGRATION 010 - Bảng Banners, Tin tức & Ưu đãi, Bảng giá vé phục vụ Quản lý (MANAGER)
 */
exports.up = async (knex) => {
  const nowIso = new Date().toISOString();

  // 1. banners
  const hasBanners = await knex.schema.hasTable('banners');
  if (!hasBanners) {
    await knex.schema.createTable('banners', (t) => {
      t.increments('id').primary();
      t.string('title').notNullable();
      t.text('image_url').notNullable();
      t.text('link_url').nullable();
      t.integer('sort_order').notNullable().defaultTo(0);
      t.boolean('is_active').notNullable().defaultTo(true);
      t.string('created_at').notNullable();
      t.string('updated_at').notNullable();
    });

    // Seed banner mẫu
    await knex('banners').insert([
      {
        title: 'Tháng Phim Siêu Quái - Khởi chiếu rực rỡ',
        image_url: 'https://files.betacorp.vn/media/images/2026/10/08/combosieucu-1702x621-115549-081026-63.png',
        link_url: '#phim-dang-chieu',
        sort_order: 1,
        is_active: true,
        created_at: nowIso,
        updated_at: nowIso,
      },
      {
        title: 'Ưu Đãi Thứ 3 Vui Vẻ - Vé chỉ từ 45k',
        image_url: 'https://files.betacorp.vn/media/images/2026/09/25/t3vuive-1702x621-092526-12.png',
        link_url: '#promo-t3',
        sort_order: 2,
        is_active: true,
        created_at: nowIso,
        updated_at: nowIso,
      },
    ]);
  }

  // 2. promotions (Tin và ưu đãi)
  const hasPromotions = await knex.schema.hasTable('promotions');
  if (!hasPromotions) {
    await knex.schema.createTable('promotions', (t) => {
      t.increments('id').primary();
      t.string('title').notNullable();
      t.string('slug').notNullable().unique();
      t.text('summary').nullable();
      t.text('content').nullable();
      t.text('image_url').nullable();
      t.string('type').notNullable().defaultTo('PROMOTION'); // PROMOTION | NEWS
      t.string('start_date').nullable();
      t.string('end_date').nullable();
      t.boolean('is_active').notNullable().defaultTo(true);
      t.string('created_at').notNullable();
      t.string('updated_at').notNullable();
    });

    // Seed ưu đãi & tin mẫu
    await knex('promotions').insert([
      {
        title: 'Ưu Đãi Thứ 3 Vui Vẻ',
        slug: 'uu-dai-thu-3-vui-ve',
        summary: 'Giá vé đồng giá 45.000đ áp dụng cho tất cả các suất chiếu thứ 3 hàng tuần.',
        content: 'Chương trình ưu đãi Thứ 3 vui vẻ tại toàn bộ cụm rạp Beta Cinemas trên toàn quốc. Áp dụng cho mọi khách hàng khi đặt vé online hoặc mua tại quầy.',
        image_url: 'https://files.betacorp.vn/media/images/2026/09/25/t3vuive-1702x621-092526-12.png',
        type: 'PROMOTION',
        start_date: '2026-01-01',
        end_date: '2026-12-31',
        is_active: true,
        created_at: nowIso,
        updated_at: nowIso,
      },
      {
        title: 'Ưu Đãi Học Sinh Sinh Viên',
        slug: 'uu-dai-hoc-sinh-sinh-vien',
        summary: 'Đồng giá 40k cho phim 2D khi xuất trình thẻ HSSV hoặc CCCD dưới 22 tuổi.',
        content: 'Rạp sinh viên - giá vé cũng rất sinh viên! Nhận ngay mức giá ưu đãi 40k phim 2D, 60k phim 3D tại các cụm rạp Beta Cinemas.',
        image_url: 'https://files.betacorp.vn/media/images/2026/10/08/combosieucu-1702x621-115549-081026-63.png',
        type: 'PROMOTION',
        start_date: '2026-01-01',
        end_date: '2026-12-31',
        is_active: true,
        created_at: nowIso,
        updated_at: nowIso,
      },
      {
        title: 'Khai Trương Cụm Rạp Mới Hiện Đại',
        slug: 'khai-truong-cum-rap-moi',
        summary: 'Beta Cinemas mở rộng thêm cụm rạp tiêu chuẩn quốc tế tại trung tâm thành phố.',
        content: 'Chào đón thành viên mới trong chuỗi rạp Beta Cinemas với phòng chiếu chuẩn âm thanh Dolby 7.1 và màn chiếu siêu nét.',
        image_url: 'https://files.betacorp.vn/media/images/2026/10/10/newcinema-1702x621.png',
        type: 'NEWS',
        start_date: '2026-10-01',
        end_date: '2026-12-31',
        is_active: true,
        created_at: nowIso,
        updated_at: nowIso,
      },
    ]);
  }

  // 3. ticket_prices (Bảng giá vé)
  const hasTicketPrices = await knex.schema.hasTable('ticket_prices');
  if (!hasTicketPrices) {
    await knex.schema.createTable('ticket_prices', (t) => {
      t.increments('id').primary();
      t.string('name').notNullable();
      t.string('format').notNullable(); // 2D | 3D
      t.string('seat_type').notNullable(); // STANDARD | VIP | COUPLE
      t.integer('price').notNullable();
      t.text('description').nullable();
      t.string('created_at').notNullable();
      t.string('updated_at').notNullable();
    });

    await knex('ticket_prices').insert([
      { name: 'Vé 2D Chuẩn', format: '2D', seat_type: 'STANDARD', price: 50000, description: 'Ghế thường ngày thường', created_at: nowIso, updated_at: nowIso },
      { name: 'Vé 2D VIP', format: '2D', seat_type: 'VIP', price: 60000, description: 'Ghế VIP tầm nhìn đẹp nhất', created_at: nowIso, updated_at: nowIso },
      { name: 'Vé 2D Đôi (Couple)', format: '2D', seat_type: 'COUPLE', price: 120000, description: 'Ghế đôi dành cho 2 người', created_at: nowIso, updated_at: nowIso },
      { name: 'Vé 3D Chuẩn', format: '3D', seat_type: 'STANDARD', price: 70000, description: 'Phim 3D ghế thường', created_at: nowIso, updated_at: nowIso },
      { name: 'Vé 3D VIP', format: '3D', seat_type: 'VIP', price: 85000, description: 'Phim 3D ghế VIP', created_at: nowIso, updated_at: nowIso },
      { name: 'Vé 3D Đôi (Couple)', format: '3D', seat_type: 'COUPLE', price: 160000, description: 'Phim 3D ghế đôi', created_at: nowIso, updated_at: nowIso },
    ]);
  }
};

exports.down = async (knex) => {
  await knex.schema.dropTableIfExists('ticket_prices');
  await knex.schema.dropTableIfExists('promotions');
  await knex.schema.dropTableIfExists('banners');
};
