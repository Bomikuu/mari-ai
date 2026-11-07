import test from 'node:test';
import assert from 'node:assert/strict';
import { portraitSequence } from '../src/lib/portrait-motion.js';

test('Mari rests facing forward for many seconds between isolated lean gestures', () => {
  let frontMs = 0;
  let lastPhase = 'breathing';
  const gestures = [];
  for (const step of [...portraitSequence, ...portraitSequence]) {
    assert.ok(step.frame >= 0 && step.frame < 24);
    assert.ok(step.hold > 0);
    if (step.phase === 'breathing') {
      assert.ok(step.frame < 12, 'front breathing must never select a lean drawing');
      frontMs += step.hold;
    } else if (lastPhase === 'breathing') {
      assert.ok(frontMs >= 25000, 'each lean must follow at least 25 seconds facing front');
      gestures.push(step.phase);
      frontMs = 0;
    } else {
      assert.equal(step.phase, lastPhase, 'never sway directly from one side to the other');
    }
    lastPhase = step.phase;
  }
  assert.deepEqual(gestures, ['lean-left', 'lean-right', 'lean-left', 'lean-right']);
});

test('each occasional lean holds briefly, retraces to front, and resumes breathing', () => {
  for (const phase of ['lean-left', 'lean-right']) {
    const start = portraitSequence.findIndex((step) => step.phase === phase);
    const end = portraitSequence.findIndex((step, index) => index > start && step.phase === 'breathing');
    const gesture = portraitSequence.slice(start, end);
    const frames = gesture.map((step) => step.frame);
    assert.deepEqual(frames, frames.toReversed(), 'return through the same small lean drawings');
    assert.equal(gesture.filter((step) => step.hold > 1000).length, 1);
    assert.ok(gesture.reduce((sum, step) => sum + step.hold, 0) <= 4000);
    assert.equal(portraitSequence[end].frame, 0);
  }
});
