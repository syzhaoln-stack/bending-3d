/* Geometric compression-strip teaching model; N/mm/MPa, moments returned in kN m. */
(function (root, factory) {
  'use strict';
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.VariableRC = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';
  const NOTE = '仅作变宽截面的几何与平衡教学；Amin是统一图示起点，xb是共同教学截断条件，不表示异形截面已通过规范的配筋、破坏形态、剪力或构造验算。';
  const BASE = Object.freeze({ fc: 13.8, fy: 330, b: 250, h: 500, as: 40, h0: 460, xiB: 0.53, bf: 650, hf: 100 });
  const clamp = (x, lo, hi) => Math.min(hi, Math.max(lo, x));
  const near = (a, b) => Math.abs(a - b) <= 1e-10 * Math.max(1, Math.abs(a), Math.abs(b));

  function finite(x, name, nonnegative) {
    if (typeof x !== 'number' || !Number.isFinite(x) || (nonnegative ? x < 0 : x <= 0)) {
      throw new RangeError(name + ' must be finite and ' + (nonnegative ? 'nonnegative' : 'positive'));
    }
    return x;
  }
  function freeze(o) {
    Object.values(o).forEach(v => { if (v && typeof v === 'object' && !Object.isFrozen(v)) freeze(v); });
    return Object.freeze(o);
  }

  function create(kind, overrides) {
    if (!['tee', 'box', 'diamond', 'hollow'].includes(kind)) throw new RangeError('Unknown section kind: ' + kind);
    const o = overrides || {};
    const p = Object.assign({}, BASE, o);
    if (Object.prototype.hasOwnProperty.call(o, 'h0')) {
      if (Object.prototype.hasOwnProperty.call(o, 'as') && !near(p.h0, p.h - p.as)) throw new RangeError('h0 must equal h - as');
      p.as = p.h - p.h0;
    } else p.h0 = p.h - p.as;
    if (!Object.prototype.hasOwnProperty.call(o, 'hf')) p.hf = 100 * p.h / 500;
    Object.keys(BASE).forEach(key => finite(p[key], key));
    if (p.h0 >= p.h || p.xiB >= 1 || p.bf < p.b || p.hf >= p.h) throw new RangeError('Invalid section dimensions or xiB');
    const g = {
      kind: kind, bf: p.bf, h: p.h, webWidth: p.b,
      flangeHeight: p.hf,
      wall: o.wall === undefined ? 75 * p.bf / 650 : o.wall,
      top: o.top === undefined ? 100 * p.h / 500 : o.top,
      bottom: o.bottom === undefined ? 100 * p.h / 500 : o.bottom,
      radius: o.radius === undefined ? 70 * Math.min(p.bf / 650, p.h / 500) : o.radius,
      centers: o.centers === undefined
        ? [-190, 0, 190].map(offset => ({ x: p.bf / 2 + offset * p.bf / 650, y: p.h / 2 }))
        : o.centers.map(c => ({ x: c.x, y: c.y }))
    };
    p.hf = g.flangeHeight;
    if (kind === 'box') {
      ['wall', 'top', 'bottom'].forEach(key => finite(g[key], key));
      if (2 * g.wall >= p.bf || g.top + g.bottom >= p.h) throw new RangeError('Box void must fit inside section');
    }
    if (kind === 'hollow') {
      finite(g.radius, 'radius');
      if (!g.centers.length) throw new RangeError('At least one circular void is required');
      g.centers.forEach((c, i) => {
        finite(c.x, 'circle x'); finite(c.y, 'circle y');
        if (c.x - g.radius < 0 || c.x + g.radius > p.bf || c.y - g.radius < 0 || c.y + g.radius > p.h) {
          throw new RangeError('Circular void must be inside section');
        }
        for (let j = 0; j < i; j++) {
          if (Math.hypot(c.x - g.centers[j].x, c.y - g.centers[j].y) < 2 * g.radius) {
            throw new RangeError('Circular voids must not overlap');
          }
        }
      });
    }

    function widthAt(y) {
      if (typeof y !== 'number' || !Number.isFinite(y)) throw new RangeError('y must be finite');
      if (y < 0 || y > p.h) return 0;
      if (kind === 'tee') return y <= p.hf ? p.bf : p.b;
      if (kind === 'box') return y <= g.top || y >= p.h - g.bottom ? p.bf : 2 * g.wall;
      if (kind === 'diamond') return 2 * p.bf * Math.min(y, p.h - y) / p.h;
      return p.bf - g.centers.reduce((sum, c) => {
        const u = y - c.y;
        return sum + (Math.abs(u) < g.radius ? 2 * Math.sqrt(g.radius * g.radius - u * u) : 0);
      }, 0);
    }

    // Exact area and first moment above depth x. Circular holes use their antiderivatives.
    function integrate(x) {
      let area, q;
      if (kind === 'tee') {
        const t = Math.min(x, p.hf);
        area = p.b * x + (p.bf - p.b) * t;
        q = (p.b * x * x + (p.bf - p.b) * t * t) / 2;
      } else if (kind === 'box') {
        const t = clamp(x - g.top, 0, p.h - g.top - g.bottom);
        const voidWidth = p.bf - 2 * g.wall;
        area = p.bf * x - voidWidth * t;
        q = p.bf * x * x / 2 - voidWidth * (g.top * t + t * t / 2);
      } else if (kind === 'diamond') {
        const k = 2 * p.bf / p.h, mid = p.h / 2;
        if (x <= mid) {
          area = k * x * x / 2;
          q = k * x * x * x / 3;
        } else {
          const t = x - mid;
          area = p.bf * p.h / 4 + p.bf * t - k * t * t / 2;
          q = p.bf * p.h * p.h / 12 + mid * p.bf * t - k * t * t * t / 3;
        }
      } else {
        area = p.bf * x;
        q = p.bf * x * x / 2;
        g.centers.forEach(c => {
          const r = g.radius, u = clamp(x - c.y, -r, r);
          const s = Math.sqrt(Math.max(0, r * r - u * u));
          const holeArea = u * s + r * r * (Math.asin(clamp(u / r, -1, 1)) + Math.PI / 2);
          const holeQ = c.y * holeArea - 2 * s * s * s / 3;
          area -= holeArea;
          q -= holeQ;
        });
      }
      // Roundoff can only matter at zero-area endpoints.
      if (Math.abs(area) < 1e-10) area = 0;
      if (Math.abs(q) < 1e-8) q = 0;
      return {
        area: area, firstMoment: q,
        C: p.fc * area, yC: area > 0 ? q / area : 0,
        M: p.fc * (p.h0 * area - q) * 1e-6
      };
    }

    function profileOf() {
      let outer, holes = [];
      if (kind === 'tee') {
        const left = (p.bf - p.b) / 2, right = left + p.b;
        outer = [[0, 0], [p.bf, 0], [p.bf, p.hf], [right, p.hf], [right, p.h], [left, p.h], [left, p.hf], [0, p.hf]];
      } else if (kind === 'diamond') outer = [[p.bf / 2, 0], [p.bf, p.h / 2], [p.bf / 2, p.h], [0, p.h / 2]];
      else {
        outer = [[0, 0], [p.bf, 0], [p.bf, p.h], [0, p.h]];
        if (kind === 'box') holes = [{ kind: 'polygon', points: [[g.wall, g.top], [p.bf - g.wall, g.top], [p.bf - g.wall, p.h - g.bottom], [g.wall, p.h - g.bottom]] }];
        else holes = g.centers.map(c => ({ kind: 'circle', cx: c.x, cy: c.y, r: g.radius }));
      }
      return freeze({ outer: outer, holes: holes, coordinates: 'x from left; y from top, mm' });
    }

    const xb = p.xiB * p.h0;
    const boundary = integrate(xb);
    const minReference = 0.002 * p.b * p.h0;
    const Amin = o.displayAmin === undefined ? Math.min(minReference, boundary.C / p.fy) : finite(o.displayAmin, 'displayAmin', true);
    if (Amin > boundary.C / p.fy) throw new RangeError('Display minimum exceeds the teaching boundary');
    const transition = kind === 'tee' && p.hf <= xb ? integrate(p.hf) : null;
    const gross = integrate(p.h);
    const profile = profileOf();
    const rawEvents = kind === 'tee' ? [{ name: '翼板底面', x: p.hf }]
      : kind === 'box' ? [{ name: '进入箱孔高度范围', x: g.top }, { name: '离开箱孔高度范围', x: p.h - g.bottom }]
      : kind === 'diamond' ? [{ name: '截面最大宽度处', x: p.h / 2 }]
      : Array.from(new Set(g.centers.flatMap(c => [c.y - g.radius, c.y + g.radius])))
        .sort((a, b) => a - b).map(x => ({ name: '圆孔边界高度', x: x }));
    const events = rawEvents.map(e => {
      const c = integrate(e.x);
      return { name: e.name, x: e.x, As: c.C / p.fy, M: c.M, withinLimit: e.x <= xb };
    });
    const limits = freeze({
      Amin: Amin, displayAmin: Amin, minimumIsCodeCheck: false,
      xb: xb, As: boundary.C / p.fy, M: boundary.M,
      transitionAs: transition ? transition.C / p.fy : null,
      transitionM: transition ? transition.M : null,
      transitionX: transition ? p.hf : null,
      events: events, note: NOTE
    });

    function rootFor(target, quantity) {
      if (target <= 0) return 0;
      let lo = 0, hi = xb;
      for (let i = 0; i < 75; i++) {
        const mid = (lo + hi) / 2;
        if (integrate(mid)[quantity] < target) lo = mid;
        else hi = mid;
      }
      return (lo + hi) / 2;
    }

    function section(As) {
      finite(As, 'As', true);
      const over = As > limits.As && !near(As, limits.As);
      const AsActive = Math.min(As, limits.As);
      const x = rootFor(p.fy * AsActive, 'C');
      const c = integrate(x);
      const atLimit = !over && near(As, limits.As);
      const bAtX = widthAt(x);
      return {
        mode: 'tee', sectionKind: kind,
        b: p.b, h: p.h, h0: p.h0, as: p.as, bf: p.bf, hf: p.hf,
        fc: p.fc, fy: p.fy, xiB: p.xiB, xb: xb,
        x: x, xi: x / p.h0, yC: c.yC, yCtotal: c.yC,
        As: As, AsActive: AsActive, AsIgnored: Math.max(0, As - AsActive),
        AsBase: AsActive, AsExtra: 0, AsTop: 0,
        C: c.C, Cc: c.C, Cs: 0, T: p.fy * AsActive,
        M: c.M, Mconcrete: c.M, Msteel: 0, leverArm: p.h0 - c.yC,
        compressionArea: c.area, compressionFirstMoment: c.firstMoment,
        grossArea: gross.area, grossY: gross.yC,
        widthAtX: bAtX,
        slope: over ? 0 : p.fy * (p.h0 - x) * 1e-6,
        curvature: over ? 0 : (bAtX > 0 ? -p.fy * p.fy / (p.fc * bAtX) * 1e-6 : null),
        regime: kind === 'tee' ? (x <= p.hf ? 'flange' : 'web') : kind,
        over: over, atLimit: atLimit, valid: !over,
        forceBalanced: near(c.C, p.fy * AsActive),
        teachingBoundary: over || atLimit, codeMinimumChecked: false,
        belowDisplayStart: As < Amin && !near(As, Amin),
        Amin: Amin, note: NOTE,
        geometrySpec: g,
        warnings: over ? [NOTE, '灰色平台仅表示不再计入设计增益，不是实际破坏模拟。'] : [NOTE]
      };
    }

    function design(M) {
      finite(M, 'M', true);
      if (M > limits.M && !near(M, limits.M)) {
        return Object.assign(section(limits.As), {
          ok: false, reason: 'exceeds-design-limit', Mtarget: M, AsNeeded: null,
          Mlimit: limits.M, demandOver: true,
          message: '目标超过当前几何模型的界限，请改变截面或材料条件。'
        });
      }
      const x = rootFor(Math.min(M, limits.M), 'M');
      const AsCalculated = integrate(x).C / p.fy;
      const adopted = Math.min(limits.As, Math.max(Amin, AsCalculated));
      return Object.assign(section(adopted), {
        ok: true, reason: AsCalculated < Amin ? 'display-start' : 'solved',
        Mtarget: M, AsNeeded: adopted, AsCalculated: AsCalculated,
        Mlimit: limits.M, demandOver: false,
        adoptedDisplayMinimum: AsCalculated < Amin,
        message: AsCalculated < Amin ? '采用统一图示起点；它不是异形截面的规范最小配筋结论。' : '已按截面宽度积分与平衡求解，尚未进行构造设计。'
      });
    }

    freeze(g);
    const cleanDefaults = Object.assign({}, p, { geometrySpec: g });
    delete cleanDefaults.centers;
    return freeze({
      kind: kind, defaults: cleanDefaults, geometrySpec: g,
      limits: limits, section: section, design: design, widthAt: widthAt,
      compression: integrate,
      profile: profile, note: NOTE
    });
  }
  return freeze({ defaults: BASE, create: create, note: NOTE });
});
