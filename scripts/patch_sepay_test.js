const fs = require('fs');
const path = require('path');

const testPath = path.join(__dirname, '..', 'api', 'tests', 'sepay.test.js');
let s = fs.readFileSync(testPath, 'utf-8');

s = s.replace(
  "await knex('webhook_events').whereIn('gateway_txn_id', testOrders).del();",
  "await knex('webhook_events').whereIn('gateway_txn_id', [...testOrders, 'NON_EXISTENT_ORDER']).orWhere('event_id', 'like', '%NON_EXISTENT_ORDER%').del();"
);

s = s.replace(
  ".where({ order_id: orderSepaySuccess, seat_id: 1000 })",
  ".where({ order_id: orderSepaySuccess, seat_id: 1050 })"
);

fs.writeFileSync(testPath, s, 'utf-8');
console.log('Successfully patched sepay.test.js');
