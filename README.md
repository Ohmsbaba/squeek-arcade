# Squeek Arcade

A hamster-powered arcade for the Squeekchain ecosystem. Community-built, not an official Squeekchain product.

- **Squeek Drops**: drop up to ten tokens at once, or Squeeks you hold, through a 3D pegboard. A real rigid-body simulation decides where they land, and they knock into each other on the way.
- **Squeek Run**: your own wheel. It speeds up, the multiplier climbs, and it can stop at any moment. Cash out first. The real Squeektoshi's speed and real Squeek blocks add live bonuses.

Everyone can claim 10,000 free points a day. Points are non-redeemable and have no monetary value. No deposits, withdrawals or prizes. Squeek data comes from Sepolia, a testnet. No wallet is needed to play.

## Run it

Needs Node 20+ and PostgreSQL.

```bash
npm install
cp .env.example .env
```

Fill in `DATABASE_URL` and `SESSION_SECRET` (`openssl rand -hex 32`). Set `ADMIN_PASSWORD` to open `/admin`.

```bash
npx prisma migrate deploy
npm run dev
```

Open http://localhost:3400. For a production build: `npm run build && npm start`.

## Test it

```bash
npm test
npx playwright test
```

`npm test` needs a database named `squeek_arcade_test`, or set `TEST_DATABASE_URL` to any database whose name ends in `_test`. It wipes that database.

Browser tests expect a server on port 3400 and use its database. Against `next start`, run `run.spec`, `drops.spec` and `arcade.spec`. The other two need `npm run dev`:

- `determinism.spec` checks that browsers reproduce the server's physics frame for frame. It uses a test hook that production builds leave out. To include Safari's engine, run `npx playwright install webkit` first.
- The live Squeek test in `drops.spec` is skipped unless `E2E_LIVE_NFT=1` is set. It also needs `DEV_NFT_ALIAS`, as in `.env.example`, and network access.

## How it's built

See [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md). Fairness is explained for players at `/fairness`.

If the physics or the board geometry changes, every published drop stops verifying and the pay tables go stale. Run `npm run calibrate`, then `npx tsx scripts/determinism-golden.ts`, and update the pinned test vector deliberately.
