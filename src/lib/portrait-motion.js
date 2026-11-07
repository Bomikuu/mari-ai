// The first twelve drawings are a registered, front-facing breathing cycle.
// Lean drawings are separate gestures, with a long frontal rest between them.
const breathe = Array.from({ length: 12 }, (_, frame) => ({ frame, hold: 240, phase: 'breathing' }));

function rest(cycles) {
  return Array.from({ length: cycles }, () => breathe).flat();
}

function lean(start, direction) {
  const frames = [0, 1, 2, 3, 4, 5, 4, 3, 2, 1, 0];
  return [
    ...frames.map((offset, index) => ({
      frame: start + offset,
      hold: index === 5 ? 1800 : 180,
      phase: `lean-${direction}`,
    })),
    { frame: 0, hold: 240, phase: 'breathing' },
  ];
}

export const portraitSequence = [
  ...rest(9), // 25.92 seconds facing front before the first lean.
  ...lean(12, 'left'),
  ...rest(10), // 29.04 seconds facing front before the other gesture.
  ...lean(18, 'right'),
];
