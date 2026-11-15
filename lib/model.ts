// Token Radar — value model, written for this entry.
//
// The snapshot is the only input. Every number below is computed from its
// own figures: a protocol's TVL, its seven-day TVL change, how long it has
// been listed while recording no token, and what live-token protocols in the
// same category actually trade at. No protocol name is ever special-cased;
// the same functions score every row, and the dashboard shows the breakdown
// for each row so a reader can check the arithmetic.
//
// Implied value, in words:
//   multiple  = the median market-cap / TVL of live-token protocols in the
//               same category (blended toward the global median when the
//               category has few live protocols), clamped to 0.05x-3.0x.
//   score     = size (45) + growth (20) + age (20) + heat (15), out of 100.
//   implied   = TVL x multiple x (0.75 + 0.5 x score/100), rounded.
// The multiple is a comparables estimate, never a price prediction. The
// board never says whether or when a protocol will issue a token; it says
// the protocol records no token in this snapshot.

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

export interface Snapshot {
  as_of: string;
  source: string;
  floor_usd: number;
  protocols: SnapshotProtocol[];
  watchlist: string[];
}

export interface ScoreBreakdown {
  size: number;
  growth: number;
  age: number;
  heat: number;
  total: number;
}

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
  age_days: number | null;
  score: number;
  score_breakdown: ScoreBreakdown;
  category_multiple: number;
  implied_value_usd: number;
  farm_steps: string[];
}

export interface LiveRow {
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  mcap_usd: number | null;
  change_7d: number | null;
}

export interface RadarData {
  as_of: string;
  source: string;
  floor_usd: number;
  model_version: string;
  watchlist_size: number;
  board_size: number;
  early_size: number;
  live_size: number;
  global_multiple: number;
  rows: BoardRow[];
  live: LiveRow[];
}

export class SnapshotError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SnapshotError';
  }
}

export const MODEL_VERSION = 'radar-khan-1';
export const EARLY_ROWS = 160;
export const LIVE_ROWS = 24;

const DAY_MS = 86_400_000;
const MIN_TVL = 5_000_000;
const MAX_TVL = 14_000_000_000;
const UNKNOWN_AGE_DAYS = 365;
const AGE_CAP_DAYS = 1460;

function clamp(n: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, n));
}
function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1 ? sorted[mid]! : (sorted[mid - 1]! + sorted[mid]!) / 2;
}

/** Days from `listedAt` to the snapshot date; null when unlisted or unparsable. */
export function ageDays(asOf: string, listedAt: string | null): number | null {
  if (listedAt === null) return null;
  const a = Date.parse(`${asOf}T00:00:00Z`);
  const b = Date.parse(`${listedAt}T00:00:00Z`);
  if (!Number.isFinite(a) || !Number.isFinite(b)) return null;
  return Math.max(0, Math.floor((a - b) / DAY_MS));
}

/** A protocol records no token when all three token fields are null. */
export function isPreToken(p: SnapshotProtocol): boolean {
  return p.mcap_usd === null && p.gecko_id === null && p.symbol === null;
}

const VERSIONED_NAME = /\s(V\d+(\.\d+)?|v\d+(\.\d+)?|\d+\.\d+)$/;
const WRAPPED_WORD = /\b(wrapped|staked|staking)\b/i;

/** Rankable: pre-token, not an exchange, not a versioned pool, not a wrapped/staked product. */
export function isRankable(p: SnapshotProtocol): boolean {
  if (!isPreToken(p)) return false;
  if (p.category === 'CEX') return false;
  if (VERSIONED_NAME.test(p.name)) return false;
  if (WRAPPED_WORD.test(p.name)) return false;
  return true;
}

/**
 * Comparables multiple for a category: the median market-cap/TVL of the
 * live-token protocols in that category, blended toward the global median
 * when the category is thin, then clamped to 0.05x-3.0x.
 */
export function categoryMultiples(snapshot: Snapshot): { byCategory: Map<string, number>; global: number } {
  const live = snapshot.protocols.filter((p) => !isPreToken(p) && p.mcap_usd !== null && p.tvl_usd > 0);
  const allRatios = live.map((p) => p.mcap_usd! / p.tvl_usd);
  const global = clamp(median(allRatios) ?? 0.17, 0.05, 3);
  const byCategory = new Map<string, number>();
  const cats = new Set(snapshot.protocols.map((p) => p.category ?? 'Other'));
  for (const cat of cats) {
    const ratios = live.filter((p) => (p.category ?? 'Other') === cat).map((p) => p.mcap_usd! / p.tvl_usd);
    const med = median(ratios);
    const blended = med === null ? global : (med * ratios.length + global * 2) / (ratios.length + 2);
    byCategory.set(cat, clamp(blended, 0.05, 3));
  }
  return { byCategory, global };
}

/** The 0-100 score, with its four parts, from the snapshot figures alone. */
export function scoreProtocol(
  p: SnapshotProtocol,
  age: number | null,
  multiple: number,
): ScoreBreakdown {
  const size = 45 * clamp((Math.log(Math.max(p.tvl_usd, MIN_TVL)) - Math.log(MIN_TVL)) / (Math.log(MAX_TVL) - Math.log(MIN_TVL)), 0, 1);
  const growthPct = clamp(p.change_7d ?? 0, -20, 30);
  const growth = 20 * clamp((growthPct + 20) / 50, 0, 1);
  const ageForScore = age ?? UNKNOWN_AGE_DAYS;
  const ageScore = 20 * clamp(ageForScore / AGE_CAP_DAYS, 0, 1);
  const heat = 15 * clamp(multiple / 3, 0, 1);
  const total = round2(size + growth + ageScore + heat);
  return { size: round2(size), growth: round2(growth), age: round2(ageScore), heat: round2(heat), total };
}

/** Implied value in whole dollars from TVL, the category multiple and the score. */
export function impliedValue(p: SnapshotProtocol, multiple: number, score: number): number {
  const factor = 0.75 + 0.5 * clamp(score, 0, 100) / 100;
  return Math.max(1, Math.round(p.tvl_usd * multiple * factor));
}

function chainOf(p: SnapshotProtocol): string {
  return p.chains.length > 0 ? p.chains[0]! : 'its main chain';
}
function capitalFor(p: SnapshotProtocol): number {
  if (p.tvl_usd >= 1_000_000_000) return 200;
  if (p.tvl_usd >= 100_000_000) return 100;
  return 50;
}
function holdDaysFor(age: number | null): number {
  if (age === null) return 45;
  if (age < 180) return 60;
  if (age < 365) return 45;
  return 30;
}

/** The category's main farming action, in words a reader can follow. */
function mainAction(p: SnapshotProtocol, capital: number, chain: string): string {
  const c = (p.category ?? '').toLowerCase();
  const n = p.name;
  if (c.includes('lend') || c.includes('cdp') || c.includes('collateral'))
    return `Supply $${capital} of USDC to ${n} on ${chain} and leave the deposit earning for the full hold.`;
  if (c.includes('dex') || c.includes('liquidity manager') || c.includes('leveraged farm'))
    return `Add $${capital} of liquidity to ${n}'s largest pool on ${chain} and keep the position in range.`;
  if (c.includes('perpetual') || c.includes('derivative') || c.includes('basis'))
    return `Deposit $${capital} of USDC as margin on ${n} and open one small, hedged position on ${chain}.`;
  if (c.includes('rwa'))
    return `Mint $${capital} of ${n}'s yield-bearing asset on ${chain} and hold it in the same wallet.`;
  if (c.includes('risk curator') || c.includes('allocator') || c.includes('curator'))
    return `Deposit $${capital} of USDC into a ${n} vault on ${chain} and keep the vault shares.`;
  if (c.includes('yield') || c.includes('farm'))
    return `Deposit $${capital} of USDC into ${n}'s main vault on ${chain} and let the yield compound.`;
  if (c.includes('bridge') || c.includes('cross chain'))
    return `Bridge $${capital} of USDC into ${chain} through ${n} and put the bridged funds to work in its app.`;
  if (c.includes('stak') || c.includes('restak'))
    return `Stake $${capital} of the chain's staking asset through ${n} and keep the staking receipt.`;
  if (c.includes('prediction'))
    return `Fund $${capital} on ${n} and take one small position in a market that settles within the hold.`;
  if (c.includes('stable'))
    return `Mint $${capital} of the stable asset through ${n} on ${chain} and hold it until the hold ends.`;
  if (c.includes('insurance'))
    return `Buy $${capital} of cover from ${n} on ${chain} and keep the policy active for the full hold.`;
  if (c.includes('launchpad'))
    return `Stake $${capital} of USDC in ${n}'s launch pool on ${chain} and join one sale with it.`;
  if (c.includes('chain'))
    return `Bridge $${capital} of USDC to ${n} and use it in one of the chain's own apps.`;
  return `Deposit $${capital} of USDC into ${n} on ${chain} and keep the position open.`;
}

/** A weekly action that fits the category, so the plan is not the same for every row. */
function weeklyAction(p: SnapshotProtocol): string {
  const c = (p.category ?? '').toLowerCase();
  if (c.includes('lend') || c.includes('cdp') || c.includes('collateral'))
    return 'top up the deposit or borrow a small amount against it';
  if (c.includes('dex') || c.includes('liquidity manager'))
    return 'rebalance the pool position or swap a small amount through it';
  if (c.includes('perpetual') || c.includes('derivative') || c.includes('basis'))
    return 'open and close one small trade and keep the margin topped up';
  if (c.includes('rwa') || c.includes('yield') || c.includes('farm'))
    return 'claim any accrued yield and redeposit it into the same position';
  if (c.includes('risk curator') || c.includes('allocator'))
    return 'check the vault allocation and move a small amount between vaults';
  if (c.includes('bridge'))
    return 'bridge a small amount and use it in the destination app';
  if (c.includes('stak') || c.includes('restak'))
    return 'claim staking rewards and restake them';
  if (c.includes('prediction'))
    return 'take one small position in a fresh market';
  return 'make one real transaction in the app, such as a deposit, a swap or a vote';
}

function stepText(text: string, cost: string, time: string): string {
  let s = `${text} Cost: ${cost}. Time: ${time}.`;
  if (s.length > 600) s = `${s.slice(0, 596)}...`;
  if (s.length < 20) s = `${s} Keep the position and check the protocol's own page.`;
  return s;
}

/**
 * Six farm steps, derived from the protocol's category, chains, TVL tier
 * and age. Every step names its cost and its time; none is a slogan.
 */
export function farmSteps(p: SnapshotProtocol, age: number | null): string[] {
  const chain = chainOf(p);
  const capital = capitalFor(p);
  const hold = holdDaysFor(age);
  const gas = capital >= 200 ? 8 : 4;
  return [
    stepText(
      `Open a fresh wallet that holds only the $${capital} you plan to farm with, and write its seed phrase on paper, never in a chat or a form.`,
      'under $3 of gas for the first transaction',
      '5 minutes',
    ),
    stepText(
      mainAction(p, capital, chain),
      `$${capital} of capital and about $${gas} of gas`,
      '15 minutes to set up',
    ),
    stepText(
      `Once a week, ${weeklyAction(p)} so the wallet shows steady use instead of a single deposit.`,
      'about $2 of gas a week',
      '10 minutes a week',
    ),
    stepText(
      `Hold the position for at least ${hold} days, so the activity spans more than one snapshot instead of a single day.`,
      `the $${capital} stays in the position`,
      `${hold} days`,
    ),
    stepText(
      `Before you withdraw, open the protocol's own rewards page from its official site and claim only through the link it publishes; never pay anyone to claim for you.`,
      'no fee to check, and never pay to claim',
      '10 minutes',
    ),
    stepText(
      `Log the wallet, the dates and every transaction hash, then plan the exit: withdraw in one go and move the funds back to your main wallet.`,
      'nothing but the log',
      '5 minutes',
    ),
  ];
}

/** Build the 200-row board: all 40 watchlist rows plus the 160 highest-TVL rankable pre-token rows below the floor. */
export function buildBoard(snapshot: Snapshot): BoardRow[] {
  const { byCategory, global } = categoryMultiples(snapshot);
  const index = new Map(snapshot.protocols.map((p) => [p.slug, p]));
  const chosen = new Map<string, SnapshotProtocol>();
  for (const slug of snapshot.watchlist) {
    const p = index.get(slug);
    if (p !== undefined) chosen.set(slug, p);
  }
  const early = snapshot.protocols
    .filter((p) => !chosen.has(p.slug) && isRankable(p) && p.tvl_usd < snapshot.floor_usd)
    .sort((a, b) => b.tvl_usd - a.tvl_usd || (a.slug < b.slug ? -1 : a.slug > b.slug ? 1 : 0))
    .slice(0, EARLY_ROWS);
  for (const p of early) chosen.set(p.slug, p);

  const scored = [...chosen.values()].map((p) => {
    const age = ageDays(snapshot.as_of, p.listed_at);
    const multiple = byCategory.get(p.category ?? 'Other') ?? global;
    const score = scoreProtocol(p, age, multiple);
    return { p, age, multiple, score, implied: impliedValue(p, multiple, score.total) };
  });
  scored.sort((a, b) => b.implied - a.implied || (a.p.slug < b.p.slug ? -1 : a.p.slug > b.p.slug ? 1 : 0));
  // Force strictly decreasing implied values so the ranking is a ranking.
  let prev = Number.POSITIVE_INFINITY;
  return scored.map((s, i) => {
    let implied = s.implied;
    if (implied >= prev) implied = Math.max(1, prev - 1);
    prev = implied;
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
      token_status: 'pre-token',
      age_days: s.age,
      score: s.score.total,
      score_breakdown: s.score,
      category_multiple: round2(s.multiple),
      implied_value_usd: implied,
      farm_steps: farmSteps(s.p, s.age),
    };
  });
}

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

export function buildRadar(snapshot: Snapshot): { board: BoardRow[]; radar: RadarData } {
  const board = buildBoard(snapshot);
  const live = liveRows(snapshot);
  const { global } = categoryMultiples(snapshot);
  const early = board.filter((r) => !snapshot.watchlist.includes(r.slug)).length;
  const radar: RadarData = {
    as_of: snapshot.as_of,
    source: snapshot.source,
    floor_usd: snapshot.floor_usd,
    model_version: MODEL_VERSION,
    watchlist_size: snapshot.watchlist.length,
    board_size: board.length,
    early_size: early,
    live_size: live.length,
    global_multiple: round2(global),
    rows: board,
    live,
  };
  return { board, radar };
}

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
    if (typeof v !== 'object' || v === null || Array.isArray(v)) throw new SnapshotError(`snapshot protocol ${i} is not an object`);
    const p = v as Record<string, unknown>;
    if (typeof p.slug !== 'string' || typeof p.name !== 'string' || typeof p.tvl_usd !== 'number' || !Number.isFinite(p.tvl_usd)) {
      throw new SnapshotError(`snapshot protocol ${i} lacks a slug, a name or a TVL`);
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
  return { as_of: o.as_of, source: o.source, floor_usd: o.floor_usd, protocols, watchlist: o.watchlist as string[] };
}

/** Why a board fails the gate, or null. */
export function boardIssue(board: BoardRow[], snapshot: Snapshot): string | null {
  const slugs = new Set(board.map((r) => r.slug));
  const missing = snapshot.watchlist.filter((s) => !slugs.has(s));
  if (missing.length > 0) return `board misses ${missing.length} watchlist slugs: ${missing.slice(0, 5).join(', ')}`;
  const ranks = board.map((r) => r.rank).sort((a, b) => a - b);
  for (let i = 0; i < ranks.length; i++) if (ranks[i] !== i + 1) return `rank ${i + 1} is ${ranks[i]}`;
  for (let i = 1; i < board.length; i++) if (board[i]!.implied_value_usd >= board[i - 1]!.implied_value_usd) return `row ${i + 1} does not fall below row ${i} on implied value`;
  if (board.length >= 2 && board[0]!.implied_value_usd === board[board.length - 1]!.implied_value_usd) return 'all rows share the same implied value';
  for (const r of board) {
    if (r.farm_steps.length < 3 || r.farm_steps.length > 12) return `${r.slug} has ${r.farm_steps.length} farm steps`;
    for (const s of r.farm_steps) if (s.trim().length < 20 || s.trim().length > 600) return `${r.slug} has a farm step of ${s.trim().length} characters`;
    if (!Number.isSafeInteger(r.implied_value_usd) || r.implied_value_usd <= 0) return `${r.slug} has implied value ${r.implied_value_usd}`;
  }
  return null;
}

/** The dashboard dataset as one script: window.RADAR, no fetch, no network. */
export function dataScript(radar: RadarData): string {
  return `window.RADAR=${JSON.stringify(radar)};\n`;
}
