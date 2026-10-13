'use strict';

const express = require('express');
const knex = require('../db/knex');
const clock = require('../lib/clock');
const logger = require('../lib/logger');
const { formatVn } = require('../lib/time');
const { asyncHandler, sendOk } = require('../lib/http');
const { version } = require('../../package.json');

const router = express.Router();

router.get(
  '/',
  asyncHandler(async (req, res) => {
    let db = 'up';
    try {
      await knex.raw('select 1 as ok');
    } catch (err) {
      db = 'down';
      logger.warn('health_db_down', { requestId: req.id, cause: err.message });
    }

    const now = clock.nowIso();
    sendOk(
      res,
      {
        status: db === 'up' ? 'ok' : 'degraded',
        service: 'beta-api',
        version,
        time: now,
        timeVn: formatVn(now, { withSeconds: true }),
        uptimeSec: Math.round(process.uptime()),
        db,
      },
      {},
      db === 'up' ? 200 : 503
    );
  })
);

module.exports = router;
