'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const V = require('./variable-section.js');
const R = require('./mechanics.js');
let passed = 0;
let maxAreaResidual = 0, maxMomentResidual = 0;
function close(actual, expected, tolerance = 1e-7) {
  assert.ok(Number.isFinite(actual));
  assert.ok(Math.abs(actual - expected) <= tolerance, `${actual} != ${expected}; difference ${Math.abs(actual - expected)}`);
}
function test(name, run) {
  try { run(); passed++; }
  catch (error) { error.message = `${name}: ${error.message}`; throw error; }
}

// Independent midpoint integration of the actual widthAt function.
// Cuts include every jump/arc endpoint to avoid straddling geometric discontinuities.
function numerical(model, depth) {
  const g = model.geometrySpec;
  const edges = [0, depth, g.flangeHeight, g.top, g.h - g.bottom, g.h / 2,
    ...g.centers.flatMap(c => [c.y - g.radius, c.y + g.radius])];
  const cuts = [...new Set(edges.filter(x => x >= 0 && x <= depth))].sort((a, b) => a - b);
  let area = 0, q = 0;
  for (let j = 1; j < cuts.length; j++) {
    const n = 100000, dy = (cuts[j] - cuts[j - 1]) / n;
    for (let i = 0; i < n; i++) {
      const y = cuts[j - 1] + (i + 0.5) * dy;
      const a = model.widthAt(y) * dy;
      area += a; q += a * y;
    }
  }
  return { area, q, moment: model.defaults.fc * (model.defaults.h0 * area - q) / 1e6 };
}

test('T results match original exact mechanics', () => {
  const t = V.create('tee');
  close(t.limits.As, R.limits.tee.As);
  close(t.limits.M, R.limits.tee.M);
  close(t.limits.transitionAs, R.limits.tee.transitionAs);
  for (let i = 0; i <= 60; i++) {
    const As = i / 50 * t.limits.As;
    const a = t.section(As), b = R.tee(As);
    close(a.M, b.M); close(a.x, b.x); close(a.yC, b.yC);
    assert.equal(a.over, b.over);
  }
});

test('four exact geometry integrals agree with width-strip quadrature', () => {
  for (const kind of ['tee', 'box', 'diamond', 'hollow']) {
    const model = V.create(kind);
    for (const f of [0.15, 0.6, 1]) {
      const s = model.section(model.limits.As * f);
      const n = numerical(model, s.x);
      maxAreaResidual = Math.max(maxAreaResidual, Math.abs(n.area - s.compressionArea));
      maxMomentResidual = Math.max(maxMomentResidual, Math.abs(n.moment - s.M));
      close(n.area, s.compressionArea, 0.002);
      close(n.moment, s.M, 0.00002);
      close(n.q / n.area, s.yC, 0.000005);
      close(s.C, s.T, 1e-6);
    }
  }
});

test('full area and centroid match elementary geometry', () => {
  close(V.create('tee').section(0).grossArea, 650 * 100 + 250 * 400);
  close(V.create('box').section(0).grossArea, 650 * 500 - 500 * 300);
  close(V.create('diamond').section(0).grossArea, 650 * 500 / 2);
  close(V.create('hollow').section(0).grossArea, 650 * 500 - 3 * Math.PI * 70 ** 2);
  for (const kind of ['box', 'diamond', 'hollow']) close(V.create(kind).section(0).grossY, 250);
});

test('box concrete entirely below compression region does not change flexure', () => {
  const a = V.create('box', { bottom: 60 });
  const b = V.create('box', { bottom: 150 });
  assert.notEqual(a.section(0).grossArea, b.section(0).grossArea);
  close(a.limits.M, b.limits.M);
  close(a.limits.As, b.limits.As);
  for (const As of [500, 2000, 3500]) {
    close(a.section(As).x, b.section(As).x);
    close(a.section(As).M, b.section(As).M);
  }
});

test('circular holes wholly below pressure zone do not change its result', () => {
  const hollow = V.create('hollow', { radius: 40, centers: [{ x: 135, y: 400 }, { x: 325, y: 400 }, { x: 515, y: 400 }] });
  const solid = R.create({ b: 650, bf: 650 });
  for (const As of [230, 2000, 4000, 6000]) {
    close(hollow.section(As).M, solid.rect(As).M);
    close(hollow.section(As).x, solid.rect(As).x);
  }
  assert.ok(hollow.section(0).grossArea < 650 * 500);
});

test('holes are absent from pressure block until their top is reached', () => {
  const h = V.create('hollow');
  const first = h.limits.events[0];
  close(first.x, 180); close(first.As, 4892.727272727273); close(first.M, 597.402);
  const s = h.section(3000);
  close(s.x, 330 * 3000 / (13.8 * 650));
  const inside = h.section(5200);
  assert.ok(inside.x > 180 && inside.widthAtX < 650);
});

test('diamond centroid of compressed triangle is at two-thirds depth', () => {
  const d = V.create('diamond');
  for (const As of [230, 1000, 3000]) {
    const s = d.section(As);
    close(s.yC, 2 * s.x / 3);
    close(s.compressionArea, 650 * s.x ** 2 / 500);
  }
  close(d.widthAt(460), 104);
});

test('inverse results are accurate and reject demands beyond the common cutoff', () => {
  for (const kind of ['tee', 'box', 'diamond', 'hollow']) {
    const m = V.create(kind);
    for (let i = 0; i <= 20; i++) {
      const area = m.limits.Amin + (m.limits.As - m.limits.Amin) * i / 20;
      const demand = m.section(area).M;
      const d = m.design(demand);
      assert.equal(d.ok, true);
      close(d.AsNeeded, area, 1e-6);
      close(d.M, demand, 1e-7);
    }
    assert.equal(m.design(m.limits.M + 10).ok, false);
    assert.equal(m.design(m.limits.M + 10).AsNeeded, null);
    assert.equal(m.section(2 * m.limits.As).over, true);
    assert.equal(m.section(2 * m.limits.As).valid, false);
  }
});

test('display start is never reported as a normative minimum check', () => {
  for (const kind of ['tee', 'box', 'diamond', 'hollow']) {
    const m = V.create(kind);
    assert.equal(m.limits.minimumIsCodeCheck, false);
    assert.equal(m.section(1000).codeMinimumChecked, false);
    const d = m.design(1);
    assert.equal(d.reason, 'display-start');
    assert.equal(d.adoptedDisplayMinimum, true);
    assert.match(d.note, /统一图示起点/);
    assert.match(d.note, /共同教学截断/);
  }
});

test('geometry scaling matches scene specification', () => {
  const b = V.create('box', { bf: 1300, h: 1000, b: 500, as: 80 });
  close(b.geometrySpec.wall, 150); close(b.geometrySpec.top, 200); close(b.geometrySpec.bottom, 200);
  const h = V.create('hollow', { bf: 1300, h: 1000, b: 500, as: 80 });
  close(h.geometrySpec.radius, 140); close(h.geometrySpec.centers[0].x, 270); close(h.geometrySpec.centers[0].y, 500);
  close(h.limits.As / V.create('hollow').limits.As, 4);
  close(h.limits.M / V.create('hollow').limits.M, 8);
});

test('invalid geometry and invalid inputs fail clearly', () => {
  assert.throws(() => V.create('unknown'), RangeError);
  assert.throws(() => V.create('box', { wall: 400 }), RangeError);
  assert.throws(() => V.create('box', { top: 300, bottom: 250 }), RangeError);
  assert.throws(() => V.create('hollow', { radius: 100 }), RangeError);
  assert.throws(() => V.create('hollow', { centers: [] }), RangeError);
  assert.throws(() => V.create('diamond').design(-1), RangeError);
  assert.throws(() => V.create('diamond').section(Infinity), RangeError);
  const original = { centers: [{ x: 200, y: 300 }] };
  const h = V.create('hollow', original);
  assert.equal(Object.isFrozen(original.centers), false);
  assert.ok(Object.isFrozen(h.geometrySpec.centers));
});

test('browser global compatibility', () => {
  const context = vm.createContext({});
  vm.runInContext(fs.readFileSync(path.join(__dirname, 'variable-section.js'), 'utf8'), context);
  close(context.VariableRC.create('box').design(400).AsNeeded, V.create('box').design(400).AsNeeded);
});

console.log(JSON.stringify({
  passed, maxAreaResidualMM2: maxAreaResidual, maxMomentResidualKNm: maxMomentResidual,
  defaultBoundaries: Object.fromEntries(['tee', 'box', 'diamond', 'hollow'].map(k => {
    const m = V.create(k); return [k, { As: m.limits.As, M: m.limits.M }];
  }))
}, null, 2));
