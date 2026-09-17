'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const m = require('./mechanics.js');

let checks = 0;
let largestForceResidual = 0;
let largestMomentResidual = 0;
function test(name, run) {
  try { run(); checks++; }
  catch (error) { error.message = name + ': ' + error.message; throw error; }
}
function close(actual, expected, tolerance = 1e-8) {
  assert.ok(Number.isFinite(actual), 'non-finite result');
  assert.ok(Math.abs(actual - expected) <= tolerance,
    actual + ' differs from ' + expected + ' by ' + Math.abs(actual - expected));
}

// Independent thin-strip integration, split at the flange boundary.
function integrateCompression(state) {
  const cuts = state.mode === 'tee' && state.x > state.hf
    ? [0, state.hf, state.x] : [0, state.x];
  let force = 0;
  let moment = 0;
  let firstMoment = 0;
  for (let section = 1; section < cuts.length; section++) {
    const dy = (cuts[section] - cuts[section - 1]) / 200;
    for (let i = 0; i < 200; i++) {
      const y = cuts[section - 1] + (i + 0.5) * dy;
      const width = state.mode === 'tee' && y < state.hf ? state.bf : state.b;
      const dF = state.fc * width * dy;
      force += dF;
      firstMoment += dF * y;
      moment += dF * (state.h0 - y) / 1e6;
    }
  }
  return { force, moment, yC: force ? firstMoment / force : 0 };
}

test('default geometry and minimum reinforcement', () => {
  assert.equal(m.defaults.h0, 460);
  close(m.limits.rhoMin, 0.002);
  close(m.limits.Amin, 230);
  close(m.limits.xb, 243.8);
  close(m.limits.apMax, 121.9);
});

test('rectangular reference boundary', () => {
  close(m.limits.rect.As, 2548.818181818182);
  close(m.limits.rect.M, 284.379291);
  const s = m.rect(m.limits.rect.As);
  assert.equal(s.atLimit, true);
  assert.equal(s.strictlyInsideSingleLimit, false);
});

test('known T-section transition and boundary', () => {
  close(m.limits.tee.transitionAs, 2718.181818181818);
  close(m.limits.tee.transitionM, 367.77);
  close(m.limits.tee.As, 4221.545454545455);
  close(m.limits.tee.M, 510.699291);
  assert.equal(m.tee(m.limits.tee.transitionAs).regime, 'flange');
  assert.equal(m.tee(m.limits.tee.transitionAs + 1).regime, 'web');
});

test('original 115 kN m lesson', () => {
  const d = m.designRect(115);
  close(d.x, 79.29889239282042);
  close(d.AsNeeded, 829.0338750158498);
  close(m.rect(d.AsNeeded).M, 115);
});

test('400 kN m distinguishes all three routes', () => {
  assert.equal(m.designRect(400).ok, false);
  const t = m.designT(400);
  assert.equal(t.ok, true);
  close(t.AsNeeded, 3000.031648217258);
  close(t.x, 126.95954895991163);
  close(t.yC, 55.96385830079346);
  const d = m.designDouble(400, 40);
  assert.equal(d.ok, true);
  close(d.extraAsNeeded, 834.2042496392498);
  close(d.AsNeeded, 3383.0224314574316);
  close(d.AsTop, d.AsExtra);
  assert.notEqual(d.As, d.AsTop);
});

test('numerical integration checks force, centroid and moment', () => {
  for (const fn of [m.rect, m.tee]) {
    const upper = fn === m.rect ? m.limits.rect.As : m.limits.tee.As;
    for (let i = 0; i <= 40; i++) {
      const s = fn(m.limits.Amin + (upper - m.limits.Amin) * i / 40);
      const independent = integrateCompression(s);
      largestForceResidual = Math.max(largestForceResidual, Math.abs(independent.force - s.T));
      largestMomentResidual = Math.max(largestMomentResidual, Math.abs(independent.moment - s.M));
      close(independent.force, s.T, 1e-6);
      close(independent.yC, s.yC, 1e-8);
      close(independent.moment, s.M, 1e-8);
      close(s.C, s.T, 1e-8);
    }
  }
});

test('M-As tangent continuous at flange/web transition', () => {
  const a = m.limits.tee.transitionAs;
  const step = 0.01;
  const leftSlope = (m.tee(a).M - m.tee(a - step).M) / step;
  const rightSlope = (m.tee(a + step).M - m.tee(a).M) / step;
  close(leftSlope, 0.1188, 2e-7);
  close(rightSlope, 0.1188, 2e-7);
  close(leftSlope, rightSlope, 3e-7);
});

test('curvature becomes 2.6 times more negative in the web', () => {
  const a = m.limits.tee.transitionAs;
  const step = 10;
  function curvature(center) {
    return (m.tee(center + step).M - 2 * m.tee(center).M + m.tee(center - step).M) / (step * step);
  }
  close(curvature(a - 100), m.limits.tee.curvatureFlange, 1e-11);
  close(curvature(a + 100), m.limits.tee.curvatureWeb, 1e-11);
  close(curvature(a + 100) / curvature(a - 100), 2.6, 1e-7);
});

test('section force derivative is not the secant lever arm', () => {
  const a = 1800, step = 0.1;
  for (const fn of [m.rect, m.tee]) {
    const s = fn(a);
    const derivative = (fn(a + step).M - fn(a - step).M) / (2 * step);
    close(derivative, s.fy * (s.h0 - s.x) / 1e6, 1e-9);
  }
});

test('As beyond limit is visibly rejected and only capped reference displayed', () => {
  for (const kind of ['rect', 'tee']) {
    const bound = m.limits[kind];
    const s = m[kind](2 * bound.As);
    assert.equal(s.over, true);
    assert.equal(s.valid, false);
    close(s.As, 2 * bound.As);
    close(s.AsActive, bound.As);
    close(s.AsIgnored, bound.As);
    close(s.x, m.limits.xb);
    close(s.M, bound.M);
    assert.ok(s.warnings.some(text => text.includes('不模拟超筋梁真实破坏')));
  }
});

test('low reinforcement is not accepted as a capacity prediction', () => {
  assert.equal(m.rect(0).valid, false);
  assert.equal(m.tee(100).belowMinimum, true);
  for (const fn of [m.designRect, m.designT]) {
    const s = fn(1);
    assert.equal(s.adoptedMinimum, true);
    close(s.AsNeeded, m.limits.Amin);
    assert.ok(s.M >= 1);
  }
});

test('upper-limit inverse demands are explicitly rejected', () => {
  for (const [fn, limit] of [[m.designRect, m.limits.rect.M], [m.designT, m.limits.tee.M]]) {
    const failure = fn(limit + 1);
    assert.equal(failure.ok, false);
    assert.equal(failure.AsNeeded, null);
    assert.equal(failure.demandOver, true);
    const boundary = fn(limit);
    assert.equal(boundary.ok, true);
    assert.equal(boundary.atLimit, true);
    assert.equal(boundary.teachingBoundary, true);
  }
});

test('forward/inverse consistency including flange transition', () => {
  for (const [forward, inverse, bound] of [[m.rect, m.designRect, m.limits.rect], [m.tee, m.designT, m.limits.tee]]) {
    for (let i = 0; i <= 50; i++) {
      const area = m.limits.Amin + (bound.As - m.limits.Amin) * i / 50;
      const moment = forward(area).M;
      const d = inverse(moment);
      assert.equal(d.ok, true);
      close(d.AsNeeded, area, 1e-7);
      close(d.M, moment, 1e-8);
    }
  }
});

test('double reinforcement equilibrium and lever-arm sensitivity', () => {
  for (const ap of [40, 70, 100]) {
    for (const extra of [0, 300, 1000, 4000]) {
      const d = m.doubly(extra, ap);
      assert.equal(d.valid, true);
      close(d.Cc + d.Cs, d.T, 1e-8);
      close(d.M, (d.Cc * (d.h0 - d.yC) + d.Cs * (d.h0 - ap)) / 1e6);
      close(d.M, d.C * (d.h0 - d.yCtotal) / 1e6);
      const inverse = m.designDouble(d.M, ap);
      close(inverse.extraAsNeeded, extra, 1e-7);
    }
  }
  close(m.doubly(1000, 40).M - m.doubly(1000, 100).M, 19.8);
});

test('compression-steel applicability cannot be silently bypassed', () => {
  assert.equal(m.doubly(1000, 130).valid, false);
  assert.equal(m.doubly(1000, 130).M, null);
  assert.equal(m.designDouble(400, 130).ok, false);
  assert.equal(m.designDouble(400, 130).AsNeeded, null);
  assert.equal(m.doubly(1000, m.limits.apMax).valid, true);
});

test('no double reinforcement demanded when single reinforcement is sufficient', () => {
  const s = m.designDouble(115);
  assert.equal(s.doubleRequired, false);
  assert.equal(s.reason, 'single-sufficient');
  close(s.extraAsNeeded, 0);
  close(s.recommendedSingle.AsNeeded, m.designRect(115).AsNeeded);
});

test('textbook example 3-5 initial design, before rounding/bar selection', () => {
  const book = m.create({ b: 300, h: 450, as: 65 });
  close(book.limits.rect.M, 239.05, 0.01);
  const d = book.designDouble(300, 40);
  close(d.extraAsNeeded, 535, 1);
  close(d.AsNeeded, 3095, 1);
  close(d.M, 300);
});

test('textbook example 3-3 is a different slab, not the default beam', () => {
  const slab = m.create({ fc: 11.5, fy: 250, ft: 1.23, Es: 210000,
    b: 1000, bf: 1000, h: 100, as: 30, hf: 20, xiB: 0.58, ap: 20 });
  const mg = 25 * 0.1 * 1 * 2.05 ** 2 / 8;
  const mq = 3.5 * 1 * 2.05 ** 2 / 8;
  const target = 1.2 * mg + 1.4 * mq;
  close(target, 4.15, 0.001);
  const d = slab.designRect(target);
  close(d.M, target);
  assert.ok(d.x > 5 && d.x < 6);
  assert.ok(d.AsNeeded > 240 && d.AsNeeded < 260);
});

test('T section degenerates to rectangle when bf = b', () => {
  const flat = m.create({ bf: 250 });
  for (const As of [230, 600, 1600, 2500]) {
    close(flat.tee(As).M, flat.rect(As).M);
    close(flat.tee(As).x, flat.rect(As).x);
    close(flat.tee(As).yC, flat.rect(As).yC);
  }
});

test('wide thick flange can remain first-class until its design limit', () => {
  const thick = m.create({ hf: 300 });
  assert.equal(thick.limits.tee.transitionWithinLimit, false);
  assert.equal(thick.tee(thick.limits.tee.As).regime, 'flange');
  const d = thick.designT(thick.limits.tee.M * 0.9);
  assert.equal(d.ok, true);
  assert.equal(d.regime, 'flange');
});

test('input validation and parameter consistency', () => {
  for (const invalid of [-1, NaN, Infinity, '100']) {
    assert.throws(() => m.rect(invalid), RangeError);
    assert.throws(() => m.designT(invalid), RangeError);
  }
  assert.throws(() => m.create({ b: 0 }), RangeError);
  assert.throws(() => m.create({ bf: 100 }), RangeError);
  assert.throws(() => m.create({ h0: 400, as: 40 }), RangeError);
  assert.throws(() => m.doubly(100, 460), RangeError);
  close(m.create({ h0: 420 }).defaults.as, 80);
  close(m.create({ h: 600 }).defaults.h0, 560);
});

test('browser global and Node API produce the same result', () => {
  const context = vm.createContext({});
  vm.runInContext(fs.readFileSync(path.join(__dirname, 'mechanics.js'), 'utf8'), context);
  assert.ok(context.RCMechanics);
  close(context.RCMechanics.designT(400).M, m.designT(400).M);
  close(context.RCMechanics.designDouble(400).extraAsNeeded, m.designDouble(400).extraAsNeeded);
});

test('independent immutable model instances', () => {
  const input = { h: 600 };
  const custom = m.create(input);
  assert.deepEqual(input, { h: 600 });
  assert.ok(Object.isFrozen(m.defaults));
  assert.ok(Object.isFrozen(m.limits.tee));
  assert.equal(m.defaults.h, 500);
  assert.equal(custom.defaults.h, 600);
  const changedResult = m.rect(1000);
  changedResult.M = -100;
  assert.ok(m.rect(1000).M > 0);
});

console.log(JSON.stringify({
  passed: checks,
  maxForceBalanceResidualN: largestForceResidual,
  maxMomentResidualKNm: largestMomentResidual,
  rectBoundaryKNm: m.limits.rect.M,
  teeTransitionKNm: m.limits.tee.transitionM,
  teeBoundaryKNm: m.limits.tee.M,
  target400: { teeAs: m.designT(400).AsNeeded, doubleExtraEachSide: m.designDouble(400).extraAsNeeded }
}, null, 2));
