'use strict';

/**
 * MIGRATION 001 - Bảng danh mục (Catalog)
 */
exports.up = async (knex) => {
  // users
  await knex.schema.createTable('users', (t) => {
    t.increments('id').primary();
    t.string('email').notNullable().unique();
    t.string('phone');
    t.string('full_name');
    t.string('password_hash');
    t.string('role').notNullable(); // CHECK IN (CUSTOMER,IT,ACCOUNTANT,CSKH,MANAGER)
    t.integer('points').notNullable().defaultTo(0);
    t.boolean('is_active').notNullable().defaultTo(true);
    t.string('created_at').notNullable();
    t.string('updated_at').notNullable();
  });
  await knex.raw(`ALTER TABLE users ADD CONSTRAINT check_users_role CHECK (role IN ('CUSTOMER','IT','ACCOUNTANT','CSKH','MANAGER'))`);

  // cinemas
  await knex.schema.createTable('cinemas', (t) => {
    t.increments('id').primary();
    t.string('code').notNullable().unique();
    t.string('name').notNullable();
    t.string('city').notNullable();
    t.string('address').notNullable();
    t.string('hotline').notNullable();
  });

  // rooms
  await knex.schema.createTable('rooms', (t) => {
    t.increments('id').primary();
    t.integer('cinema_id').notNullable().references('id').inTable('cinemas').onDelete('RESTRICT');
    t.string('name').notNullable();
    t.string('room_type').notNullable(); // CHECK IN (2D,3D)
    t.unique(['cinema_id', 'name']);
  });
  await knex.raw(`ALTER TABLE rooms ADD CONSTRAINT check_rooms_type CHECK (room_type IN ('2D','3D'))`);

  // seats
  await knex.schema.createTable('seats', (t) => {
    t.increments('id').primary();
    t.integer('room_id').notNullable().references('id').inTable('rooms').onDelete('RESTRICT');
    t.string('row_label').notNullable();
    t.integer('col_number').notNullable();
    t.string('seat_type').notNullable(); // CHECK IN (STANDARD,VIP,COUPLE)
    t.integer('pair_col').nullable();
    t.unique(['room_id', 'row_label', 'col_number']);
  });
  await knex.raw(`ALTER TABLE seats ADD CONSTRAINT check_seats_type CHECK (seat_type IN ('STANDARD','VIP','COUPLE'))`);

  // movies
  await knex.schema.createTable('movies', (t) => {
    t.increments('id').primary();
    t.string('slug').notNullable().unique();
    t.string('title').notNullable();
    t.json('genres_json').notNullable();
    t.integer('duration_min').notNullable();
    t.string('age_rating').notNullable(); // CHECK IN (P,T13,T16,T18)
    t.string('status').notNullable(); // CHECK IN (NOW_SHOWING,COMING_SOON,SPECIAL)
    t.text('synopsis').notNullable();
    t.string('director').notNullable();
    t.json('cast_json').notNullable();
    t.string('language').notNullable();
    t.string('release_date').notNullable(); // YYYY-MM-DD
    t.string('sneak_at').nullable(); // ISO-8601
    t.boolean('is_hot').notNullable().defaultTo(false);
    t.integer('sort_order').notNullable().defaultTo(999);
    t.json('poster_style_json').notNullable();
    t.json('trailer_json').notNullable();
  });
  await knex.raw(`ALTER TABLE movies ADD CONSTRAINT check_movies_age_rating CHECK (age_rating IN ('P','T13','T16','T18'))`);
  await knex.raw(`ALTER TABLE movies ADD CONSTRAINT check_movies_status CHECK (status IN ('NOW_SHOWING','COMING_SOON','SPECIAL'))`);

  // showtimes
  await knex.schema.createTable('showtimes', (t) => {
    t.increments('id').primary();
    t.integer('movie_id').notNullable().references('id').inTable('movies').onDelete('RESTRICT');
    t.integer('room_id').notNullable().references('id').inTable('rooms').onDelete('RESTRICT');
    t.string('starts_at').notNullable(); // ISO-8601
    t.string('ends_at').notNullable();   // ISO-8601
    t.string('format').notNullable();    // CHECK IN (2D,3D)
    t.integer('price_standard').notNullable();
    t.integer('price_vip').notNullable();
    t.integer('price_couple').notNullable();
    t.string('status').notNullable(); // CHECK IN (OPEN,CLOSED,CANCELLED)
    
    t.index(['movie_id', 'starts_at']);
    t.index(['room_id', 'starts_at']);
  });
  await knex.raw(`ALTER TABLE showtimes ADD CONSTRAINT check_showtimes_format CHECK (format IN ('2D','3D'))`);
  await knex.raw(`ALTER TABLE showtimes ADD CONSTRAINT check_showtimes_status CHECK (status IN ('OPEN','CLOSED','CANCELLED'))`);
  await knex.raw(`ALTER TABLE showtimes ADD CONSTRAINT check_showtimes_price CHECK (price_standard >= 0 AND price_vip >= 0 AND price_couple >= 0)`);

  // combos
  await knex.schema.createTable('combos', (t) => {
    t.increments('id').primary();
    t.string('name').notNullable();
    t.string('description').notNullable();
    t.integer('price').notNullable();
    t.boolean('is_active').notNullable().defaultTo(true);
  });
  await knex.raw(`ALTER TABLE combos ADD CONSTRAINT check_combos_price CHECK (price >= 0)`);
};

exports.down = async (knex) => {
  await knex.schema.dropTableIfExists('combos');
  await knex.schema.dropTableIfExists('showtimes');
  await knex.schema.dropTableIfExists('movies');
  await knex.schema.dropTableIfExists('seats');
  await knex.schema.dropTableIfExists('rooms');
  await knex.schema.dropTableIfExists('cinemas');
  await knex.schema.dropTableIfExists('users');
};
