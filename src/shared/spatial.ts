// A grid so we do not compare every pet with every other pet.
//
// The screen is split into 80 pixel squares. Each pet is stored in the
// square that holds its center.
//
// A pet's bump circle is 52 pixels across. That is smaller than one square,
// so a pet can only touch pets in its own square or a square next to it.
// Each pet looks at those 9 squares, not the whole list.

import type { Placed } from './types.js';

export const CELL = 80;

export interface Grid<T> {
  cells: { [key: string]: T[] };
  cellSize: number;
}

// "3,1" means column 3, row 1.
export function cellKey(x: number, y: number, cellSize: number): string {
  const column = Math.floor(x / cellSize);
  const row = Math.floor(y / cellSize);
  return column + ',' + row;
}

// Build a fresh grid from where the pets are right now.
// Rebuilding is easier to explain than moving one pet from square to square,
// and we only have a few pets.
export function buildHash<T extends Placed>(pets: T[], cellSize?: number): Grid<T> {
  const size = cellSize || CELL;
  const cells: { [key: string]: T[] } = {};
  for (let i = 0; i < pets.length; i++) {
    const pet = pets[i];
    const key = cellKey(pet.x + pet.width / 2, pet.y + pet.height / 2, size);
    if (!cells[key]) cells[key] = [];
    cells[key].push(pet);
  }
  return { cells: cells, cellSize: size };
}

// The pets in this square and the 8 squares around it. Skips the pet itself.
export function queryNearby<T extends Placed>(hash: Grid<T>, pet: T): T[] {
  const column = Math.floor((pet.x + pet.width / 2) / hash.cellSize);
  const row = Math.floor((pet.y + pet.height / 2) / hash.cellSize);
  const nearby: T[] = [];
  for (let dx = -1; dx <= 1; dx++) {
    for (let dy = -1; dy <= 1; dy++) {
      const bucket = hash.cells[(column + dx) + ',' + (row + dy)];
      if (!bucket) continue;
      for (let i = 0; i < bucket.length; i++) {
        if (bucket[i] !== pet) nearby.push(bucket[i]);
      }
    }
  }
  return nearby;
}
