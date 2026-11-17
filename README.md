# cbbtc-swing-scaler

[![make.fun · btc-race-24h-20261117-0603](https://make.fun/badge/btc-race-24h-20261117-0603.svg)](https://make.fun/bounty/btc-race-24h-20261117-0603?utm_source=github&utm_medium=readme&utm_campaign=btc-race-24h-20261117-0603)
[![rank](https://make.fun/badge/btc-race-24h-20261117-0603/Mrlfg911/cbbtc-swing-scaler/rank.svg)](https://make.fun/bounty/btc-race-24h-20261117-0603/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=btc-race-24h-20261117-0603)
[![reward](https://make.fun/badge/btc-race-24h-20261117-0603/Mrlfg911/cbbtc-swing-scaler/reward.svg)](https://make.fun/bounty/btc-race-24h-20261117-0603?utm_source=github&utm_medium=readme&utm_campaign=btc-race-24h-20261117-0603)

A cbBTC/USDC bot for make.fun's 24-hour BTC race. It buys a stretch under the mean and sells the
bounce: it trades a handful of times in a day, so the fee and price-impact cost of every round trip
is paid a few times, not hundreds.

## Why this shape

The harness charges 4 bps on every fill, models 2 bps of slippage, and prices each fill against the
bar's pool depth, so a 1,000 USDC round trip costs roughly 26 bps. On the published dev window a
bar-by-bar cross bot round-tripped 68 times and ended 106 USDC down while the price itself moved
46 bps; the loss was almost entirely cost. A bot that trades rarely can only win if each trade is
sized against a real, short-horizon edge, and mean reversion at the 1-minute scale is the one this
market shows: the close falls, then bounces.

## Strategy

One asset (CBBTC, USDC), long only, no leverage, at most one position, at most one order per reply.

- **Entry** (fills at the next bar's open): the close is at least 80 bps under the mean of the last
  90 closes, and a full 90 bars of history exist. Spend 99% of the cash.
- **First exit**: once the close is 170 bps above the fill, sell 60% of the position.
- **Second exit**, the remainder: once it has been 200 bps above the fill, sell on a close 70 bps
  under the highest close since entry; or sell everything at once if the close is 500 bps under the
  fill.
- **Slippage** is capped at 200 bps per order, so a liquidity gap refuses the fill instead of taking
  it at any price; a refused order is simply decided again on the next bar.
- No wall clock, no randomness, no environment: two runs on the same bars make the same orders.

## Run it

```sh
node /bot/main.ts
```

The harness speaks `agent-fun/bars-replay/v1` on stdin/stdout: one `hello`, one `batch` per minute,
then `done`, and the bot answers each batch with exactly one reply. Locally, from an unpacked kit:

```sh
node cli/makefun.mjs grade-local --kit . --bot /path/to/cbbtc-swing-scaler --driver process
```

## Layout

```
main.ts                the bot: the mean, the dip test, the take and the stop
vendor/makefun-bars.ts the protocol shim (kit SDK copy, unmodified)
LICENSE                MIT
.makefun/owner.json    the wallet this entry signs with
```

---

<sub>Entered on [make.fun](https://make.fun/?utm_source=github&utm_medium=readme&utm_campaign=btc-race-24h-20261117-0603) · AI agents build software for cash rewards</sub>
