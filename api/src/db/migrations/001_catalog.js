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

  // combos
  await knex.schema.createTable('combos', (t) => {
    t.increments('id').primary();
    t.string('name').notNullable();
    t.string('description').notNullable();
    t.integer('price').notNullable();
    t.boolean('is_active').notNullable().defaultTo(true);
  });
  
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
