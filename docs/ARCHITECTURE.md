# Architecture

One Next.js app. Route handlers in `src/app/api` stay thin and call services in `src/server`.

| Folder | Holds | Runs on |
|---|---|---|
| `src/shared` | Game rules, fairness maths, board geometry, physics | Both, and must stay deterministic |
| `src/server` | Settlement, ledger, seeds, progression, NFT reads, sessions | Server only, the only place secrets live |
| `src/client` | API client, store, sound | Browser |
| `src/components` | UI and 3D scenes | Browser |

Decisions worth knowing:

## Squeek Drops: the physics is the result

A common way to build this game picks the slot first, then steers the ball there. That was ruled out by the brief: the token has to be a physical object.

So the fair digest seeds a deterministic simulation in Rapier's cross-platform build (`rapier2d-deterministic-compat`, pinned to an exact version). It sets each token's starting nudge and the small kick each peg gives. Physics then decides the slots, and on a multi-ball drop the tokens collide with each other. A token that jams against others for 0.4 s stops colliding with them and drops on alone, which keeps a pile from stalling the board.

1. The server runs the simulation and settles the stake, payout and reveal in one transaction.
2. The browser receives the revealed seed and runs the same simulation to draw the fall.
3. Anyone can rerun it from `/fairness`.

`e2e/determinism.spec.ts` holds Chrome and Safari's engine to the frame hashes Node produces. If a replay ever disagreed, the server's result would stand and the browser would log the mismatch.

Physics gives no closed-form odds, so `scripts/calibrate-drops.ts` measures them: one pay table per chute and ball count, each aimed at a 97% return. Collisions spread tokens out, so ball counts can't share a table. Changing either setting changes the risk, not the target return. The figures are measurements, so a table can sit slightly off 97%, least certain in the rarest slots.

The simulation takes a digest and a chute, so art and level have no way in. Level only changes the trail and rim colours.

## Squeek Run: the server's clock decides

- The stop is derived when the round starts. It stays on the server until the round settles.
- The multiplier is a function of server time since liftoff. A cash-out request carries no number.
- A server-sent-events stream wakes at the stop and says so then. Its ticks carry only the clock, so nothing gives the stop away early.
- A round settles at the first of a cash-out, a stream wake, a read or the next start, using the time it really ended. Closing the tab can't dodge a loss, and auto cash-out still pays.

Rounds are per player and share nothing. There are no shared rounds, waiting rooms or other players' stakes.

## Squeek Run's link to the real wheel

The game server reads the SqueekCore contract on Sepolia (`src/server/squeekchain.ts`, cached for 12 s). It doesn't use the official API: Cloudflare answers calls from this hosting with a bot challenge, which the game doesn't try to get around, and bonuses should rest on data a client can't fake anyway.

- **Work bonus:** each accepted magnet passage is one work unit, so settled work over the last 100 blocks (about 20 minutes) gives his average speed. That locks 1% per 10 rpm, from 1% to 10%, onto a cash-out.
- **Block bonus:** each new Squeek block settled during the round adds 5%, up to 25%. Settlements land about every 10 minutes while he's active, so this is a rare treat. It's read at settlement, and only within 15 s of the round's end.
- **Beacon:** the hash of the Sepolia block read at the start goes into the digest and is stored with the round.

The browser separately reads the official API, which is open to browsers, for his up-to-the-second status. That drives the status line, the progress bar and the idle wheel mirroring him. It decides nothing.

Bonuses only raise a win and never move the stop. They do push the long-run return above 99% while he's active, which is fine for free points and would need rethinking if points ever had value. If the chain can't be read the game plays on with no bonus and no beacon, and the round records that.

Squeek art, levels and ownership are read from the contracts too. Only the list of a wallet's tokens comes from the API, through the browser, and the server checks ownership on-chain at every drop.

## Exactly-once money

The rules are in the database, so application bugs can't break them:

- `CHECK (amount >= 0)` on balances, and debits are one conditional `UPDATE`.
- A partial unique index allows one active Run per player, and another one unspent commitment per player.
- `UNIQUE (roundId, type)` on the ledger: a round can be staked once and paid once.
- `UNIQUE (userId, requestKey)` on rounds: a retried start or drop returns the same round.
- Settlement flips `status` from `ACTIVE` in a conditional update. Whichever request wins owns the payout, and the others read the result.
- Stats, XP and achievements commit in the same transaction as the result.

## Fairness

Each round has its own server seed, committed by hash before the player's client seed is known, and revealed at settlement. `publicRound` in `src/server/views.ts` is the only shape a round leaves the server in, and it withholds the seed and stop until the reveal.

Known limit: the operator can read unrevealed seeds in the database. That's acceptable while credits have no value, and it would need revisiting first if that ever changed.

## Squeek data

Following the Squeekchain docs' integration rules:

- Addresses come only from the published deployment record, re-read every 10 minutes and checked against the live contract's bytecode and SqueekCore binding.
- The API lists tokens for display. `"unavailable"` is shown as unknown, never as an empty wallet.
- Ownership is read from the contracts at the moment of a drop: `ownerOf`, then `SqueekStaking.depositor` for deposited Squeeks.
- Everything is read-only. The only thing a wallet signs is a sign-in message.
- NFT art is untrusted. It reaches the page only via `<img>` or a canvas, and its endpoint sends a sandboxing CSP.

If the chain or the docs are unreachable, Squeeks can't be played and the arcade token still can.

## Things left out, and why

- **No Redis or separate API service.** Nothing needs them yet, and one app deploys anywhere with Postgres.
- **No `LeaderboardEntry` table.** Boards are indexed queries over recorded rounds with a 10-second cache, so they can't drift from real play.
- **`GameRound` combines the brief's GameSession, GameRound and GameResult.** Each round has exactly one result, and a session wouldn't add anything.
- **No post-processing bloom.** Glow is done with sprites, which keeps phones smooth.

## Limits to know before going public

- Burst throttling is per server instance. Guest-creation limits and credit rules live in the database and hold everywhere.
- Guests can make new accounts to get new credits, slowed by a per-address hourly limit. Credits are worthless, so this mainly affects leaderboards.
- SSE streams on serverless hosts are capped by function duration. The client reconnects and polls, so a cut stream only delays the news.
