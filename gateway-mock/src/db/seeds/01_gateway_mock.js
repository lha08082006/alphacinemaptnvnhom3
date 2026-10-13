'use strict';

exports.seed = async function (knex) {
  // Chỉ reset merchant
  await knex('merchants').del();
  
  await knex('merchants').insert([
    {
      id: 1,
      code: 'BETA',
      name: 'Beta Cinemas',
      api_key: 'gw_dev_api_key_012345',
      webhook_url: 'http://localhost:4000/api/v1/webhooks/gateway',
      webhook_secret: 'dev_webhook_secret_change_me_0123',
    }
  ]);
};
