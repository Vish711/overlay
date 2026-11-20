import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildHash, queryNearby, CELL } from '../src/shared/spatial.js';

interface Sample {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
}

function pet(id: string, x: number, y: number): Sample {
  return { id: id, x: x, y: y, width: 64, height: 64 };
}

test('nearby pets share a cell neighborhood and far pets do not', function () {
  const here = pet('here', 10, 10);
  const beside = pet('beside', 50, 10);
  const far = pet('far', 400, 400);
  const hash = buildHash([here, beside, far], CELL);
  const ids = queryNearby(hash, here).map(function (item) { return item.id; });
  assert.ok(ids.indexOf('beside') !== -1);
  assert.ok(ids.indexOf('far') === -1);
  assert.ok(ids.indexOf('here') === -1);
});
