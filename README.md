# Overlay

A browser version of the ChatGPT pet idea. Each person has one animated pet floating on the page. A message box sits under your pet. What you type shows in a Ready bubble on your pet and on your friend's page.

There is nothing to install. The page is the app.

## Run

```bash
npm install
npm start
```

Open [http://localhost:55555](http://localhost:55555).

1. Type your name and a room id (or leave the room blank and the server will make one).
2. Press **Join room**.
3. Click an animal. Your pet appears on the page. Drag it where you want it.
4. Type in the box under the pet and press Enter. The bubble says Ready and shows the line.
5. Your friend opens the same address, joins the same room id, and sees your pet. They have their own pet too.

On another computer, use this machine's address instead of `localhost`. The page prints it after you join, and the server prints it in the terminal. Put that host in the server box and press **Use this server**.

`/overlay` is the same stage in a full browser window, if you want it on a second monitor. The room page already shows the pets, so you do not need that window.

## How a pet gets from the button to the page

The pet button sends a WebSocket message: `{ type: 'pet', shape, text, ... }`.

The server checks that you are in a room and that the shape is one of the six animals. It saves one pet per person, under that person's id, and broadcasts it to the room. Picking a different animal replaces the pet instead of adding a second one. A line of text is saved on that same pet and also copied into the activity list.

The page is a member of the room, so the message comes back. The stage either creates the sprite or, if that id is already walking, keeps its position and replaces the words. A chat line is broadcast in the same step.

The full-page window joins as `role: 'overlay'`. It is in the room, so it receives the same pet messages, but it is left out of the online list. The server matches it to you by IP address: the tab you joined from and the `/overlay` tab on that computer look like the same place.

## Why it behaves like a ChatGPT pet

ChatGPT's pet is one companion that floats where you leave it. A quick-chat box sits under it. A new line shows as Ready. This page copies that shape: one pet each, a box under yours, and a Ready bubble for the line. It does not run ChatGPT, and it does not use their art. The pets here are our pixel animals, and the line is a message to the room rather than a task status.

## The walk

Each pet has a heading (an angle) and a velocity. Every frame:

1. **Behavior.** Cat sometimes sits. Dog sometimes dashes. Heart walks toward another pet anywhere on the stage. Fire turns fast, so it zigzags. Ghost and star turn slowly, so they drift. A pet that just spoke stands still briefly so the bubble is readable.
2. **Steering.** The heading turns a little toward the desired direction. It does not snap. If another pet is inside the comfort radius, this pet turns away. That check uses the spatial hash, because only nearby pets matter.
3. **Walls.** The next position is `velocity * seconds since last frame`. Hitting the edge of the stage reverses that part of the velocity.
4. **Collision.** Pets are circles. Overlapping circles are pushed apart. If they were moving toward each other, they exchange the part of their velocity that lies on the line between their centers (equal weight, so a head-on hit swaps those speeds). The push runs three times, because one push can shove a pet into a third pet.

The hop when a pet talks, and the ghost's float, are only drawn. They do not change the position the collision code uses.

## The spatial hash

The stage is split into 80px squares. Each pet is stored in the square that holds its center. A pet is 52px across, which is less than one square, so it can touch only pets in its own square or a neighboring one. Each pet looks at those 9 squares instead of every pet on the stage. Seeking a friend is the exception: that looks at the whole list, because "walk toward them" is allowed to be long range, and there are only a few pets.

## Tests

```bash
npm test
```

The tests cover the grid, the bounce, the heart walking toward another pet, and two browsers in one room (a pet sent by one socket arrives on the other).
