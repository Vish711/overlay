# Overlay

A browser version of the ChatGPT pet idea. Each person has one animated pet overlaid on the whole window. A message box sits under your pet. What you type shows in a Ready bubble on your pet and on your friend's page.

There is nothing to install. The page is the app.

## Run

The source is TypeScript. `npm start` turns it into JavaScript in `dist/`, then starts the server. The browser runs that JavaScript.

```bash
npm install
npm start
```

Open [http://localhost:55555](http://localhost:55555).

1. Type your name and a room id (or leave the room blank and the server will make one).
2. Press **Join room**.
3. Click an animal. Your pet appears over the window. Drag it anywhere on the screen.
4. Press **Cover the screen** if you want that window to fill the monitor.
5. Type in the box under the pet and press Enter. The bubble says Ready and shows the line.
6. Your friend opens the same address, joins the same room id, and sees your pet. They have their own pet too.

On another computer, use this machine's address instead of `localhost`. The page prints it after you join, and the server prints it in the terminal. Put that host in the server box and press **Use this server**.

The pet layer is clear and covers the window. Clicks land on a pet only when the pointer is on that pet. The room controls stay usable everywhere else.

The browser stores one save (`overlay-state`) for your name, room, animal, and the spot you dropped the pet. Refreshing the room page joins that room again. `/overlay` reads the same save, so the pet starts in the same place. Dragging on either page updates the other open page.

`/overlay` is the same pet layer in its own window, for a second monitor. Cover the screen there too if you want it to fill that monitor. A browser page cannot float above other programs. Cover the screen is how this page fills the monitor.

## How a pet gets from the button to the page

The pet button sends a WebSocket message: `{ type: 'pet', shape, text, ... }`.

The server checks that you are in a room and that the shape is one of the six animals. It saves one pet per person, under that person's id, and broadcasts it to the room. Picking a different animal replaces the pet instead of adding a second one. A line of text is saved on that same pet and also copied into the activity list.

The page is a member of the room, so the message comes back. The stage either creates the sprite or, if that id is already walking, keeps its position and replaces the words. A chat line is sent in the same step.

The box under your pet has a choice: Everyone, or one name. Everyone hears a line sent to Everyone. A line sent to one person goes to you and that person. The full-page window on your computer also hears lines you send or receive. The saved pet keeps the last line that went to the whole room, so a private line is not shown to the next person who joins.

The full-page window joins as `role: 'overlay'`. It is in the room, so it receives the same pet messages, but it is left out of the online list. The server matches it to you by IP address: the tab you joined from and the `/overlay` tab on that computer look like the same place.

## Why it behaves like a ChatGPT pet

ChatGPT's pet is one companion that floats where you leave it. A quick-chat box sits under it. A new line shows as Ready. This page copies that shape: one pet each, a box under yours, and a Ready bubble for the line. It does not run ChatGPT, and it does not use their art. The pets here are our pixel animals, and the line is a message to the room rather than a task status.

## The walk

Each pet has a heading (an angle) and a velocity. Every frame:

1. **Behavior.** Cat sometimes sits. Dog sometimes dashes. Heart walks toward another pet anywhere on the stage. Fire turns fast, so it zigzags. Ghost and star turn slowly, so they drift. Dragging sets a new spot, and the pet keeps walking around that spot. If it gets too far, it walks back. A new message makes it bounce in place, then it walks again. A line can also give an order. The first word we know wins: sit, come, run, or dance. That order lasts a few seconds, then the pet chooses on its own again. Sent to one person, only that pet follows it. Sent to everyone, every pet follows it.
2. **Steering.** The heading turns a little toward the desired direction. It does not snap. If another pet is inside the comfort radius, this pet turns away. That check uses the spatial hash, because only nearby pets matter.
3. **Walls.** The next position is `velocity * seconds since last frame`. Hitting the edge of the stage reverses that part of the velocity.
4. **Collision.** Pets are circles. Overlapping circles are pushed apart. If they were moving toward each other, they exchange the part of their velocity that lies on the line between their centers (equal weight, so a head-on hit swaps those speeds). The push runs three times, because one push can shove a pet into a third pet.

The bounce when a pet talks, and the ghost's float, are only drawn. They do not change the position the collision code uses.

## The spatial hash

The stage is split into 80px squares. Each pet is stored in the square that holds its center. A pet is 52px across, which is less than one square, so it can touch only pets in its own square or a neighboring one. Each pet looks at those 9 squares instead of every pet on the stage. Seeking a friend is the exception: that looks at the whole list, because "walk toward them" is allowed to be long range, and there are only a few pets.

## The files

Each file does one job.

- `src/shared/actions.ts` reads a line and picks sit, come, run, dance, or just say.
- `src/shared/types.ts` lists the fields on a pet and on a message.
- `src/shared/save.ts` reads and writes the spot, name, room, and animal in the browser.
- `src/shared/spatial.ts` puts pets into 80px squares so a bump only checks neighbors.
- `src/shared/movement.ts` picks a behavior, turns a little, walks, and bumps.
- `src/shared/session.ts` adds or updates a pet when a message arrives, and keeps its place.
- `src/shared/sprites.ts` draws the six pixel animals.
- `src/renderer/stage.ts` draws the pets and handles drag, click, and right-click.
- `src/renderer/client.ts` is the room page.
- `src/renderer/overlay.ts` is the full-page window.
- `src/main/server.ts` is the room server.

## Tests

```bash
npm test
```

The tests cover the grid, the bounce, the heart walking toward another pet, and two browsers in one room (a pet sent by one socket arrives on the other).
