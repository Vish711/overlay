// Spatial hash.
//
// Checking every pet against every other pet is fine for two pets and
// wasteful once a room gets busy. We chop the screen into squares (cells).
// A pet is stored in the cell that contains its center.
//
// Two pets can touch only if their cells are the same or next to each other,
// because a cell is 80px and a pet's collision circle is only 52px across
// (radius 26 + radius 26). A pet two cells away is at least 80px from this
// one, so it cannot be touching. Each pet therefore looks at 9 cells, not
// the whole list.
//
// This file is loaded two ways. A script tag in the page sets Spatial
// on the page. require() in the tests gets the same functions back.
// globalThis is the page in the browser and the global object in Node.

(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) {
    module.exports = api;
  }
  root.Spatial = api;
})(globalThis, function () {
  const CELL = 80;

  function cellKey(x, y, cellSize) {
    const cx = Math.floor(x / cellSize);
    const cy = Math.floor(y / cellSize);
    return cx + ',' + cy;
  }

  // Rebuild the whole grid from the current pet positions.
  // Rebuilding is easier to explain than updating one pet at a time,
  // and it is cheap: we only have a handful of pets on screen.
  function buildHash(pets, cellSize) {
    const size = cellSize || CELL;
    const cells = {};
    for (let i = 0; i < pets.length; i++) {
      const pet = pets[i];
      const key = cellKey(pet.x + pet.width / 2, pet.y + pet.height / 2, size);
      if (!cells[key]) cells[key] = [];
      cells[key].push(pet);
    }
    return { cells: cells, cellSize: size };
  }

  function queryNearby(hash, pet) {
    const cx = Math.floor((pet.x + pet.width / 2) / hash.cellSize);
    const cy = Math.floor((pet.y + pet.height / 2) / hash.cellSize);
    const nearby = [];
    for (let dx = -1; dx <= 1; dx++) {
      for (let dy = -1; dy <= 1; dy++) {
        const bucket = hash.cells[(cx + dx) + ',' + (cy + dy)];
        if (!bucket) continue;
        for (let i = 0; i < bucket.length; i++) {
          if (bucket[i] !== pet) nearby.push(bucket[i]);
        }
      }
    }
    return nearby;
  }

  return {
    CELL: CELL,
    cellKey: cellKey,
    buildHash: buildHash,
    queryNearby: queryNearby
  };
});
