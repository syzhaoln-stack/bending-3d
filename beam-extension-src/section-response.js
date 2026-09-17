/*
 * Strain-compatible ultimate-state teaching response, including over-reinforcement.
 * Concrete reaches epsilonCu at its top fibre. Steel is elastic-perfectly plastic.
 * This response is NOT a design approval and does not replace the existing design APIs.
 * Units: N, mm, MPa; callback/returned moments use kN m.
 */
(function (root, factory) {
  'use strict';
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.RCSectionResponse = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';
  const defaults = Object.freeze({
    fc: 13.8, fy: 330, Es: 200000, beta: 0.8, epsilonCu: 0.0033,
    b: 250, h0: 460, xiB: 0.53
  });

  function finite(value, name, allowZero) {
    if (typeof value !== 'number' || !Number.isFinite(value) || (allowZero ? value < 0 : value <= 0)) {
      throw new RangeError(name + ' must be finite and ' + (allowZero ? '>= 0' : '> 0'));
    }
    return value;
  }

  function solve(As, params, compressionAtX) {
    finite(As, 'As', true);
    const p = Object.assign({}, defaults, params || {});
    Object.keys(defaults).forEach(key => finite(p[key], key));
    if (p.beta > 1 || p.xiB >= p.beta) throw new RangeError('Require 0 < xiB < beta <= 1');
    if (compressionAtX !== undefined && typeof compressionAtX !== 'function') {
      throw new TypeError('compressionAtX must be a function');
    }
    const callback = compressionAtX || function (x) {
      const area = p.b * x, C = p.fc * area;
      return { C: C, M: C * (p.h0 - x / 2) * 1e-6, yC: x / 2, area: area };
    };

    function compression(x) {
      const q = callback(x);
      if (!q || typeof q !== 'object') throw new TypeError('compressionAtX must return an object');
      for (const key of ['C', 'M', 'yC', 'area']) finite(q[key], 'compression.' + key, true);
      if (q.yC > x + 1e-8 * Math.max(1, x)) throw new RangeError('Compression centroid must lie within the compression depth');
      // Reject a mismatched h0 or an N mm / kN m callback mix-up.
      const expectedMoment = q.C * (p.h0 - q.yC) * 1e-6;
      if (Math.abs(q.M - expectedMoment) > 1e-8 * Math.max(1, q.M, expectedMoment)) {
        throw new RangeError('compression.M must equal C * (h0 - yC) / 1e6, in kN m');
      }
      return { C: q.C, M: q.M, yC: q.yC, area: q.area };
    }

    const yieldStrain = p.fy / p.Es;
    const strainBoundaryC = p.h0 / (1 + yieldStrain / p.epsilonCu);
    const strainBoundaryX = p.beta * strainBoundaryC;
    const designBoundaryX = p.xiB * p.h0;
    const designPoint = compression(designBoundaryX);
    const strainPoint = compression(strainBoundaryX);
    const designCn = designBoundaryX / p.beta;
    const designSteelStress = Math.min(p.fy, p.Es * p.epsilonCu * (p.h0 - designCn) / designCn);
    const metadata = {
      As: As, fy: p.fy, Es: p.Es, beta: p.beta, epsilonCu: p.epsilonCu,
      h0: p.h0, yieldStrain: yieldStrain,
      designBoundaryX: designBoundaryX, designBoundaryXi: p.xiB,
      designBoundaryAs: designPoint.C / designSteelStress,
      bookDesignBoundaryAs: designPoint.C / p.fy,
      designBoundaryM: designPoint.M,
      strainBoundaryX: strainBoundaryX, strainBoundaryCn: strainBoundaryC,
      strainBoundaryXi: strainBoundaryX / p.h0,
      strainBoundaryAs: strainPoint.C / p.fy, strainBoundaryM: strainPoint.M,
      // For the defaults: textbook xiB = .53, constitutive xi_y = .533333...
      // Keep this small difference. Never retune beta/epsilonCu to force equality.
      model: 'equivalent-block-with-strain-compatible-steel',
      note: '采用设计强度参数的简化极限状态趋势；超出教材设计界限的增益不作为可采用的设计方案。'
    };

    const origin = compression(0);
    if (origin.C > 1e-9 || origin.area > 1e-9) throw new RangeError('Compression at zero depth must be zero');
    if (As === 0) {
      // A display/initialization sentinel, not a concrete-crushing state without steel.
      return Object.assign(metadata, {
        x: 0, cn: 0, xi: 0, yC: 0, M: 0, C: 0, Cc: 0, T: 0, area: 0,
        steelStress: 0, steelStrain: 0, steelYielded: false,
        forceResidual: 0, forceRelativeResidual: 0,
        overDesignLimit: false, atDesignBoundary: false,
        beyondStrainBoundary: false, zeroState: true, converged: true,
        iterations: 0
      });
    }

    const upperCompression = compression(p.beta * p.h0);
    if (upperCompression.C <= 0) throw new RangeError('No positive compression block is available for equilibrium');

    function evaluate(c) {
      const x = p.beta * c;
      const q = compression(x);
      const steelStrain = p.epsilonCu * (p.h0 - c) / c;
      const steelStress = Math.min(p.fy, p.Es * steelStrain);
      const T = As * steelStress;
      return { x: x, cn: c, q: q, steelStrain: steelStrain, steelStress: steelStress, T: T, residual: q.C - T };
    }

    // C(beta*c) is nondecreasing and As*sigma_s(c) is nonincreasing.
    // At c -> 0 the residual is negative; at c = h0 it is positive.
    let lo = 0, hi = p.h0, iterations = 0;
    for (; iterations < 100; iterations++) {
      const mid = (lo + hi) / 2;
      if (mid === lo || mid === hi) break;
      const state = evaluate(mid);
      if (state.residual < 0) lo = mid;
      else hi = mid;
    }
    const s = evaluate((lo + hi) / 2);
    const relativeResidual = Math.abs(s.residual) / Math.max(1, s.q.C, s.T);
    if (relativeResidual > 1e-8) throw new RangeError('Strain-compatible equilibrium did not converge');
    const depthTolerance = 1e-10 * Math.max(1, p.h0);
    const strainTolerance = 1e-10 * yieldStrain;
    const steelYielded = s.steelStrain >= yieldStrain - strainTolerance;
    return Object.assign(metadata, {
      x: s.x, cn: s.cn, xi: s.x / p.h0, yC: s.q.yC,
      M: s.q.M, C: s.q.C, Cc: s.q.C, T: s.T, area: s.q.area,
      steelStress: s.steelStress, steelStrain: s.steelStrain, steelYielded: steelYielded,
      forceResidual: s.residual, forceRelativeResidual: relativeResidual,
      overDesignLimit: s.x > designBoundaryX + depthTolerance,
      atDesignBoundary: Math.abs(s.x - designBoundaryX) <= depthTolerance,
      beyondStrainBoundary: !steelYielded,
      zeroState: false, converged: true, iterations: iterations
    });
  }

  return Object.freeze({ defaults: defaults, solve: solve });
});
