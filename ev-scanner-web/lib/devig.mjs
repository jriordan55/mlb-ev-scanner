/** Two-way devig (aligned with R app.R devig_* helpers). */

function clampProb(p) {
  return Math.min(0.999, Math.max(0.001, p));
}

export function devigMultiplicative(p1, p2) {
  if (!Number.isFinite(p1) || !Number.isFinite(p2)) return [NaN, NaN];
  const s = p1 + p2;
  if (s <= 1e-12) return [NaN, NaN];
  let o1 = clampProb(p1 / s);
  let o2 = clampProb(p2 / s);
  const t = o1 + o2;
  return [o1 / t, o2 / t];
}

export function devigAdditive(p1, p2) {
  if (!Number.isFinite(p1) || !Number.isFinite(p2)) return [NaN, NaN];
  const s = p1 + p2;
  if (s <= 1e-12) return [NaN, NaN];
  if (s <= 1) return devigMultiplicative(p1, p2);
  const overround = s - 1;
  let o1 = clampProb(p1 - overround / 2);
  let o2 = clampProb(p2 - overround / 2);
  const t = o1 + o2;
  return [o1 / t, o2 / t];
}

function qnorm(p) {
  // inverse normal CDF (Acklam approximation, sufficient for devig)
  if (p <= 0 || p >= 1) return NaN;
  const a = [
    -3.9696830287e1, 2.2094609845e2, -2.7592851049e2, 1.3835775186e2, -3.066479806e1, 2.50662827749,
  ];
  const b = [-5.4476098798e1, 1.61585836858036e2, -1.556989798598e2, 6.68013118877e1, -1.328068155288e1];
  const c = [
    -7.78489400203e-3, -3.223964580411365e-1, -2.40075827716129, -2.54973253934373, 4.37466414146497,
    2.93816398269878,
  ];
  const d = [7.78469570904146e-3, 3.22467129084184e-1, 2.44513413714299, 3.75440866190742];
  const plow = 0.02425;
  const phigh = 1 - plow;
  let q;
  if (p < plow) {
    q = Math.sqrt(-2 * Math.log(p));
    return (((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]) / ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1);
  }
  if (phigh < p) {
    q = Math.sqrt(-2 * Math.log(1 - p));
    return -(((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]) / ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1);
  }
  q = p - 0.5;
  const r = q * q;
  return (((((a[0] * r + a[1]) * r + a[2]) * r + a[3]) * r + a[4]) * r + a[5]) * q / (((((b[0] * r + b[1]) * r + b[2]) * r + b[3]) * r + b[4]) * r + 1);
}

function pnorm(x) {
  return 0.5 * (1 + erf(x / Math.SQRT2));
}

function erf(x) {
  const sign = x < 0 ? -1 : 1;
  x = Math.abs(x);
  const a1 = 0.254829592;
  const a2 = -0.284496736;
  const a3 = 1.421413741;
  const a4 = -1.453152027;
  const a5 = 1.061405429;
  const p = 0.3275911;
  const t = 1 / (1 + p * x);
  const y = 1 - (((((a5 * t + a4) * t + a3) * t + a2) * t + a1) * t) * Math.exp(-x * x);
  return sign * y;
}

export function devigProbit(p1, p2) {
  if (!Number.isFinite(p1) || !Number.isFinite(p2)) return [NaN, NaN];
  const s = p1 + p2;
  if (s <= 1e-12) return [NaN, NaN];
  if (s <= 1) return devigMultiplicative(p1, p2);
  const eps = 1e-6;
  const a = clampProb(p1);
  const b = clampProb(p2);
  const x1 = qnorm(a);
  const x2 = qnorm(1 - b);
  const d = (x1 + x2) / 2;
  const p1f = pnorm(x1 - d);
  return [clampProb(p1f), clampProb(1 - p1f)];
}

export function devigShin(p1, p2) {
  if (!Number.isFinite(p1) || !Number.isFinite(p2)) return [NaN, NaN];
  const s = p1 + p2;
  if (s <= 1e-12) return [NaN, NaN];
  if (Math.abs(s - 1) < 1e-9) {
    const t = p1 + p2;
    return [p1 / t, p2 / t];
  }
  function fSum(z) {
    if (z <= 1e-12 || z >= 1 - 1e-12) return NaN;
    const den = 2 * (1 - z);
    const p1s = (Math.sqrt(z * z + 4 * (1 - z) * p1 * p1) - z) / den;
    const p2s = (Math.sqrt(z * z + 4 * (1 - z) * p2 * p2) - z) / den;
    return p1s + p2s - 1;
  }
  let lo = 1e-9;
  let hi = 1 - 1e-9;
  if (Number.isNaN(fSum(lo)) || Number.isNaN(fSum(hi))) return devigMultiplicative(p1, p2);
  for (let i = 0; i < 90; i++) {
    const mid = (lo + hi) / 2;
    const fs = fSum(mid);
    if (Number.isNaN(fs)) break;
    if (Math.abs(fs) < 1e-10) break;
    if (fs > 0) lo = mid;
    else hi = mid;
  }
  const z = (lo + hi) / 2;
  const den = 2 * (1 - z);
  let p1s = (Math.sqrt(z * z + 4 * (1 - z) * p1 * p1) - z) / den;
  let p2s = (Math.sqrt(z * z + 4 * (1 - z) * p2 * p2) - z) / den;
  const tot = p1s + p2s;
  if (tot <= 1e-12) return devigMultiplicative(p1, p2);
  p1s /= tot;
  p2s /= tot;
  const o1 = clampProb(p1s);
  const o2 = clampProb(p2s);
  const t = o1 + o2;
  return [o1 / t, o2 / t];
}

export function devigPower(p1, p2) {
  if (!Number.isFinite(p1) || !Number.isFinite(p2)) return [NaN, NaN];
  const s = p1 + p2;
  if (s <= 1e-12) return [NaN, NaN];
  if (s <= 1) return devigMultiplicative(p1, p2);
  let gLo = 1e-4;
  let gHi = 1;
  for (let i = 0; i < 60; i++) {
    const gm = (gLo + gHi) / 2;
    const val = p1 ** gm + p2 ** gm;
    if (val > 1) gHi = gm;
    else gLo = gm;
  }
  const g = (gLo + gHi) / 2;
  const d1 = p1 ** g;
  const d2 = p2 ** g;
  const tot = d1 + d2;
  if (tot <= 1e-12) return devigMultiplicative(p1, p2);
  let o1 = clampProb(d1 / tot);
  let o2 = clampProb(d2 / tot);
  const t = o1 + o2;
  return [o1 / t, o2 / t];
}

function fairProbsAllMethods(p1, p2) {
  return {
    multiplicative: devigMultiplicative(p1, p2)[0],
    additive: devigAdditive(p1, p2)[0],
    probit: devigProbit(p1, p2)[0],
    shin: devigShin(p1, p2)[0],
    power: devigPower(p1, p2)[0],
  };
}

export function devigTwoWay(p1, p2, method = "multiplicative") {
  switch (method) {
    case "multiplicative":
      return devigMultiplicative(p1, p2);
    case "additive":
      return devigAdditive(p1, p2);
    case "probit":
      return devigProbit(p1, p2);
    case "shin":
      return devigShin(p1, p2);
    case "power":
      return devigPower(p1, p2);
    default:
      return devigMultiplicative(p1, p2);
  }
}

export function devigTwoWayAggregate(p1, p2, method = "multiplicative") {
  if (!Number.isFinite(p1) || !Number.isFinite(p2)) return [NaN, NaN];
  const fp = fairProbsAllMethods(p1, p2);
  if (method === "worst_case") {
    let pick = "multiplicative";
    let minV = Infinity;
    for (const [k, v] of Object.entries(fp)) {
      if (Number.isFinite(v) && v < minV) {
        minV = v;
        pick = k;
      }
    }
    if (!Number.isFinite(minV)) return [NaN, NaN];
    return devigTwoWay(p1, p2, pick);
  }
  if (method === "average") {
    const vals = Object.values(fp).filter(Number.isFinite);
    if (!vals.length) return [NaN, NaN];
    let p1f = vals.reduce((a, b) => a + b, 0) / vals.length;
    p1f = clampProb(p1f);
    return [p1f, 1 - p1f];
  }
  return devigTwoWay(p1, p2, method);
}
