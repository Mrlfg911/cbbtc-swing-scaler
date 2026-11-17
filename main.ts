// cbBTC dip accumulator: buys a stretch under its mean, takes part of the bounce off at a fixed
// gain, and lets the rest ride a trailing stop. One asset, long only, no leverage, at most two
// orders per reply.
//
// Why this shape: on this market a fill costs 4 bps in fees plus 2 bps of modelled slippage plus
// the pool impact, so a bot that round-trips every cross pays far more in cost than a 1-minute
// move is worth. Trading rarely, and only when the close is genuinely stretched under its own
// mean, is the one edge the published window shows. Taking part of the position at a fixed gain
// banks the bounce; the rest rides a trailing stop so a bigger up move is not capped.
//
// Rules, read from the bars and the account the harness sends:
//   - entry (fills at the next open): the close is at least DIP_BPS under the mean of the last
//     MEAN_BARS closes, with a full MEAN_BARS of history. Spend 99% of the cash.
//   - first exit: once the close is TAKE_BPS above the fill, sell TAKE_FRACTION of the position.
//   - second exit, the remainder: once the position has been ARMED_BPS above the fill, sell it on
//     a close TRAIL_BPS under the highest close since entry; or at once if the close is STOP_BPS
//     under the fill.
//   - slippage is capped at MAX_SLIPPAGE_BPS so a liquidity gap refuses the fill rather than taking
//     it at any price; the order is simply decided again on the next bar.
//
// Deterministic: float64 arithmetic on + - * / only, no clock, no random, no environment.

import { runBars, type BarsState, type Bar, type BuyInput, type SellInput } from './vendor/makefun-bars.ts';

const SYMBOL = 'CBBTC';
const BPS = 10_000;
/** Bars in the mean the dip is measured against. */
const MEAN_BARS = 90;
/** How far under the mean, in bps, the close must sit to buy. */
const DIP_BPS = 80;
/** The gain, in bps over the fill, that takes the first part off. */
const TAKE_BPS = 170;
/** The share of the position the first take sells. */
const TAKE_FRACTION = 0.6;
/** The gain, in bps over the fill, the remainder must reach before the trail engages. */
const ARMED_BPS = 200;
/** The trail, in bps under the highest close since entry. */
const TRAIL_BPS = 70;
/** Cut everything still held this far under the fill. */
const STOP_BPS = 500;
/** Leave this share of the cash for the fee and the price impact. */
const CASH_FRACTION = 0.99;
/** Refuse a fill this far from the close the order was decided on. */
const MAX_SLIPPAGE_BPS = 200;

const closes: number[] = [];
let meanSum = 0;
let entryPrice = 0;
let heldHigh = 0;
let tookFirst = false;

function onBatch(state: BarsState, batch: { bars: Bar[] }): BuyInput[] | SellInput[] {
  const bar = batch.bars.find((b) => b.symbol === SYMBOL);
  if (!bar) return [];
  if (state.warmingUp) return [];

  const close = Number(BigInt(bar.c));
  closes.push(close);
  meanSum += close;
  if (closes.length > MEAN_BARS) meanSum -= closes.shift() as number;

  const holding = state.positions.get(SYMBOL);
  const qty = holding === undefined ? 0n : holding.qty;

  if (qty > 0n) {
    if (entryPrice <= 0) return [];
    if (close > heldHigh) heldHigh = close;
    const gainBps = ((close - entryPrice) / entryPrice) * BPS;
    const peakBps = ((heldHigh - entryPrice) / entryPrice) * BPS;
    const trailDropBps = heldHigh > 0 ? ((heldHigh - close) / heldHigh) * BPS : 0;

    if (gainBps <= -STOP_BPS) {
      return [{ side: 'sell', symbol: SYMBOL, qty: qty.toString(), max_slippage_bps: MAX_SLIPPAGE_BPS }];
    }
    if (!tookFirst && gainBps >= TAKE_BPS) {
      tookFirst = true;
      // Integer arithmetic on the qty: 60% of it, never more than it holds.
      const part = (qty * 6n) / 10n;
      if (part > 0n) {
        return [{ side: 'sell', symbol: SYMBOL, qty: part.toString(), max_slippage_bps: MAX_SLIPPAGE_BPS }];
      }
      return [];
    }
    if (peakBps >= ARMED_BPS && trailDropBps >= TRAIL_BPS) {
      return [{ side: 'sell', symbol: SYMBOL, qty: qty.toString(), max_slippage_bps: MAX_SLIPPAGE_BPS }];
    }
    return [];
  }

  tookFirst = false;
  if (closes.length < MEAN_BARS) return [];
  const mean = meanSum / closes.length;
  const dipBps = ((mean - close) / mean) * BPS;
  if (dipBps < DIP_BPS) return [];

  const minNotional = BigInt(state.hello.fees.min_notional_quote_units);
  const spend = BigInt(Math.floor(Number(state.cash) * CASH_FRACTION));
  if (spend < minNotional) return [];

  entryPrice = close;
  heldHigh = close;
  return [{ side: 'buy', symbol: SYMBOL, notional_quote_units: spend.toString(), max_slippage_bps: MAX_SLIPPAGE_BPS }];
}

runBars({ onBatch });
