// Token Radar's value model (radar-3): the sealed snapshot in, a ranked board out.
//
// The board ranks every pre-token protocol the snapshot can see: the 40 on the house watchlist
// (the floor), every other rankable protocol below the floor, and the rankable protocols above
// the floor the watchlist leaves out. A protocol is pre-token when its DefiLlama record carries
// no market cap, no CoinGecko id and no symbol. Live-token protocols are kept apart and shown
// at the market's own value, never mixed into the ranked board.
//
// Implied value is a fitted comps model, not a median and not a list of names:
//
//   fitted  = 10^(a + b * log10(TVL))            -- OLS on the live-token comps, one per ticker
//   maturity = 0.85 + 0.25 * min(age, 1095)/1095 -- older with no token, closer to a launch
//   growth   = 1 + clamp(change_7d, -30, 60)/100 * 0.25
//   implied  = fitted * maturity * growth, with implied/TVL clamped to [0.01, 5]
//
// The fit is the market's own price of size: the slope is below 1, so a dollar of TVL is worth
// less at a giant protocol than at a small one -- the median multiple (radar-2) priced every
// dollar of TVL the same and so overpriced the giants. The tilts are small on purpose (at most
// +10% and +15%): they keep the board from being a TVL sort without letting a hot week or an
// old listing dominate the fitted value.
//
// The program validates the model on the snapshot itself and ships the numbers in the dashboard:
// leave-one-out over the 128 comps (the fitted value against the median-multiple baseline),
// and a cohort check that fits on the protocols listed before a date and tests on the ones
// listed after it. The validation is honest about its limits: launch values are uncertain --
// the typical prediction lands within about 2x of the truth -- and the ranking is the claim,
// not a promise that any token launches, or when.

/** One protocol entry, exactly the ten fields the sealed snapshot carries. */
export interface SnapshotProtocol {
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  change_7d: number | null;
  mcap_usd: number | null;
  listed_at: string | null;
  gecko_id: string | null;
  symbol: string | null;
}

/** The whole snapshot document. */
export interface Snapshot {
  as_of: string;
  source: string;
  floor_usd: number;
  protocols: SnapshotProtocol[];
  watchlist: string[];
}

/** The model's constants, as the dashboard states them and the sandbox may change them. */
export interface ModelConstants {
  /** Growth tilt: implied *= 1 + clamp(change_7d, growth_floor, growth_cap)/100 * growth_weight. */
  growth_weight: number;
  growth_floor: number;
  growth_cap: number;
  /** Maturity tilt: maturity_floor + maturity_range * min(age, maturity_days)/maturity_days. */
  maturity_floor: number;
  maturity_range: number;
  maturity_days: number;
  unknown_age_days: number;
  /** Guardrail on the fitted value: implied/TVL stays inside [ratio_floor, ratio_cap]. */
  ratio_floor: number;
  ratio_cap: number;
  /** The old median-multiple rule, kept so the dashboard can show what it would have said. */
  multiple_floor: number;
  multiple_cap: number;
  min_live_for_category: number;
}

export const MODEL: ModelConstants = {
  growth_weight: 0.25,
  growth_floor: -30,
  growth_cap: 60,
  maturity_floor: 0.85,
  maturity_range: 0.25,
  maturity_days: 1095,
  unknown_age_days: 365,
  ratio_floor: 0.01,
  ratio_cap: 5,
  multiple_floor: 0.05,
  multiple_cap: 1.5,
  min_live_for_category: 3,
};

/** The model's version label: the dashboard names it. */
export const MODEL_VERSION = 'radar-3';

/** How many live-token protocols the dashboard's "Already trading" view carries, by market cap. */
export const LIVE_ROWS = 24;

/** A farm step: the action, what it costs, and how long it takes. */
export interface FarmStep {
  text: string;
  cost: string;
  time: string;
}

/** One row of board.json: the ranked board's row. */
export interface BoardRow {
  rank: number;
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  change_7d: number | null;
  mcap_usd: number | null;
  listed_at: string | null;
  gecko_id: string | null;
  symbol: string | null;
  token_status: 'pre-token';
  on_watchlist: boolean;
  /** 'watchlist' | 'early' (below the floor) | 'off-watchlist' (above the floor, not listed). */
  board_group: 'watchlist' | 'early' | 'off-watchlist';
  age_days: number | null;
  implied_value_usd: number;
  model: {
    fitted_value_usd: number;
    median_value_usd: number;
    maturity_multiplier: number;
    growth_multiplier: number;
    plausible_low_usd: number;
    plausible_high_usd: number;
    age_days: number | null;
  };
  farm: {
    capital_usd: number;
    gas_usd: number;
    days: number;
  };
  farm_steps: string[];
}

/** The dashboard's view of one board row; farm_steps travel with it so the page and the board agree. */
export interface RadarRow extends BoardRow {}

/** A live-token protocol: it already trades, so the board shows the market's own value, not a model's. */
export interface LiveRow {
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  mcap_usd: number | null;
  change_7d: number | null;
}

/** One category's market multiple, as the dashboard's method table shows it. */
export interface CategoryMultiple {
  category: string;
  live_count: number;
  multiple: number;
  fallback: boolean;
}

/** The fitted comps line: log10(market cap) = intercept + slope * log10(TVL). */
export interface CompsFit {
  intercept: number;
  slope: number;
  n_comps: number;
  residual_sd_dex: number;
}

/** One validation run: the same four numbers for the fitted model and the median baseline. */
export interface ValidationRun {
  label: string;
  n_test: number;
  fitted_log_r2: number;
  fitted_log_mae_dex: number;
  fitted_median_ape: number;
  fitted_spearman: number;
  fitted_top10: number;
  median_log_r2: number;
  median_median_ape: number;
  median_spearman: number;
  median_top10: number;
}

/** The model's own validation, computed from the snapshot and shipped in data.js. */
export interface ModelValidation {
  fit: CompsFit;
  loo: ValidationRun;
  cohorts: ValidationRun[];
}

/** Everything the dashboard renders, from the snapshot. */
export interface RadarData {
  as_of: string;
  source: string;
  floor_usd: number;
  model: ModelConstants;
  model_version: string;
  watchlist_size: number;
  board_size: number;
  early_size: number;
  off_watchlist_size: number;
  live_size: number;
  pre_token_count: number;
  total_protocols: number;
  total_implied_usd: number;
  global_multiple: number;
  category_multiples: CategoryMultiple[];
  validation: ModelValidation;
  rows: RadarRow[];
  live: LiveRow[];
}

/** Why the snapshot is not one this model can score. */
export class SnapshotError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SnapshotError';
  }
}

const DAY_MS = 86_400_000;

/** A finite number, else `fallback`. */
function finite(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

/** The median of a non-empty list of numbers; null when empty. */
function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1 ? sorted[mid]! : (sorted[mid - 1]! + sorted[mid]!) / 2;
}

const round4 = (n: number): number => Math.round(n * 1e4) / 1e4;

/** A whole day count from `from` to `to`, clamped at zero; null when either date is absent or bad. */
export function ageDays(asOf: string, listedAt: string | null): number | null {
  if (listedAt === null) return null;
  const a = Date.parse(`${asOf}T00:00:00Z`);
  const b = Date.parse(`${listedAt}T00:00:00Z`);
  if (!Number.isFinite(a) || !Number.isFinite(b)) return null;
  return Math.max(0, Math.floor((a - b) / DAY_MS));
}

/** DefiLlama's version-marker rule: a name ending in a release is a pool of another protocol. */
const VERSIONED = /\s(V\d+(\.\d+)?|v\d+(\.\d+)?|\d+\.\d+)$/;

/** Categories that mark a wrapped, staked or bridged product of a token that already trades. */
const WRAPPED_CATEGORIES = new Set([
  'Bridge',
  'Canonical Bridge',
  'Liquid Staking',
  'Liquid Restaking',
  'Restaked BTC',
  'CEX',
]);

/** Exchange names a protocol name must not begin with (the house watchlist rule). */
const EXCHANGE_PREFIX = /^(Binance|Coinbase|Bybit|Kraken|Bitget|OKX|Bitfinex|Gemini)\b/;

/** A whole word wrapped, staked or staking anywhere in the name. */
const WRAPPED_WORD = /\bwrapped\b|\bstaked\b|\bstaking\b/i;

/** Whether a protocol records no token at all. */
export function isPreToken(p: SnapshotProtocol): boolean {
  return p.mcap_usd === null && p.gecko_id === null && p.symbol === null;
}

/** Whether a protocol is one the board may rank: pre-token, and not a wrapped, staked, bridged or exchange product. */
export function isRankable(p: SnapshotProtocol): boolean {
  if (!isPreToken(p)) return false;
  if (p.category !== null && WRAPPED_CATEGORIES.has(p.category)) return false;
  if (VERSIONED.test(p.name)) return false;
  if (WRAPPED_WORD.test(p.name)) return false;
  if (EXCHANGE_PREFIX.test(p.name)) return false;
  return true;
}

/**
 * The live-token comps: one protocol per ticker (the largest TVL where a ticker repeats),
 * a positive market cap and a positive TVL. Dead tokens (market cap 0 or below) are not comps:
 * their price is not a market price.
 */
export function liveComps(snapshot: Snapshot): SnapshotProtocol[] {
  const byTicker = new Map<string, SnapshotProtocol>();
  const untickered: SnapshotProtocol[] = [];
  for (const p of snapshot.protocols) {
    if (isPreToken(p) || !(p.mcap_usd ?? 0) || (p.mcap_usd ?? 0) <= 0 || !(p.tvl_usd > 0)) continue;
    if (p.symbol) {
      const prev = byTicker.get(p.symbol);
      if (prev === undefined || p.tvl_usd > prev.tvl_usd) byTicker.set(p.symbol, p);
    } else {
      untickered.push(p);
    }
  }
  return [...byTicker.values(), ...untickered];
}

/** Ordinary least squares for one regressor: y = a + b*x, returned as [a, b]. */
function ols1(xs: number[], ys: number[]): [number, number] {
  const n = xs.length;
  const mx = xs.reduce((s, v) => s + v, 0) / n;
  const my = ys.reduce((s, v) => s + v, 0) / n;
  let sxy = 0;
  let sxx = 0;
  for (let i = 0; i < n; i++) {
    sxy += (xs[i]! - mx) * (ys[i]! - my);
    sxx += (xs[i]! - mx) * (xs[i]! - mx);
  }
  const b = sxx === 0 ? 0 : sxy / sxx;
  return [my - b * mx, b];
}

/** The comps fit: log10(market cap) on log10(TVL) over the live-token comps. */
export function fitComps(comps: SnapshotProtocol[]): CompsFit {
  const xs = comps.map((p) => Math.log10(p.tvl_usd));
  const ys = comps.map((p) => Math.log10(p.mcap_usd!));
  const [intercept, slope] = ols1(xs, ys);
  const ss = ys.reduce((s, y, i) => s + (y - (intercept + slope * xs[i]!)) ** 2, 0);
  return { intercept, slope, n_comps: comps.length, residual_sd_dex: Math.sqrt(ss / comps.length) };
}

/** The market multiples: one per category with enough live examples, else the global median. */
export function marketMultiples(snapshot: Snapshot, model: ModelConstants): { global: number; byCategory: Map<string, number>; table: CategoryMultiple[] } {
  const live = snapshot.protocols.filter((p) => !isPreToken(p) && p.tvl_usd > 0 && (p.mcap_usd ?? 0) > 0);
  const globalRaw = median(live.map((p) => p.mcap_usd! / p.tvl_usd)) ?? 0.2;
  const global = clampMultiple(globalRaw, model);
  const perCategory = new Map<string, number[]>();
  for (const p of live) {
    const key = p.category ?? 'Uncategorized';
    const arr = perCategory.get(key) ?? [];
    arr.push(p.mcap_usd! / p.tvl_usd);
    perCategory.set(key, arr);
  }
  const byCategory = new Map<string, number>();
  const table: CategoryMultiple[] = [];
  for (const [category, ratios] of [...perCategory.entries()].sort((a, b) => (a[0] < b[0] ? -1 : 1))) {
    if (ratios.length >= model.min_live_for_category) {
      const m = clampMultiple(median(ratios)!, model);
      byCategory.set(category, m);
      table.push({ category, live_count: ratios.length, multiple: m, fallback: false });
    }
  }
  return { global, byCategory, table };
}

function clampMultiple(value: number, model: ModelConstants): number {
  return Math.min(model.multiple_cap, Math.max(model.multiple_floor, value));
}

/** The two tilts one protocol gets: maturity from its age, growth from its 7-day change. */
export function tilts(protocol: SnapshotProtocol, asOf: string, model: ModelConstants): { maturity: number; growth: number; age: number | null } {
  const age = ageDays(asOf, protocol.listed_at);
  const ageForModel = age ?? model.unknown_age_days;
  const maturity = model.maturity_floor + (Math.min(Math.max(ageForModel, 0), model.maturity_days) / model.maturity_days) * model.maturity_range;
  const rawGrowth = finite(protocol.change_7d, 0);
  const growthPct = Math.min(model.growth_cap, Math.max(model.growth_floor, rawGrowth));
  const growth = 1 + (growthPct / 100) * model.growth_weight;
  return { maturity, growth, age };
}

/** The multipliers and the implied value one protocol gets under `model`. */
export function impliedValue(
  protocol: SnapshotProtocol,
  asOf: string,
  model: ModelConstants,
  fit: CompsFit,
  multiples: { global: number; byCategory: Map<string, number> },
): { implied: number; fitted: number; medianValue: number; maturityMult: number; growthMult: number; age: number | null } {
  const { maturity, growth, age } = tilts(protocol, asOf, model);
  const fittedRaw = 10 ** (fit.intercept + fit.slope * Math.log10(protocol.tvl_usd));
  const fitted = Math.max(1, Math.round(fittedRaw));
  const multiple = multiples.byCategory.get(protocol.category ?? 'Uncategorized') ?? multiples.global;
  const medianValue = Math.max(1, Math.round(protocol.tvl_usd * multiple));
  const ratioClamped = Math.min(model.ratio_cap, Math.max(model.ratio_floor, (fittedRaw * maturity * growth) / protocol.tvl_usd));
  const implied = Math.max(1, Math.round(protocol.tvl_usd * ratioClamped));
  return { implied, fitted, medianValue, maturityMult: maturity, growthMult: growth, age };
}

/** Spearman's rank correlation between two equal-length lists. */
function spearman(a: number[], b: number[]): number {
  const ranks = (v: number[]): number[] => {
    const order = v.map((_, i) => i).sort((i, j) => v[i]! - v[j]!);
    const r = new Array<number>(v.length);
    order.forEach((idx, rank) => {
      r[idx] = rank;
    });
    return r;
  };
  const ra = ranks(a);
  const rb = ranks(b);
  const n = a.length;
  const ma = ra.reduce((s, v) => s + v, 0) / n;
  const mb = rb.reduce((s, v) => s + v, 0) / n;
  let cov = 0;
  let sa = 0;
  let sb = 0;
  for (let i = 0; i < n; i++) {
    cov += (ra[i]! - ma) * (rb[i]! - mb);
    sa += (ra[i]! - ma) ** 2;
    sb += (rb[i]! - mb) ** 2;
  }
  return sa === 0 || sb === 0 ? 0 : cov / Math.sqrt(sa * sb);
}

/** How many of the true top 10 by market cap the predictions also put in their top 10. */
function top10Overlap(truth: number[], pred: number[]): number {
  const top = (v: number[]): Set<number> => new Set(v.map((_, i) => i).sort((i, j) => v[j]! - v[i]!).slice(0, 10));
  const t = top(truth);
  const p = top(pred);
  let n = 0;
  for (const i of p) if (t.has(i)) n++;
  return n;
}

interface ValidationMetrics {
  log_r2: number;
  log_mae_dex: number;
  median_ape: number;
  spearman: number;
  top10: number;
}

/** The four numbers for one set of true vs predicted log market caps. */
function validationMetrics(truth: number[], pred: number[]): ValidationMetrics {
  const n = truth.length;
  const mean = truth.reduce((s, v) => s + v, 0) / n;
  let ssTot = 0;
  let ssRes = 0;
  let absErr = 0;
  const apes: number[] = [];
  for (let i = 0; i < n; i++) {
    ssTot += (truth[i]! - mean) ** 2;
    ssRes += (truth[i]! - pred[i]!) ** 2;
    absErr += Math.abs(truth[i]! - pred[i]!);
    apes.push(Math.abs(10 ** pred[i]! - 10 ** truth[i]!) / 10 ** truth[i]!);
  }
  apes.sort((a, b) => a - b);
  const mid = Math.floor(n / 2);
  const medianApe = n % 2 === 1 ? apes[mid]! : (apes[mid - 1]! + apes[mid]!) / 2;
  return {
    log_r2: ssTot === 0 ? 0 : 1 - ssRes / ssTot,
    log_mae_dex: absErr / n,
    median_ape: medianApe,
    spearman: spearman(truth, pred),
    top10: top10Overlap(truth, pred),
  };
}

/** One validation run: fit on `train`, test on `test`, for the fitted model and the median baseline. */
function validationRun(label: string, train: SnapshotProtocol[], test: SnapshotProtocol[], snapshot: Snapshot, model: ModelConstants): ValidationRun | null {
  if (train.length < 20 || test.length < 5) return null;
  const fit = fitComps(train);
  const multiples = marketMultiples({ ...snapshot, protocols: train }, model);
  const truth: number[] = [];
  const fittedPred: number[] = [];
  const medianPred: number[] = [];
  for (const p of test) {
    const t = Math.log10(p.mcap_usd!);
    truth.push(t);
    const v = impliedValue(p, snapshot.as_of, model, fit, multiples);
    fittedPred.push(Math.log10(Math.max(1, v.implied)));
    medianPred.push(Math.log10(Math.max(1, v.medianValue)));
  }
  const f = validationMetrics(truth, fittedPred);
  const m = validationMetrics(truth, medianPred);
  return {
    label,
    n_test: test.length,
    fitted_log_r2: round4(f.log_r2),
    fitted_log_mae_dex: round4(f.log_mae_dex),
    fitted_median_ape: round4(f.median_ape),
    fitted_spearman: round4(f.spearman),
    fitted_top10: f.top10,
    median_log_r2: round4(m.log_r2),
    median_median_ape: round4(m.median_ape),
    median_spearman: round4(m.spearman),
    median_top10: m.top10,
  };
}

/** The model's validation: leave-one-out over the comps, plus a cohort check on three dates. */
export function validateModel(snapshot: Snapshot, model: ModelConstants, comps: SnapshotProtocol[]): ModelValidation {
  const fit = fitComps(comps);
  // Leave-one-out: refit without each comp in turn, predict it.
  const truth: number[] = [];
  const fittedPred: number[] = [];
  const medianPred: number[] = [];
  for (let i = 0; i < comps.length; i++) {
    const train = comps.filter((_, j) => j !== i);
    const p = comps[i]!;
    const f = fitComps(train);
    const multiples = marketMultiples({ ...snapshot, protocols: train }, model);
    const v = impliedValue(p, snapshot.as_of, model, f, multiples);
    truth.push(Math.log10(p.mcap_usd!));
    fittedPred.push(Math.log10(Math.max(1, v.implied)));
    medianPred.push(Math.log10(Math.max(1, v.medianValue)));
  }
  const fl = validationMetrics(truth, fittedPred);
  const ml = validationMetrics(truth, medianPred);
  const loo: ValidationRun = {
    label: 'Leave-one-out',
    n_test: comps.length,
    fitted_log_r2: round4(fl.log_r2),
    fitted_log_mae_dex: round4(fl.log_mae_dex),
    fitted_median_ape: round4(fl.median_ape),
    fitted_spearman: round4(fl.spearman),
    fitted_top10: fl.top10,
    median_log_r2: round4(ml.log_r2),
    median_median_ape: round4(ml.median_ape),
    median_spearman: round4(ml.spearman),
    median_top10: ml.top10,
  };
  // Cohort check: fit on the protocols listed before a date, test on the ones listed after it.
  const dated = comps.filter((p) => p.listed_at !== null);
  const cohorts: ValidationRun[] = [];
  for (const cut of ['2024-01-01', '2024-07-01', '2025-01-01']) {
    const train = dated.filter((p) => p.listed_at! < cut);
    const test = dated.filter((p) => p.listed_at! >= cut);
    const run = validationRun(`Listed after ${cut}`, train, test, snapshot, model);
    if (run !== null) cohorts.push(run);
  }
  return { fit: { intercept: round4(fit.intercept), slope: round4(fit.slope), n_comps: fit.n_comps, residual_sd_dex: round4(fit.residual_sd_dex) }, loo, cohorts };
}

/** The snapshot's protocol by slug. */
function bySlug(protocols: SnapshotProtocol[]): Map<string, SnapshotProtocol> {
  return new Map(protocols.map((p) => [p.slug, p]));
}

/** The protocols the board ranks, strongest first, with ranks 1..n. */
export function buildBoard(snapshot: Snapshot, model: ModelConstants = MODEL): { board: BoardRow[]; multiples: { global: number; byCategory: Map<string, number>; table: CategoryMultiple[] }; fit: CompsFit; validation: ModelValidation } {
  const comps = liveComps(snapshot);
  const fit = fitComps(comps);
  const validation = validateModel(snapshot, model, comps);
  const multiples = marketMultiples(snapshot, model);
  const index = bySlug(snapshot.protocols);
  const chosen = new Map<string, SnapshotProtocol>();
  // The watchlist is the floor: every slug it names, even one the snapshot no longer carries.
  for (const slug of snapshot.watchlist) {
    const p = index.get(slug);
    if (p !== undefined) chosen.set(slug, p);
  }
  // The early radar: rankable pre-token protocols below the watchlist floor, by TVL.
  // Above the floor, a protocol the watchlist leaves out is ranked too: the house's own guide
  // says a protocol the list leaves out is no worse a subject than one on it -- the snapshot
  // cannot show DefiLlama's parent record, so those rows carry an off-watchlist mark and the
  // dashboard says plainly that the record cannot rule out a parent protocol for them.
  for (const p of snapshot.protocols) {
    if (!chosen.has(p.slug) && isRankable(p)) chosen.set(p.slug, p);
  }
  const watch = new Set(snapshot.watchlist);
  const halfBand = 10 ** (0.6745 * fit.residual_sd_dex);
  const scored = [...chosen.values()].map((p) => {
    const v = impliedValue(p, snapshot.as_of, model, fit, multiples);
    return { p, ...v };
  });
  scored.sort((a, b) => b.implied - a.implied || (a.p.slug < b.p.slug ? -1 : a.p.slug > b.p.slug ? 1 : 0));
  const board = scored.map((s, i) => {
    const group: BoardRow['board_group'] = watch.has(s.p.slug) ? 'watchlist' : s.p.tvl_usd >= snapshot.floor_usd ? 'off-watchlist' : 'early';
    const farm = farmBudget(s.p, s.age);
    return {
      rank: i + 1,
      slug: s.p.slug,
      name: s.p.name,
      category: s.p.category,
      chains: s.p.chains,
      tvl_usd: s.p.tvl_usd,
      change_7d: s.p.change_7d,
      mcap_usd: s.p.mcap_usd,
      listed_at: s.p.listed_at,
      gecko_id: s.p.gecko_id,
      symbol: s.p.symbol,
      token_status: 'pre-token' as const,
      on_watchlist: watch.has(s.p.slug),
      board_group: group,
      age_days: s.age,
      implied_value_usd: s.implied,
      model: {
        fitted_value_usd: s.fitted,
        median_value_usd: s.medianValue,
        maturity_multiplier: round4(s.maturityMult),
        growth_multiplier: round4(s.growthMult),
        plausible_low_usd: Math.max(1, Math.round(s.implied / halfBand)),
        plausible_high_usd: Math.round(s.implied * halfBand),
        age_days: s.age,
      },
      farm,
      farm_steps: farmSteps(s.p, s.age).map(stepText),
    };
  });
  return { board, multiples, fit, validation };
}

/** A step as one string: its action, then its cost and time, within the gate's 20..600 characters. */
export function stepText(step: FarmStep): string {
  let s = `${step.text} Cost: ${step.cost}. Time: ${step.time}.`;
  if (s.length > 600) s = `${s.slice(0, 596)}...`;
  if (s.length < 20) s = `${s} Hold the position and check the protocol's own page.`;
  return s;
}

/** The first chain a protocol names, or a neutral phrase. */
function chainOf(p: SnapshotProtocol): string {
  return p.chains.length > 0 ? p.chains[0]! : 'its main chain';
}

/** How much capital one farm position needs, from the protocol's own TVL. */
function capitalFor(p: SnapshotProtocol): number {
  if (p.tvl_usd >= 5_000_000_000) return 250;
  if (p.tvl_usd >= 1_000_000_000) return 150;
  if (p.tvl_usd >= 100_000_000) return 100;
  return 50;
}

/** How long to hold, from the protocol's age: younger protocols get a longer qualifying window. */
function holdDaysFor(age: number | null): number {
  if (age === null) return 30;
  if (age < 180) return 60;
  if (age < 365) return 45;
  return 30;
}

/** The farm's budget: capital in the position, gas across the steps, and the hold in days. */
export function farmBudget(p: SnapshotProtocol, age: number | null): { capital_usd: number; gas_usd: number; days: number } {
  const capital = capitalFor(p);
  const hold = holdDaysFor(age);
  const setupGas = capital >= 150 ? 8 : 4;
  const weeklyGas = 2 * Math.ceil(hold / 7);
  return { capital_usd: capital, gas_usd: 3 + setupGas + weeklyGas, days: hold };
}

/** The category's one action, in the words a farmer can follow. */
function actionFor(p: SnapshotProtocol, capital: number, chain: string): string {
  const c = (p.category ?? '').toLowerCase();
  const name = p.name;
  if (c.includes('lend') || c.includes('cdp') || c.includes('collateral')) return `Supply $${capital} of USDC to ${name} on ${chain} and keep the position open so it counts as a lender.`;
  if (c.includes('dex') || c.includes('yield') || c.includes('leveraged farm')) return `Provide $${capital} of liquidity to ${name}'s main pool on ${chain} and keep the position open.`;
  if (c.includes('bridge')) return `Bridge $${capital} of USDC to ${chain} through ${name} and use the bridged funds inside its app.`;
  if (c.includes('staking') || c.includes('restak')) return `Stake $${capital} of the chain's staking asset through ${name} and keep the receipt token.`;
  if (c.includes('perpetual') || c.includes('derivative')) return `Deposit $${capital} of USDC as margin on ${name} and open one small hedged position.`;
  if (c.includes('prediction')) return `Fund $${capital} and place one market position on ${name}, then leave the winnings in the account.`;
  if (c.includes('curator') || c.includes('allocator')) return `Deposit $${capital} into a ${name} vault on ${chain} and keep the vault shares.`;
  if (c.includes('stable')) return `Mint or deposit $${capital} of the stable asset through ${name} on ${chain}.`;
  if (c.includes('rwa')) return `Mint $${capital} of the protocol's yield-bearing asset on ${chain} and hold it.`;
  if (c.includes('insurance')) return `Buy $${capital} of cover from ${name} on ${chain} and keep the policy active.`;
  if (c.includes('basis')) return `Deposit $${capital} of USDC into ${name}'s basis vault on ${chain} and keep the position open.`;
  if (c.includes('prediction') || c.includes('market')) return `Fund $${capital} and place one position on ${name}.`;
  return `Deposit $${capital} of USDC into ${name} on ${chain} and keep the position open.`;
}

/** A second, category-flavoured weekly action so the plan is not one action repeated. */
function weeklyActionFor(p: SnapshotProtocol): string {
  const c = (p.category ?? '').toLowerCase();
  if (c.includes('lend') || c.includes('cdp')) return 'a deposit, a borrow or a repayment';
  if (c.includes('dex') || c.includes('yield')) return 'a swap, a deposit or a liquidity rebalance';
  if (c.includes('bridge')) return 'a bridge transfer or a swap on the destination chain';
  if (c.includes('perpetual') || c.includes('derivative')) return 'a trade, a funding payment or a margin top-up';
  if (c.includes('curator') || c.includes('allocator')) return 'a vault deposit, a rebalance vote or a claim';
  if (c.includes('prediction')) return 'a market position or a resolution check';
  return 'a deposit, a swap, a vote or a claim';
}

/**
 * A protocol's farm plan: six steps, each an action with a cost and a time, plus a seventh
 * for a protocol on more than one chain (farm the second chain too: airdrops have paid the
 * second chain before). The plan is derived from the protocol's own record (category, chains,
 * TVL, age), never from a hand-written list.
 */
export function farmSteps(p: SnapshotProtocol, age: number | null): FarmStep[] {
  const chain = chainOf(p);
  const capital = capitalFor(p);
  const hold = holdDaysFor(age);
  const action = actionFor(p, capital, chain);
  const weekly = weeklyActionFor(p);
  const steps: FarmStep[] = [
    {
      text: `Open ${p.name} on ${chain} from its own site, connect a fresh wallet that holds only the funds you plan to farm, and keep its seed phrase offline.`,
      cost: 'under $3 of gas for the first transaction',
      time: '5 minutes',
    },
    {
      text: action,
      cost: `$${capital} of capital and about $${capital >= 150 ? 8 : 4} of gas`,
      time: '15 minutes to set up',
    },
    {
      text: `Do one qualifying action each week, such as ${weekly}, so the wallet shows steady use instead of a single deposit.`,
      cost: 'about $2 of gas a week',
      time: '10 minutes a week',
    },
    {
      text: `Hold the position for at least ${hold} days so the activity is counted in more than one snapshot.`,
      cost: `the $${capital} stays in the position`,
      time: `${hold} days`,
    },
    {
      text: `Before you withdraw, open the protocol's own points or rewards page and claim only from the link it publishes, never from a link in a message.`,
      cost: 'no fee to check, and never pay to claim',
      time: '10 minutes',
    },
    {
      text: `Write the wallet, the dates and every transaction in a farm log so you can repeat the position, or unwind it, without guessing.`,
      cost: 'nothing but the log',
      time: '5 minutes',
    },
  ];
  if (p.chains.length > 1) {
    const second = p.chains[1]!;
    steps.push({
      text: `Repeat the core deposit on ${second} as well, with half the capital, because a second chain is a second activity record for the same wallet.`,
      cost: `$${Math.round(capital / 2)} of capital and about $4 of gas`,
      time: '15 minutes',
    });
  }
  return steps;
}

/** The live-token protocols, by market cap, for the dashboard's "Already trading" view. */
export function liveRows(snapshot: Snapshot): LiveRow[] {
  return snapshot.protocols
    .filter((p) => !isPreToken(p) && p.category !== 'CEX')
    .sort((a, b) => (b.mcap_usd ?? 0) - (a.mcap_usd ?? 0) || b.tvl_usd - a.tvl_usd)
    .slice(0, LIVE_ROWS)
    .map((p) => ({
      slug: p.slug,
      name: p.name,
      category: p.category,
      chains: p.chains,
      tvl_usd: p.tvl_usd,
      mcap_usd: p.mcap_usd,
      change_7d: p.change_7d,
    }));
}

/** Everything the dashboard renders, from the snapshot. */
export function buildRadar(snapshot: Snapshot, model: ModelConstants = MODEL): { board: BoardRow[]; radar: RadarData } {
  const { board, multiples, validation } = buildBoard(snapshot, model);
  const live = liveRows(snapshot);
  const early = board.filter((r) => r.board_group === 'early').length;
  const offWatchlist = board.filter((r) => r.board_group === 'off-watchlist').length;
  const preToken = snapshot.protocols.filter(isPreToken).length;
  const radar: RadarData = {
    as_of: snapshot.as_of,
    source: snapshot.source,
    floor_usd: snapshot.floor_usd,
    model,
    model_version: MODEL_VERSION,
    watchlist_size: snapshot.watchlist.length,
    board_size: board.length,
    early_size: early,
    off_watchlist_size: offWatchlist,
    live_size: live.length,
    pre_token_count: preToken,
    total_protocols: snapshot.protocols.length,
    total_implied_usd: board.reduce((n, r) => n + r.implied_value_usd, 0),
    global_multiple: multiples.global,
    category_multiples: multiples.table,
    validation,
    rows: board,
    live,
  };
  return { board, radar };
}

/** The snapshot out of a file's text, refused unless it is the shape the model scores. */
export function parseSnapshot(text: string): Snapshot {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    throw new SnapshotError('snapshot.json is not JSON');
  }
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) throw new SnapshotError('snapshot.json is not a JSON object');
  const o = raw as Record<string, unknown>;
  if (typeof o.as_of !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(o.as_of)) throw new SnapshotError('snapshot.json has no as_of date');
  if (typeof o.source !== 'string') throw new SnapshotError('snapshot.json has no source');
  if (typeof o.floor_usd !== 'number' || !Number.isSafeInteger(o.floor_usd) || o.floor_usd <= 0) throw new SnapshotError('snapshot.json has no floor_usd');
  if (!Array.isArray(o.protocols)) throw new SnapshotError('snapshot.json has no protocols array');
  if (!Array.isArray(o.watchlist) || o.watchlist.some((s) => typeof s !== 'string')) throw new SnapshotError('snapshot.json has no watchlist of slugs');
  const protocols = o.protocols.map((v, i) => {
    if (typeof v !== 'object' || v === null || Array.isArray(v)) throw new SnapshotError(`snapshot.json's protocol ${i} is not an object`);
    const p = v as Record<string, unknown>;
    if (typeof p.slug !== 'string' || typeof p.name !== 'string' || typeof p.tvl_usd !== 'number' || !Number.isFinite(p.tvl_usd)) {
      throw new SnapshotError(`snapshot.json's protocol ${i} lacks a slug, a name or a TVL`);
    }
    return {
      slug: p.slug,
      name: p.name,
      category: typeof p.category === 'string' ? p.category : null,
      chains: Array.isArray(p.chains) ? p.chains.filter((c): c is string => typeof c === 'string') : [],
      tvl_usd: p.tvl_usd,
      change_7d: typeof p.change_7d === 'number' && Number.isFinite(p.change_7d) ? p.change_7d : null,
      mcap_usd: typeof p.mcap_usd === 'number' && Number.isFinite(p.mcap_usd) ? p.mcap_usd : null,
      listed_at: typeof p.listed_at === 'string' ? p.listed_at : null,
      gecko_id: typeof p.gecko_id === 'string' ? p.gecko_id : null,
      symbol: typeof p.symbol === 'string' ? p.symbol : null,
    };
  });
  return {
    as_of: o.as_of,
    source: o.source,
    floor_usd: o.floor_usd,
    protocols,
    watchlist: o.watchlist as string[],
  };
}

/** Why a board is not one the gate will take, or null: coverage, ranks, order, one shared implied value, and farm steps. */
export function boardIssue(board: BoardRow[], snapshot: Snapshot): string | null {
  const slugs = new Set(board.map((r) => r.slug));
  const missing = snapshot.watchlist.filter((s) => !slugs.has(s));
  if (missing.length > 0) return `the board misses ${missing.length} watchlist slug${missing.length === 1 ? '' : 's'}: ${missing.slice(0, 5).join(', ')}`;
  const ranks = board.map((r) => r.rank).sort((a, b) => a - b);
  for (let i = 0; i < ranks.length; i++) if (ranks[i] !== i + 1) return `rank ${i + 1} is ${ranks[i]}`;
  for (let i = 1; i < board.length; i++) if (board[i]!.implied_value_usd > board[i - 1]!.implied_value_usd) return `row ${i + 1} outranks row ${i} on implied value`;
  if (board.length >= 2 && board[0]!.implied_value_usd === board[board.length - 1]!.implied_value_usd) {
    return `all ${board.length} rows share the same implied value $${board[0]!.implied_value_usd}: a board that ranks nothing by value is not a ranking`;
  }
  for (const r of board) {
    const steps = r.farm_steps;
    if (steps.length < 3 || steps.length > 12) return `${r.slug} has ${steps.length} farm steps`;
    for (const s of steps) if (s.length < 20 || s.length > 600) return `${r.slug} has a farm step of ${s.length} characters`;
    if (!Number.isSafeInteger(r.implied_value_usd) || r.implied_value_usd <= 0) return `${r.slug} has implied value ${r.implied_value_usd}`;
  }
  return null;
}

/** A compact data.js: the dashboard's whole dataset as one script, no fetch and no network. */
export function dataScript(radar: RadarData): string {
  return `window.RADAR=${JSON.stringify(radar)};\n`;
}
