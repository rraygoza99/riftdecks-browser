// Shared statistical helpers. Every page that shows or ranks a rate goes
// through these so "Wilson lower bound", "shrinkage" and "minimum sample" mean
// the same thing everywhere. Pure functions — safe for the browser and Node.

// z for a two-sided 95% interval.
export const Z95 = 1.959964

// Default minimum sample sizes. Pages expose a user-adjustable minimum that
// starts from these values; rows below it are faded/hidden, never ranked.
export const MIN_SAMPLE = {
  legendDecks: 10, // decks of a legend before its rates are ranked
  topCut: 10, // top-cut appearances before conversion is ranked
  cardDecks: 5, // decks in each group before a card lift is labelled
  matchup: 20, // head-to-head matches before a matchup is trusted unshrunk
  cluster: 4, // decks before a variant is reported
}

/**
 * Wilson score interval for k successes in n trials.
 * @returns {{ p: number, low: number, high: number, n: number, k: number }}
 */
export function wilsonInterval(k, n, z = Z95) {
  if (!n || n <= 0) return { p: 0, low: 0, high: 1, n: 0, k: 0 }
  const p = k / n
  const z2 = z * z
  const denom = 1 + z2 / n
  const centre = (p + z2 / (2 * n)) / denom
  const half = (z * Math.sqrt((p * (1 - p)) / n + z2 / (4 * n * n))) / denom
  return { p, low: Math.max(0, centre - half), high: Math.min(1, centre + half), n, k }
}

export function wilsonLower(k, n, z = Z95) {
  return wilsonInterval(k, n, z).low
}

/**
 * Bayesian (beta-binomial) shrinkage of k/n toward `priorMean` with a prior
 * worth `priorStrength` pseudo-trials. Small samples land near the mean.
 */
export function shrinkRate(k, n, priorMean, priorStrength) {
  const m = Math.max(0, priorStrength)
  if (n + m <= 0) return priorMean
  return (k + m * priorMean) / (n + m)
}

/**
 * Empirical-Bayes prior for a set of {k, n} groups via the method of moments
 * on a beta-binomial. Returns { mean, strength } where strength is the
 * pseudo-trial count (alpha + beta), clamped to [minStrength, maxStrength].
 */
export function estimateBetaPrior(groups, { minStrength = 2, maxStrength = 500 } = {}) {
  const valid = groups.filter((g) => g.n > 0)
  const K = valid.reduce((s, g) => s + g.k, 0)
  const N = valid.reduce((s, g) => s + g.n, 0)
  if (!N) return { mean: 0, strength: minStrength }
  const mean = K / N
  if (valid.length < 2 || mean <= 0 || mean >= 1) {
    return { mean, strength: clamp(20, minStrength, maxStrength) }
  }
  // Observed variance of group rates (weighted by n) vs the binomial part.
  let varObs = 0
  for (const g of valid) varObs += g.n * (g.k / g.n - mean) ** 2
  varObs /= N
  const avgN = N / valid.length
  const binomialPart = (mean * (1 - mean)) / avgN
  const between = varObs - binomialPart
  // No excess variance => groups look identical => strong prior.
  if (between <= 1e-9) return { mean, strength: maxStrength }
  const strength = (mean * (1 - mean)) / between - 1
  return { mean, strength: clamp(strength, minStrength, maxStrength) }
}

// Abramowitz–Stegun 7.1.26 erf approximation (|error| < 1.5e-7).
export function normalCdf(x) {
  const t = 1 / (1 + 0.3275911 * Math.abs(x) / Math.SQRT2)
  const y =
    1 -
    ((((1.061405429 * t - 1.453152027) * t + 1.421413741) * t - 0.284496736) * t + 0.254829592) *
      t *
      Math.exp(-(x * x) / 2)
  return x >= 0 ? (1 + y) / 2 : (1 - y) / 2
}

/**
 * Two-proportion z-test (pooled). Returns diff = p1 - p2, z and a two-sided
 * p-value. p = 1 when either group is empty or there is no variance.
 */
export function twoProportionTest(k1, n1, k2, n2) {
  if (!n1 || !n2) return { diff: 0, z: 0, p: 1, p1: n1 ? k1 / n1 : 0, p2: n2 ? k2 / n2 : 0 }
  const p1 = k1 / n1
  const p2 = k2 / n2
  const pool = (k1 + k2) / (n1 + n2)
  const se = Math.sqrt(pool * (1 - pool) * (1 / n1 + 1 / n2))
  if (se === 0) return { diff: p1 - p2, z: 0, p: 1, p1, p2 }
  const z = (p1 - p2) / se
  return { diff: p1 - p2, z, p: 2 * (1 - normalCdf(Math.abs(z))), p1, p2 }
}

/**
 * Exact two-sided binomial test p-value of observing k of n at rate p0.
 * Used for small personal samples (e.g. 3-7 vs a 46% field average).
 */
export function binomialTestP(k, n, p0) {
  if (!n) return 1
  const pmf = (i) => Math.exp(logChoose(n, i) + i * Math.log(p0) + (n - i) * Math.log(1 - p0))
  if (p0 <= 0) return k === 0 ? 1 : 0
  if (p0 >= 1) return k === n ? 1 : 0
  const observed = pmf(k)
  let total = 0
  for (let i = 0; i <= n; i++) {
    const v = pmf(i)
    if (v <= observed * (1 + 1e-7)) total += v
  }
  return Math.min(1, total)
}

function logChoose(n, k) {
  return logFactorial(n) - logFactorial(k) - logFactorial(n - k)
}

const LOG_FACT = [0]
function logFactorial(n) {
  for (let i = LOG_FACT.length; i <= n; i++) LOG_FACT[i] = LOG_FACT[i - 1] + Math.log(i)
  return LOG_FACT[n]
}

/**
 * Sample-size-aware ranking score for a rate. "wilson" uses the lower bound
 * of the 95% interval; "shrink" uses the posterior mean under `prior`.
 */
export function rankScore(k, n, { method = 'wilson', prior = null } = {}) {
  if (method === 'shrink' && prior) return shrinkRate(k, n, prior.mean, prior.strength)
  return wilsonLower(k, n)
}

// --- Formatting ------------------------------------------------------------

export function formatPct(value, digits = 1) {
  if (value == null || Number.isNaN(value)) return '—'
  return `${(value * 100).toFixed(digits)}%`
}

/** "7.7% · 2/26" — every rate shown to users carries its sample. */
export function formatRateN(k, n, digits = 1) {
  if (!n) return `— · 0/0`
  return `${formatPct(k / n, digits)} · ${k}/${n}`
}

/** "2.1–22.8%" for a Wilson interval. */
export function formatInterval(k, n, digits = 1) {
  const { low, high } = wilsonInterval(k, n)
  return `${(low * 100).toFixed(digits)}–${(high * 100).toFixed(digits)}%`
}

/** 1st, 2nd, 3rd, 4th … 11th, 12th, 13th … 21st, 22nd, 23rd … 32nd, 101st, 111th. */
export function ordinal(n) {
  if (n == null || !Number.isFinite(Number(n))) return '—'
  const v = Math.trunc(Number(n))
  const mod100 = Math.abs(v) % 100
  const mod10 = Math.abs(v) % 10
  if (mod100 >= 11 && mod100 <= 13) return `${v}th`
  if (mod10 === 1) return `${v}st`
  if (mod10 === 2) return `${v}nd`
  if (mod10 === 3) return `${v}rd`
  return `${v}th`
}

// --- Descriptive helpers ---------------------------------------------------

export function clamp(v, lo, hi) {
  return Math.min(hi, Math.max(lo, v))
}

export function mean(values) {
  if (!values.length) return 0
  return values.reduce((a, b) => a + b, 0) / values.length
}

export function quantile(values, q) {
  if (!values.length) return 0
  const s = [...values].sort((a, b) => a - b)
  const pos = (s.length - 1) * clamp(q, 0, 1)
  const lo = Math.floor(pos)
  const hi = Math.ceil(pos)
  return s[lo] + (s[hi] - s[lo]) * (pos - lo)
}

export function median(values) {
  return quantile(values, 0.5)
}

/** Least-squares slope and intercept for [{x, y}] points. */
export function linearFit(points) {
  const n = points.length
  if (n < 2) return { slope: 0, intercept: n ? points[0].y : 0 }
  const mx = mean(points.map((p) => p.x))
  const my = mean(points.map((p) => p.y))
  let num = 0
  let den = 0
  for (const p of points) {
    num += (p.x - mx) * (p.y - my)
    den += (p.x - mx) ** 2
  }
  const slope = den ? num / den : 0
  return { slope, intercept: my - slope * mx }
}

/** Pearson correlation; null when either side has no variance. */
export function pearson(xs, ys) {
  const n = Math.min(xs.length, ys.length)
  if (n < 3) return null
  const mx = mean(xs.slice(0, n))
  const my = mean(ys.slice(0, n))
  let sxy = 0
  let sxx = 0
  let syy = 0
  for (let i = 0; i < n; i++) {
    sxy += (xs[i] - mx) * (ys[i] - my)
    sxx += (xs[i] - mx) ** 2
    syy += (ys[i] - my) ** 2
  }
  if (!sxx || !syy) return null
  return sxy / Math.sqrt(sxx * syy)
}

function ranks(values) {
  const idx = values.map((v, i) => [v, i]).sort((a, b) => a[0] - b[0])
  const r = new Array(values.length)
  for (let i = 0; i < idx.length; ) {
    let j = i
    while (j + 1 < idx.length && idx[j + 1][0] === idx[i][0]) j++
    const avg = (i + j) / 2 + 1
    for (let t = i; t <= j; t++) r[idx[t][1]] = avg
    i = j + 1
  }
  return r
}

/** Spearman rank correlation (Pearson on average ranks). */
export function spearman(xs, ys) {
  return pearson(ranks(xs), ranks(ys))
}

/**
 * Two-sided p-value for a correlation coefficient r over n pairs, using the
 * t-distribution approximated by a normal for n > 30 and a Fisher z otherwise.
 */
export function correlationPValue(r, n) {
  if (r == null || n < 4) return 1
  const z = Math.atanh(clamp(r, -0.999999, 0.999999)) * Math.sqrt(n - 3)
  return 2 * (1 - normalCdf(Math.abs(z)))
}

/** Event-size weight: larger events count more, with diminishing returns. */
export function eventWeight(players) {
  return Math.log2(Math.max(2, players || 2))
}

/**
 * Weighted (multiset) Jaccard similarity between two count maps:
 * sum(min) / sum(max). 1 = identical lists, 0 = nothing shared.
 */
export function weightedJaccard(a, b) {
  let mins = 0
  let maxs = 0
  const keys = new Set([...a.keys(), ...b.keys()])
  for (const k of keys) {
    const x = a.get(k) || 0
    const y = b.get(k) || 0
    mins += Math.min(x, y)
    maxs += Math.max(x, y)
  }
  return maxs ? mins / maxs : 1
}

// Deterministic PRNG (mulberry32) for reproducible clustering / simulation.
export function seededRng(seed = 1) {
  let a = seed >>> 0
  return function rng() {
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}
