// Hypergeometric probability engine for TCG deck-drawing math.
//
// Models drawing without replacement from a fixed deck (e.g. a 40-card main
// deck or a 12-card rune deck). All combinatorics use BigInt so the counts are
// exact for realistic deck sizes; results are returned as Number decimals.
//
// Core distribution:
//   P(X = k) = C(K, k) * C(N - K, n - k) / C(N, n)
//   P(X >= k) = sum_{x=k}^{min(n, K)} P(X = x)
//
// Where:
//   N = total deck size (default 40)
//   K = copies of the target card / category in the deck (typically 1..4)
//   n = cards drawn (5-card opening hand, +1 per turn, ...)
//   k = desired minimum copies drawn

// Exact binomial coefficient C(n, k) as a BigInt.
export function combinations(n, k) {
  if (k < 0 || k > n || n < 0) return 0n
  if (k === 0 || k === n) return 1n
  const kk = Math.min(k, n - k)
  let num = 1n
  let den = 1n
  for (let i = 0; i < kk; i++) {
    num *= BigInt(n - i)
    den *= BigInt(i + 1)
  }
  return num / den
}

// Divide two BigInts into a Number. Exact for the deck sizes we target
// (products stay well under Number.MAX_SAFE_INTEGER for N <= ~52).
function ratio(numer, denom) {
  if (denom === 0n) return 0
  return Number(numer) / Number(denom)
}

// Validate and clamp the shared (N, K, n) inputs, throwing on nonsense.
function checkParams(N, K, n) {
  if (![N, K, n].every((v) => Number.isInteger(v) && v >= 0)) {
    throw new RangeError('N, K and n must be non-negative integers')
  }
  if (K > N) throw new RangeError(`K (${K}) cannot exceed N (${N})`)
  if (n > N) throw new RangeError(`n (${n}) cannot exceed N (${N})`)
}

/**
 * P(X = k): probability of drawing exactly `k` of the target.
 */
export function pmf(N, K, n, k) {
  checkParams(N, K, n)
  if (k < 0 || k > K || k > n || n - k > N - K) return 0
  return ratio(combinations(K, k) * combinations(N - K, n - k), combinations(N, n))
}

/**
 * P(X >= k): probability of drawing at least `k` of the target.
 */
export function atLeast(N, K, n, k) {
  checkParams(N, K, n)
  const lo = Math.max(0, k)
  const hi = Math.min(n, K)
  let sum = 0
  for (let x = lo; x <= hi; x++) sum += pmf(N, K, n, x)
  return Math.min(1, sum)
}

/**
 * P(X <= k): probability of drawing at most `k` of the target.
 */
export function atMost(N, K, n, k) {
  checkParams(N, K, n)
  const hi = Math.min(k, n, K)
  let sum = 0
  for (let x = 0; x <= hi; x++) sum += pmf(N, K, n, x)
  return Math.min(1, sum)
}

/**
 * P(X >= 1): probability of drawing at least one copy. Convenience wrapper.
 */
export function atLeastOne(N, K, n) {
  return atLeast(N, K, n, 1)
}

/**
 * Multivariate hypergeometric probability for several distinct categories drawn
 * from the same deck at once (e.g. two combo pieces in an opening hand).
 *
 * @param {number} N - deck size.
 * @param {number} n - cards drawn.
 * @param {Array<{name?: string, size: number, min?: number, exact?: number}>} categories
 *        Each category occupies `size` cards. `min` requires at least that many;
 *        `exact` requires exactly that many (overrides `min`).
 * @returns {number} probability that every category constraint is met together.
 */
export function multivariate(N, n, categories) {
  const cats = categories.map((c) => ({
    size: c.size,
    min: c.exact != null ? c.exact : c.min ?? 1,
    exact: c.exact != null ? c.exact : null,
  }))
  const totalCat = cats.reduce((s, c) => s + c.size, 0)
  const rest = N - totalCat
  if (rest < 0) throw new RangeError('Category sizes exceed deck size N')
  if (n > N) throw new RangeError(`n (${n}) cannot exceed N (${N})`)

  const denom = combinations(N, n)
  let favourable = 0n

  // Recursively enumerate every valid (x_1, ..., x_m) draw split.
  const walk = (idx, drawnSoFar, waysSoFar) => {
    if (idx === cats.length) {
      const remainder = n - drawnSoFar
      if (remainder < 0 || remainder > rest) return
      favourable += waysSoFar * combinations(rest, remainder)
      return
    }
    const c = cats[idx]
    const lo = c.exact != null ? c.exact : c.min
    const hi = c.exact != null ? c.exact : Math.min(c.size, n - drawnSoFar)
    for (let x = lo; x <= hi; x++) {
      if (x < 0 || x > c.size) continue
      walk(idx + 1, drawnSoFar + x, waysSoFar * combinations(c.size, x))
    }
  }
  walk(0, 0, 1n)

  return ratio(favourable, denom)
}

/**
 * Mulligan-to-hand ("London" style, full redraw): draw a fresh hand up to
 * `attempts` times and keep the first that has >= k targets. Each redraw is an
 * independent shuffle, so the odds compound.
 *
 * @returns {number} probability of eventually keeping a hand with >= k targets.
 */
export function mulliganFullRedraw({ N = 40, K, handSize = 4, k = 1, attempts = 2 }) {
  const perHand = atLeast(N, K, handSize, k)
  const failOnce = 1 - perHand
  return 1 - failOnce ** attempts
}

/**
 * Partial mulligan: draw `handSize`, keep every target you found, shuffle up to
 * `redraw` non-target cards back, and draw that many replacements from the
 * reduced deck. Odds are recalculated conditionally over the initial hit count.
 *
 * @returns {number} probability the final hand holds >= k targets.
 */
export function mulliganPartialRedraw({ N = 40, K, handSize = 4, redraw = 2, k = 1 }) {
  checkParams(N, K, handSize)
  let total = 0
  const maxInitial = Math.min(handSize, K)
  for (let h = 0; h <= handSize; h++) {
    const pInitial = pmf(N, K, handSize, h)
    if (pInitial === 0) continue
    if (h >= k) {
      total += pInitial // already satisfied, no redraw needed
      continue
    }
    if (h > maxInitial) continue
    const nonHits = handSize - h
    const r = Math.min(redraw, nonHits) // how many cards we actually swap
    if (r === 0) continue // nothing to redraw, hand stays a miss
    const kept = handSize - r
    const poolSize = N - kept // cards available to redraw from
    const targetsLeft = K - h // targets still in the pool
    const need = k - h // additional hits required from the redraw
    total += pInitial * atLeast(poolSize, targetsLeft, r, need)
  }
  return Math.min(1, total)
}

// --- Formatting --------------------------------------------------------

export function formatPercent(p, digits = 2) {
  return `${(p * 100).toFixed(digits)}%`
}

/**
 * Build a compact report for a single target across a draw.
 * @returns {{ params, exact: Array<{k, probability, percent}>, atLeast: Array<{k, probability, percent}> }}
 */
export function report(N, K, n, { maxK = K, digits = 2 } = {}) {
  const top = Math.min(maxK, K, n)
  const exact = []
  const cumulative = []
  for (let k = 0; k <= top; k++) {
    const pe = pmf(N, K, n, k)
    const pc = atLeast(N, K, n, k)
    exact.push({ k, probability: pe, percent: formatPercent(pe, digits) })
    cumulative.push({ k, probability: pc, percent: formatPercent(pc, digits) })
  }
  return { params: { N, K, n }, exact, atLeast: cumulative }
}
