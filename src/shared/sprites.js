// Pixel pets.
//
// Every animal is a 16 by 16 picture made of characters. The overlay and
// the gallery both draw the same pictures, scaled up by 4 so each character
// becomes a 4x4 block (64x64 on screen).
//
//   #  the pet's own color
//   e  eye
//   w  white highlight
//   y  yellow (the inside of the fire)
//   o  a small accent (nose, inner ear)
//   .  empty
//
// Frame 0 and frame 1 are the two steps of the walk, or a blink / sparkle
// for the star and the heart. Facing left is the same picture mirrored.
// The wrapper at the bottom lets this file run in the page and in the tests.

(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) {
    module.exports = api;
  }
  root.PetSprites = api;
})(globalThis, function () {
  const SCALE = 4;
  const SIZE = 16;

  const PETS = [
    { name: 'Cat', shape: 'cat', color: '#ff6b6b' },
    { name: 'Dog', shape: 'dog', color: '#4ecdc4' },
    { name: 'Ghost', shape: 'ghost', color: '#ffe66d' },
    { name: 'Fire', shape: 'fire', color: '#ff8a5c' },
    { name: 'Star', shape: 'star', color: '#a29bfe' },
    { name: 'Heart', shape: 'heart', color: '#fd79a8' }
  ];

  const ART = {
    cat: [
      [
        '................',
        '...##......##...',
        '..#oo#....#oo#..',
        '..#..######..#..',
        '...##########...',
        '...###e##e###...',
        '...##########...',
        '...####oo####...',
        '....########....',
        '....###..###....',
        '...##......##...',
        '................',
        '................',
        '................',
        '................',
        '................'
      ],
      [
        '................',
        '...##......##...',
        '..#oo#....#oo#..',
        '..#..######..#..',
        '...##########...',
        '...###e##e###...',
        '...##########...',
        '...####oo####...',
        '....########....',
        '.....######.....',
        '....##....##....',
        '................',
        '................',
        '................',
        '................',
        '................'
      ]
    ],
    dog: [
      [
        '................',
        '..###......###..',
        '..#o#......#o#..',
        '..##############',
        '...###e####e###.',
        '...##########o#.',
        '....###########.',
        '....###....###..',
        '...##......##...',
        '....##....##....',
        '................',
        '................',
        '................',
        '................',
        '................',
        '................'
      ],
      [
        '................',
        '..###......###..',
        '..#o#......#o#..',
        '..##############',
        '...###e####e###.',
        '...##########o#.',
        '....###########.',
        '.....######.....',
        '....##....##....',
        '...##......##...',
        '................',
        '................',
        '................',
        '................',
        '................',
        '................'
      ]
    ],
    ghost: [
      [
        '................',
        '.....######.....',
        '...##########...',
        '..############..',
        '..###e####e###..',
        '..############..',
        '..###ww##ww###..',
        '..############..',
        '..############..',
        '..##..##..##..##',
        '..#..##..##..#..',
        '................',
        '................',
        '................',
        '................',
        '................'
      ],
      [
        '................',
        '.....######.....',
        '...##########...',
        '..############..',
        '..###e####e###..',
        '..############..',
        '..###ww##ww###..',
        '..############..',
        '..##..##..##..##',
        '..#..##..##..#..',
        '...##..##..##...',
        '................',
        '................',
        '................',
        '................',
        '................'
      ]
    ],
    fire: [
      [
        '................',
        '................',
        '.......##.......',
        '......#yy#......',
        '.....#yyyy#.....',
        '....#yy##yy#....',
        '...#yyy##yyy#...',
        '...##yyyyyy##...',
        '....#yyyyyy#....',
        '.....##yyy##....',
        '.......#y#......',
        '.......##.......',
        '................',
        '................',
        '................',
        '................'
      ],
      [
        '................',
        '......#yy#......',
        '.....#yyyy#.....',
        '....#yy##yy#....',
        '...#yyy##yyy#...',
        '...##yyyyyy##...',
        '....#yyyyyy#....',
        '.....##yyy##....',
        '.......#y#......',
        '.......##.......',
        '......#yy#......',
        '................',
        '................',
        '................',
        '................',
        '................'
      ]
    ],
    star: [
      [
        '................',
        '.......##.......',
        '......####......',
        '.....######.....',
        '..############..',
        '.##############.',
        '..############..',
        '.....######.....',
        '......####......',
        '.......##.......',
        '....##....##....',
        '...##......##...',
        '................',
        '................',
        '................',
        '................'
      ],
      [
        '................',
        '.......##.......',
        '......####......',
        '.....######.....',
        '..############..',
        '.######ww######.',
        '..############..',
        '.....######.....',
        '......####......',
        '.......##.......',
        '....##....##....',
        '...##......##...',
        '................',
        '................',
        '................',
        '................'
      ]
    ],
    heart: [
      [
        '................',
        '................',
        '...###....###...',
        '..#####..#####..',
        '.##############.',
        '.##############.',
        '..############..',
        '...##########...',
        '....########....',
        '.....######.....',
        '......####......',
        '.......##.......',
        '................',
        '................',
        '................',
        '................'
      ],
      [
        '................',
        '................',
        '...###....###...',
        '..#####..#####..',
        '.######ww######.',
        '.##############.',
        '..############..',
        '...##########...',
        '....########....',
        '.....######.....',
        '......####......',
        '.......##.......',
        '................',
        '................',
        '................',
        '................'
      ]
    ]
  };

  function checkArt() {
    const problems = [];
    const shapes = Object.keys(ART);
    for (let s = 0; s < shapes.length; s++) {
      const shape = shapes[s];
      const frames = ART[shape];
      for (let f = 0; f < frames.length; f++) {
        if (frames[f].length !== SIZE) {
          problems.push(shape + ' frame ' + f + ' has ' + frames[f].length + ' rows');
        }
        for (let y = 0; y < frames[f].length; y++) {
          if (frames[f][y].length !== SIZE) {
            problems.push(shape + ' frame ' + f + ' row ' + y + ' is ' + frames[f][y].length);
          }
        }
      }
    }
    return problems;
  }

  function paintOf(ch, color) {
    if (ch === '#') return color;
    if (ch === 'e') return '#1b1b1b';
    if (ch === 'w') return '#ffffff';
    if (ch === 'y') return '#ffe566';
    if (ch === 'o') return '#ffd1c4';
    return '';
  }

  function frameCount(shape) {
    const frames = ART[shape] || ART.cat;
    return frames.length;
  }

  // Move to the pet's center, flip if it faces left, then draw each
  // colored character as a 4x4 block.
  function drawPet(ctx, shape, frame, color, x, y, facing) {
    const frames = ART[shape] || ART.cat;
    const rows = frames[Math.abs(frame) % frames.length];
    ctx.save();
    ctx.translate(Math.round(x + (SIZE * SCALE) / 2), Math.round(y + (SIZE * SCALE) / 2));
    if (facing < 0) ctx.scale(-1, 1);
    ctx.translate(-(SIZE * SCALE) / 2, -(SIZE * SCALE) / 2);
    for (let row = 0; row < rows.length; row++) {
      const line = rows[row];
      for (let col = 0; col < line.length; col++) {
        const paint = paintOf(line.charAt(col), color);
        if (!paint) continue;
        ctx.fillStyle = paint;
        ctx.fillRect(col * SCALE, row * SCALE, SCALE, SCALE);
      }
    }
    ctx.restore();
  }

  return {
    PETS: PETS,
    SCALE: SCALE,
    checkArt: checkArt,
    frameCount: frameCount,
    drawPet: drawPet
  };
});
