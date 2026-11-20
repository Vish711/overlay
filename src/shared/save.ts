// What this browser remembers between visits.
//
// The room page and the full-screen page (/overlay) both read and write
// this same save. That is why your pet shows up in the same place in both.

import type { Spot } from './types.js';

const KEY = 'overlay-state';
const OLD_HOME_KEY = 'overlay-home';

export interface SavedState {
  userId: string;
  name: string;
  roomId: string;
  shape: string;
  home: Spot | null;
}

function emptyState(): SavedState {
  return {
    userId: '',
    name: '',
    roomId: '',
    shape: 'cat',
    home: null
  };
}

function isSpot(value: unknown): value is Spot {
  if (!value || typeof value !== 'object') return false;
  const spot = value as Spot;
  return isFinite(spot.x) && isFinite(spot.y);
}

// Read the save. Returns null if nothing has been stored yet.
export function loadState(): SavedState | null {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) {
      const data = JSON.parse(raw) as Partial<SavedState>;
      const state = emptyState();
      if (typeof data.userId === 'string') state.userId = data.userId;
      if (typeof data.name === 'string') state.name = data.name;
      if (typeof data.roomId === 'string') state.roomId = data.roomId;
      if (typeof data.shape === 'string') state.shape = data.shape;
      if (isSpot(data.home)) state.home = { x: data.home.x, y: data.home.y };
      return state;
    }

    // Older pages stored only the drop spot, under a different name.
    const oldRaw = localStorage.getItem(OLD_HOME_KEY);
    if (!oldRaw) return null;
    const oldHome = JSON.parse(oldRaw);
    if (!isSpot(oldHome)) return null;
    return {
      userId: '',
      name: '',
      roomId: '',
      shape: 'cat',
      home: { x: oldHome.x, y: oldHome.y }
    };
  } catch (err) {
    return null;
  }
}

// Write the whole save. The page still works if the browser refuses.
export function saveState(state: SavedState): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(state));
  } catch (err) {
    // Ignore. A private window may block storage.
  }
}

// Change a few fields and keep the rest. Returns the save after the change.
export function updateState(patch: Partial<SavedState>): SavedState {
  const current = loadState() || emptyState();
  if (patch.userId !== undefined) current.userId = patch.userId;
  if (patch.name !== undefined) current.name = patch.name;
  if (patch.roomId !== undefined) current.roomId = patch.roomId;
  if (patch.shape !== undefined) current.shape = patch.shape;
  if (patch.home !== undefined) current.home = patch.home;
  saveState(current);
  return current;
}

// The other page (the room page, or /overlay) writes the save.
// This tab hears about it and can move the pet to match.
export function watchSave(onChange: (state: SavedState) => void): void {
  window.addEventListener('storage', function (event) {
    if (event.key !== KEY) return;
    const state = loadState();
    if (state) onChange(state);
  });
}
