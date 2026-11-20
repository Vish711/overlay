// The shapes of the objects we pass around.
// An interface is just a list of fields. It does not run any code.

// A point on the screen, in pixels.
export interface Spot {
  x: number;
  y: number;
}

// What the server knows about a pet. It does not know the screen position.
// Every computer chooses its own x and y.
export interface PetNote {
  id: string;
  name: string;
  shape: string;
  color: string;
  userId: string;
  userName: string;
  text: string;
  toName?: string;
  roomId?: string;
  status?: string;
}

// A rectangle. Used for the speech bubble and for "did the click hit this?"
export interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}

// A pet that is walking on this computer.
// x and y are the top-left corner of the 64 by 64 picture.
export interface Pet extends PetNote {
  x: number;
  y: number;
  homeX: number | null;
  homeY: number | null;
  vx: number;
  vy: number;
  heading: number;
  wanderTarget: number;
  state: string;
  stateUntil: number;
  facing: number;
  phase: number;
  width: number;
  height: number;
  radius: number;
  dragging: boolean;
  speechUntil: number;
  talkUntil: number;
  focusId: string;
  danceUntil: number;
  drawX: number;
  drawY: number;
  bubble: Box | null;
  dragOffsetX: number;
  dragOffsetY: number;
}

// One message on the WebSocket. Most fields are optional
// because each message type only uses a few of them.
export interface RoomMessage {
  type: string;
  id?: string;
  roomId?: string | null;
  name?: string;
  text?: string;
  shape?: string;
  color?: string;
  userId?: string;
  userName?: string;
  all?: boolean;
  role?: string;
  pets?: PetNote[];
  users?: Array<{ id: string; name: string }>;
  user?: { id: string; name: string };
  pet?: { name: string; shape: string; color: string };
  to?: string;
  toName?: string;
  action?: string;
}

// Anything that has a box on the screen. The grid code only needs these fields.
export interface Placed {
  x: number;
  y: number;
  width: number;
  height: number;
}
