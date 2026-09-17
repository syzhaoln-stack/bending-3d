'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const response = require('./section-response.js');
const mechanics = require('./mechanics.js');
const variable = require('./variable-section.js');
let passed = 0;
let maxForceResidual = 0;
let maxRelativeResidual = 0;

function test(name, run) {
  try { run(); passed++; }
  catch (error) { error.message = name + ': ' + error.message; throw error; }
}
function close(actual, expected, tolerance = 1e-8) {
  assert.ok(Number.isFinite(actual), 'non-finite result');
  assert.ok(Math.abs(actual - expected) <= tolerance,
    `${actual} != ${expected}; difference ${Math.abs(actual - expected)}`);
}
function record(s) {
  maxForceResidual = Math.max(maxForceResidual, Math.abs(s.forceResidual));
  maxRelativeResidual = Math.max(maxRelativeResidual, s.forceRelativeResidual);
  close(s.C, s.T, 1e-6);
  close(s.M, s.C * (s.h0 - s.yC) / 1e6);
  close(s.x, s.beta * s.cn);
}
function teeCompression(x) {
  const p = mechanics.defaults, t = Math.min(x, p.hf);
  const area = p.b * x + (p.bf - p.b) * t;
  const firstMoment = (p.b * x * x + (p.bf - p.b) * t * t) / 2;
  return { C: p.fc * area, M: p.fc * (p.h0 * area - firstMoment) / 1e6,
    yC: area ? firstMoment / area : 0, area };
}

test('independently known rectangle response values', () => {
  const known = [
    [3000, 254.84053008804597, 293.0666096012528, 292.4040460368944],
    [4000, 271.6003030543999, 234.25526138441984, 303.7820809791404],
    [6000, 293.1372327309565, 168.5539088203001, 316.9805091513219]
  ];
  known.forEach(([As, x, stress, M]) => {
    const s = response.solve(As);
    close(s.x, x); close(s.steelStress, stress); close(s.M, M);
    assert.equal(s.steelYielded, false);
    assert.equal(s.overDesignLimit, true);
    record(s);
  });
});

test('independent elastic-steel quadratic agrees with the numerical solve', () => {
  const p = response.defaults;
  for (const As of [2700, 3300, 4500, 7000, 10000]) {
    const k = p.fc * p.b * p.beta, B = p.Es * p.epsilonCu * As;
    const c = 2 * B * p.h0 / (B + Math.sqrt(B * B + 4 * k * B * p.h0));
    const s = response.solve(As);
    close(s.cn, c);
    close(s.steelStress, p.Es * p.epsilonCu * (p.h0 - c) / c);
  }
});

test('textbook boundary and constitutive yield boundary stay distinct', () => {
  const s = response.solve(mechanics.limits.rect.As);
  close(s.designBoundaryX, 243.8);
  close(s.designBoundaryAs, 2548.818181818182);
  close(s.designBoundaryM, 284.379291);
  close(s.strainBoundaryX, 245.33333333333337);
  close(s.strainBoundaryXi, 0.5333333333333334);
  close(s.strainBoundaryAs, 2564.848484848485);
  close(s.strainBoundaryM, 285.5189333333333);
  close(s.steelStrain, 0.0016811320754716982);
  assert.equal(s.steelYielded, true);
  assert.equal(s.atDesignBoundary, true);
  const between = response.solve((s.designBoundaryAs + s.strainBoundaryAs) / 2);
  assert.equal(between.overDesignLimit, true);
  assert.equal(between.steelYielded, true);
});

test('rectangle matches original yielding branch before its design boundary', () => {
  for (let i = 0; i <= 30; i++) {
    const As = mechanics.limits.Amin + (mechanics.limits.rect.As - mechanics.limits.Amin) * i / 30;
    const a = response.solve(As), b = mechanics.rect(As);
    close(a.x, b.x); close(a.M, b.M);
    assert.equal(a.steelYielded, true);
    close(a.steelStress, 330);
    record(a);
  }
});

test('depth and resistance continue increasing rather than cap above design limit', () => {
  let previous = response.solve(230);
  for (let As = 255; As <= 10000; As += 25) {
    const next = response.solve(As);
    assert.ok(next.x > previous.x);
    assert.ok(next.M > previous.M);
    assert.ok(next.cn > 0 && next.cn < next.h0);
    assert.ok(next.x < next.beta * next.h0);
    assert.ok(next.steelStress <= 330);
    assert.ok(next.steelStress <= previous.steelStress + 1e-8);
    record(next);
    previous = next;
  }
  assert.ok(response.solve(4000).x > mechanics.limits.xb);
  assert.ok(response.solve(4000).M > mechanics.limits.rect.M);
});

test('no value jump at the textbook boundary', () => {
  const boundary = response.solve(2500).designBoundaryAs;
  const left = response.solve(boundary - 0.0001), right = response.solve(boundary + 0.0001);
  assert.equal(left.overDesignLimit, false);
  assert.equal(right.overDesignLimit, true);
  close(left.x, right.x, 0.00003);
  close(left.M, right.M, 0.00003);
  close(left.steelStress, right.steelStress);
});

test('yield-to-elastic transition has continuous x, stress and M', () => {
  const boundary = response.solve(2500).strainBoundaryAs;
  const left = response.solve(boundary - 0.001), middle = response.solve(boundary), right = response.solve(boundary + 0.001);
  assert.equal(left.steelYielded, true);
  assert.equal(middle.steelYielded, true);
  assert.equal(right.steelYielded, false);
  close(left.x, right.x, 0.0002);
  close(left.M, right.M, 0.0002);
  close(left.steelStress, right.steelStress, 0.0002);
  close(middle.steelStrain, middle.yieldStrain, 1e-12);
});

test('T flange transition is continuous and matches original mechanics', () => {
  const As = mechanics.limits.tee.transitionAs;
  for (const delta of [-300, -0.001, 0, 0.001, 300]) {
    const s = response.solve(As + delta, mechanics.defaults, teeCompression);
    const original = mechanics.tee(As + delta);
    close(s.x, original.x); close(s.M, original.M);
    assert.equal(s.steelYielded, true);
    record(s);
  }
  const left = response.solve(As - 0.001, mechanics.defaults, teeCompression);
  const right = response.solve(As + 0.001, mechanics.defaults, teeCompression);
  close(left.M, right.M, 0.0003);
  close(left.x, right.x, 0.0002);
});

test('T over-reinforcement uses actual steel stress and full input area', () => {
  const s = response.solve(6000, mechanics.defaults, teeCompression);
  assert.equal(s.overDesignLimit, true);
  assert.equal(s.steelYielded, false);
  assert.ok(s.x > mechanics.limits.xb);
  assert.ok(s.M > mechanics.limits.tee.M);
  close(s.T, 6000 * s.steelStress);
  assert.ok(s.T < 6000 * mechanics.defaults.fy);
  record(s);
});

test('variable-section callback works for all four shapes', () => {
  for (const kind of ['tee', 'box', 'diamond', 'hollow']) {
    const g = variable.create(kind);
    let previous = response.solve(g.limits.Amin, g.defaults, g.compression);
    for (let i = 1; i <= 30; i++) {
      const As = g.limits.Amin + (g.limits.As * 1.8 - g.limits.Amin) * i / 30;
      const s = response.solve(As, g.defaults, g.compression);
      assert.ok(s.M > previous.M);
      assert.ok(s.x > previous.x);
      record(s);
      previous = s;
    }
    assert.equal(previous.steelYielded, false);
  }
});

test('zero steel produces an explicit initialized zero state', () => {
  const z = response.solve(0);
  for (const key of ['x', 'cn', 'M', 'C', 'T', 'area', 'steelStress', 'steelStrain', 'forceResidual']) close(z[key], 0);
  assert.equal(z.zeroState, true);
  assert.equal(z.overDesignLimit, false);
  assert.equal(z.steelYielded, false);
  assert.equal(z.converged, true);
});

test('invalid values and malformed or incorrectly scaled callbacks fail', () => {
  for (const As of [-1, NaN, Infinity, '3000', null]) assert.throws(() => response.solve(As), RangeError);
  for (const [key, value] of [['fy', 0], ['Es', -1], ['beta', 1.2], ['xiB', 0.9], ['epsilonCu', NaN]]) {
    assert.throws(() => response.solve(3000, { [key]: value }), RangeError);
  }
  assert.throws(() => response.solve(3000, {}, {}), TypeError);
  assert.throws(() => response.solve(3000, {}, () => null), TypeError);
  assert.throws(() => response.solve(3000, {}, x => ({ C: -1, M: 0, yC: x / 2, area: 1 })), RangeError);
  assert.throws(() => response.solve(3000, {}, x => ({ C: 100, M: 100 * (460 - x / 2), yC: x / 2, area: 10 })), RangeError);
});

test('existing design APIs still reject demands above their design bounds', () => {
  assert.equal(mechanics.designRect(300).ok, false);
  assert.equal(mechanics.designT(550).ok, false);
  assert.equal(variable.create('box').design(500).ok, false);
  close(mechanics.rect(4000).M, mechanics.limits.rect.M);
  assert.ok(response.solve(4000).M > mechanics.limits.rect.M);
});

test('browser compatibility and no parameter mutation', () => {
  const context = vm.createContext({});
  vm.runInContext(fs.readFileSync(path.join(__dirname, 'section-response.js'), 'utf8'), context);
  close(context.RCSectionResponse.solve(4000).M, response.solve(4000).M);
  const params = { h0: 460, fy: 330 };
  response.solve(3000, params);
  assert.deepEqual(params, { h0: 460, fy: 330 });
  assert.ok(Object.isFrozen(response.defaults));
});

console.log(JSON.stringify({
  passed,
  maxForceResidualN: maxForceResidual,
  maxForceRelativeResidual: maxRelativeResidual,
  textbookXiB: response.defaults.xiB,
  modelYieldXi: response.solve(3000).strainBoundaryXi,
  referencePoints: [3000, 4000, 6000].map(As => {
    const s = response.solve(As);
    return { As, x: s.x, steelStress: s.steelStress, M: s.M };
  })
}, null, 2));
