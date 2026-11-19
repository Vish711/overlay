const { test } = require('node:test');
const assert = require('node:assert/strict');
const { buildHash, queryNearby, CELL } = require('../src/shared/spatial');

function pet(id, x, y) {
  return { id: id, x: x, y: y, width: 64, height: 64 };
}

test('nearby pets share a cell neighborhood and far pets do not', function () {
  const here = pet('here', 10, 10);
  const beside = pet('beside', 50, 10);
  const far = pet('far', 400, 400);
  const hash = buildHash([here, beside, far], CELL);
  const ids = queryNearby(hash, here).map(function (p) { return p.id; });
  assert.ok(ids.indexOf('beside') !== -1);
  assert.ok(ids.indexOf('far') === -1);
  assert.ok(ids.indexOf('here') === -1);
});
