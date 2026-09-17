/*
 * Reinforced-concrete flexure teaching model.
 * Units: N, mm, MPa internally; returned moments are kN m.
 * Browser: window.RCMechanics. Node: require('./mechanics.js').
 * No DOM, network, mutable global state, or engineering-detailing checks.
 */
(function (root, factory) {
  'use strict';
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.RCMechanics = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  const BASE = Object.freeze({
    fc: 13.8, fy: 330, ft: 1.39, Es: 200000,
    b: 250, h: 500, as: 40, h0: 460,
    xiB: 0.53, beta: 0.8, epsilonCu: 0.0033,
    bf: 650, hf: 100, ap: 40
  });
  const K = 1e-6;

  function number(value, label, allowZero) {
    if (typeof value !== 'number' || !Number.isFinite(value) ||
        (allowZero ? value < 0 : value <= 0)) {
      throw new RangeError(label + (allowZero ? ' must be finite and >= 0' : ' must be finite and > 0'));
    }
    return value;
  }

  function freeze(object) {
    Object.values(object).forEach(function (value) {
      if (value && typeof value === 'object' && !Object.isFrozen(value)) freeze(value);
    });
    return Object.freeze(object);
  }

  function near(a, b) {
    return Math.abs(a - b) <= 1e-10 * Math.max(1, Math.abs(a), Math.abs(b));
  }

  function parameters(overrides) {
    const o = overrides || {};
    const p = Object.assign({}, BASE, o);
    if (Object.prototype.hasOwnProperty.call(o, 'h0')) {
      if (Object.prototype.hasOwnProperty.call(o, 'as') && !near(p.h0, p.h - p.as)) {
        throw new RangeError('h0 must equal h - as');
      }
      p.as = p.h - p.h0;
    } else {
      p.h0 = p.h - p.as;
    }
    Object.keys(BASE).forEach(function (key) { number(p[key], key, false); });
    if (p.h0 >= p.h || p.hf >= p.h || p.bf < p.b || p.ap >= p.h0) {
      throw new RangeError('Require 0 < h0 < h, 0 < hf < h, bf >= b, and 0 < ap < h0');
    }
    if (p.xiB >= 1 || p.beta > 1 || p.xiB >= p.beta) {
      throw new RangeError('Require 0 < xiB < beta <= 1');
    }
    return freeze(p);
  }

  function create(overrides) {
    const p = parameters(overrides);
    const xb = p.xiB * p.h0;
    const rhoMin = Math.max(0.002, 0.45 * p.ft / p.fy);
    const Amin = rhoMin * p.b * p.h0;

    // Integrate the equivalent uniform compression block; y is measured from top.
    function compression(x, isTee) {
      const t = isTee ? Math.min(x, p.hf) : 0;
      const extraWidth = isTee ? p.bf - p.b : 0;
      const area = p.b * x + extraWidth * t;
      const firstMoment = (p.b * x * x + extraWidth * t * t) / 2;
      const C = p.fc * area;
      const yC = area > 0 ? firstMoment / area : 0;
      return {
        C: C, area: area, yC: yC,
        M: p.fc * (area * p.h0 - firstMoment) * K,
        components: [
          { name: 'web', force: p.fc * p.b * x, y: x / 2 },
          { name: 'flange-overhang', force: p.fc * extraWidth * t, y: t / 2 }
        ]
      };
    }

    const rectLimit = compression(xb, false);
    const teeLimit = compression(xb, true);
    const transition = compression(p.hf, true);
    const limits = freeze({
      Amin: Amin, rhoMin: rhoMin, xb: xb, apMax: xb / 2,
      rect: { As: rectLimit.C / p.fy, M: rectLimit.M, x: xb },
      tee: {
        As: teeLimit.C / p.fy, M: teeLimit.M, x: xb,
        transitionAs: transition.C / p.fy,
        transitionM: transition.M, transitionX: p.hf,
        transitionWithinLimit: p.hf <= xb,
        slopeAtTransition: p.fy * (p.h0 - p.hf) * K,
        curvatureFlange: -p.fy * p.fy / (p.fc * p.bf) * K,
        curvatureWeb: -p.fy * p.fy / (p.fc * p.b) * K
      }
    });

    function geometry(mode) {
      return {
        mode: mode, b: p.b, h: p.h, as: p.as, h0: p.h0,
        bf: mode === 'tee' ? p.bf : p.b,
        hf: mode === 'tee' ? p.hf : 0,
        fc: p.fc, fy: p.fy, xiB: p.xiB, xb: xb,
        Amin: Amin, rhoMin: rhoMin, ap: p.ap
      };
    }

    function singly(As, isTee) {
      number(As, 'As', true);
      const bound = isTee ? limits.tee : limits.rect;
      const over = As > bound.As && !near(As, bound.As);
      const AsActive = Math.min(As, bound.As);
      const targetArea = p.fy * AsActive / p.fc;
      const x = isTee && targetArea > p.bf * p.hf
        ? (targetArea - (p.bf - p.b) * p.hf) / p.b
        : targetArea / (isTee ? p.bf : p.b);
      const c = compression(x, isTee);
      const atLimit = !over && near(As, bound.As);
      const belowMinimum = As < Amin && !near(As, Amin);
      const widthAtX = isTee && x <= p.hf ? p.bf : p.b;
      const warnings = [];
      if (over) warnings.push('超出单筋设计界限；压区和弯矩只显示设计上限，不模拟超筋梁真实破坏。');
      if (belowMinimum) warnings.push('低于最小配筋面积；此代数参考值不是少筋梁实际承载力。');
      if (atLimit) warnings.push('到达教材的单筋界限状态；等号是教学边界，不代表已完成工程设计。');
      return Object.assign(geometry(isTee ? 'tee' : 'rect'), {
        As: As, AsActive: AsActive, AsIgnored: Math.max(0, As - AsActive),
        AsBase: AsActive, AsExtra: 0, AsTop: 0,
        x: x, cn: x / p.beta, yC: c.yC, yCtotal: c.yC,
        C: c.C, Cc: c.C, Cs: 0, T: p.fy * AsActive,
        compressionArea: c.area, compressionComponents: c.components,
        M: c.M, Mconcrete: c.M, Msteel: 0,
        leverArm: p.h0 - c.yC,
        slope: over ? 0 : p.fy * (p.h0 - x) * K,
        curvature: over ? 0 : -p.fy * p.fy / (p.fc * widthAtX) * K,
        rho: As / (p.b * p.h0), xi: x / p.h0,
        regime: isTee ? (x <= p.hf ? 'flange' : 'web') : 'rectangle',
        over: over, atLimit: atLimit, belowMinimum: belowMinimum,
        valid: !over && !belowMinimum,
        // More conservative flag distinguishes the textbook equality boundary.
        strictlyInsideSingleLimit: !over && !atLimit && !belowMinimum,
        teachingBoundary: atLimit || over,
        forceBalanced: near(c.C, p.fy * AsActive),
        warnings: warnings
      });
    }

    function rect(As) { return singly(As, false); }
    function tee(As) { return singly(As, true); }

    function doubly(extraAs, ap) {
      number(extraAs, 'extraAs', true);
      const topDepth = ap === undefined ? p.ap : number(ap, 'ap', false);
      if (topDepth >= p.h0) throw new RangeError('ap must be smaller than h0');
      const compressionSteelAdmissible = xb >= 2 * topDepth || near(xb, 2 * topDepth);
      const strainTop = p.epsilonCu * (1 - p.beta * topDepth / xb);
      const topYieldByStrain = strainTop >= p.fy / p.Es;
      const valid = extraAs === 0 || (compressionSteelAdmissible && topYieldByStrain);
      const baseAs = limits.rect.As;
      const Cc = rectLimit.C;
      const Cs = p.fy * extraAs;
      const totalC = Cc + Cs;
      const extraM = valid ? Cs * (p.h0 - topDepth) * K : null;
      const warnings = ['固定 x = ξ_b h0 的教材分解：混凝土与原下筋承担基础部分，新增上下钢筋承担力偶。'];
      if (!valid) warnings.push('受压筋屈服适用条件未满足；本模块不计算该分支，不可继续套用同应力钢筋力偶。');
      return Object.assign(geometry('double'), {
        As: baseAs + extraAs, AsActive: baseAs + extraAs, AsIgnored: 0,
        AsBase: baseAs, AsExtra: extraAs, AsTop: extraAs, ap: topDepth,
        x: xb, cn: xb / p.beta, xi: p.xiB,
        yC: xb / 2, yCtotal: valid ? (Cc * xb / 2 + Cs * topDepth) / totalC : null,
        C: valid ? totalC : null, Cc: Cc, Cs: valid ? Cs : null,
        T: valid ? p.fy * (baseAs + extraAs) : null,
        compressionArea: p.b * xb,
        compressionComponents: [{ name: 'concrete', force: Cc, y: xb / 2 }],
        M: valid ? rectLimit.M + extraM : null,
        Mconcrete: rectLimit.M, Msteel: extraM,
        leverArm: p.h0 - xb / 2, steelLeverArm: p.h0 - topDepth,
        slope: valid ? p.fy * (p.h0 - topDepth) * K : null, curvature: valid ? 0 : null,
        rho: (baseAs + extraAs) / (p.b * p.h0),
        strainTop: strainTop, yieldStrain: p.fy / p.Es,
        compressionSteelAdmissible: compressionSteelAdmissible,
        topYieldByStrain: topYieldByStrain,
        regime: 'doubly', over: false, atLimit: true,
        belowMinimum: false, valid: valid, teachingBoundary: true,
        forceBalanced: valid && near(totalC, p.fy * (baseAs + extraAs)),
        warnings: warnings
      });
    }

    // Stable small root of x(h0 - x/2) = moment/(fc * width).
    function depthFromMoment(moment, width) {
      const c = moment / K / (p.fc * width);
      const disc = p.h0 * p.h0 - 2 * c;
      if (disc < -1e-8) throw new RangeError('Moment has no admissible quadratic root');
      return 2 * c / (p.h0 + Math.sqrt(Math.max(0, disc)));
    }

    function designSingly(M, isTee) {
      number(M, 'M', true);
      const bound = isTee ? limits.tee : limits.rect;
      const forward = isTee ? tee : rect;
      if (M > bound.M && !near(M, bound.M)) {
        return Object.assign(forward(bound.As), {
          ok: false, reason: 'exceeds-design-limit', Mtarget: M,
          AsNeeded: null, AsCalculated: null, Mlimit: bound.M,
          adoptedMinimum: false, demandOver: true,
          message: '目标弯矩超过本截面的单筋设计界限，请改变截面或采用双筋方案。'
        });
      }
      const target = Math.min(M, bound.M);
      let x;
      if (isTee && target > limits.tee.transitionM) {
        const flangeM = p.fc * (p.bf - p.b) * p.hf * (p.h0 - p.hf / 2) * K;
        x = depthFromMoment(target - flangeM, p.b);
      } else {
        x = depthFromMoment(target, isTee ? p.bf : p.b);
      }
      const calculated = compression(x, isTee).C / p.fy;
      const adopted = Math.min(bound.As, Math.max(Amin, calculated));
      return Object.assign(forward(adopted), {
        ok: true, reason: calculated < Amin ? 'minimum-reinforcement' : 'solved',
        Mtarget: M, AsNeeded: adopted, AsCalculated: calculated,
        Mlimit: bound.M, adoptedMinimum: calculated < Amin,
        demandOver: false,
        message: calculated < Amin ? '按最小配筋面积采用，承载力大于目标弯矩。' : '已按教材正截面公式求解钢筋面积。'
      });
    }

    function designRect(M) { return designSingly(M, false); }
    function designT(M) { return designSingly(M, true); }

    function designDouble(M, ap) {
      number(M, 'M', true);
      const topDepth = ap === undefined ? p.ap : number(ap, 'ap', false);
      const extra = Math.max(0, M - limits.rect.M) / (p.fy * (p.h0 - topDepth) * K);
      const result = doubly(extra, topDepth);
      const needsDouble = M > limits.rect.M && !near(M, limits.rect.M);
      return Object.assign(result, {
        ok: result.valid,
        reason: !result.valid ? 'compression-steel-not-admissible' : (needsDouble ? 'solved' : 'single-sufficient'),
        Mtarget: M, AsNeeded: result.valid ? result.As : null,
        extraAsNeeded: result.valid ? extra : null,
        AsTopNeeded: result.valid ? extra : null,
        demandOver: !result.valid, doubleRequired: needsDouble,
        recommendedSingle: needsDouble ? null : designRect(M),
        message: !result.valid
          ? '受压筋屈服适用条件不满足，需要其他截面计算方法。'
          : (needsDouble ? '上下新增钢筋面积相同，另保留基础受拉钢筋。' : '目标弯矩可由单筋承担；当前固定压区演示保留基础钢筋，无需新增受压筋。')
      });
    }

    return freeze({
      defaults: p, limits: limits, rect: rect, tee: tee, doubly: doubly,
      designRect: designRect, designT: designT, designDouble: designDouble,
      create: create
    });
  }

  return create();
});
