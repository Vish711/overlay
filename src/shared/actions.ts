// What a line tells a pet to do.
//
// Read the line one word at a time. The first word we know wins.
//
//   sit, stay, stop   the pet sits still
//   come, here        the pet walks toward the person who sent the line
//   run, dash         the pet runs one way
//   dance, spin       the pet hops in place
//   anything else     the pet just says the line

export const SIT_MS = 5000;
export const COME_MS = 5000;
export const RUN_MS = 2000;
export const DANCE_MS = 2200;

export function actionFromText(text: string): string {
  const words = String(text || '').toLowerCase().split(/[^a-z]+/);
  for (let i = 0; i < words.length; i++) {
    const word = words[i];
    if (word === 'sit' || word === 'stay' || word === 'stop') return 'sit';
    if (word === 'come' || word === 'here') return 'come';
    if (word === 'run' || word === 'dash') return 'run';
    if (word === 'dance' || word === 'spin') return 'dance';
  }
  return 'say';
}
