-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "Game" AS ENUM ('RUN', 'DROPS');

-- CreateEnum
CREATE TYPE "RoundStatus" AS ENUM ('ACTIVE', 'WON', 'LOST');

-- CreateEnum
CREATE TYPE "SeedStatus" AS ENUM ('COMMITTED', 'IN_PLAY', 'REVEALED');

-- CreateEnum
CREATE TYPE "TxType" AS ENUM ('GRANT', 'DAILY', 'REFILL', 'STAKE', 'PAYOUT');

-- CreateEnum
CREATE TYPE "XpSource" AS ENUM ('GAME', 'CHALLENGE', 'ACHIEVEMENT');

-- CreateTable
CREATE TABLE "users" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "ipHash" TEXT,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "wallets" (
    "address" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "linkedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "wallets_pkey" PRIMARY KEY ("address")
);

-- CreateTable
CREATE TABLE "auth_nonces" (
    "nonce" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "auth_nonces_pkey" PRIMARY KEY ("nonce")
);

-- CreateTable
CREATE TABLE "player_profiles" (
    "userId" TEXT NOT NULL,
    "username" TEXT,
    "usernameKey" TEXT,
    "shareId" TEXT NOT NULL,
    "avatar" TEXT NOT NULL DEFAULT 'hamster:classic',
    "cosmetic" TEXT NOT NULL DEFAULT 'gold',
    "xp" INTEGER NOT NULL DEFAULT 0,
    "gamesPlayed" INTEGER NOT NULL DEFAULT 0,
    "wins" INTEGER NOT NULL DEFAULT 0,
    "losses" INTEGER NOT NULL DEFAULT 0,
    "runsPlayed" INTEGER NOT NULL DEFAULT 0,
    "dropsPlayed" INTEGER NOT NULL DEFAULT 0,
    "cashouts" INTEGER NOT NULL DEFAULT 0,
    "bestRunMult" INTEGER NOT NULL DEFAULT 0,
    "bestDropMult" INTEGER NOT NULL DEFAULT 0,
    "bestPayout" BIGINT NOT NULL DEFAULT 0,
    "activeDays" INTEGER NOT NULL DEFAULT 0,
    "lastPlayedDay" TEXT,
    "playXpDay" TEXT,
    "playXpToday" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "player_profiles_pkey" PRIMARY KEY ("userId")
);

-- CreateTable
CREATE TABLE "demo_balances" (
    "userId" TEXT NOT NULL,
    "amount" BIGINT NOT NULL,
    "lastDailyDay" TEXT,
    "refillDay" TEXT,
    "refillCount" INTEGER NOT NULL DEFAULT 0,
    "lastRefillAt" TIMESTAMP(3),
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "demo_balances_pkey" PRIMARY KEY ("userId")
);

-- CreateTable
CREATE TABLE "demo_transactions" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "type" "TxType" NOT NULL,
    "amount" BIGINT NOT NULL,
    "balanceAfter" BIGINT NOT NULL,
    "roundId" TEXT,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "demo_transactions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "fairness_seeds" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "serverSeed" TEXT NOT NULL,
    "hash" TEXT NOT NULL,
    "nonce" INTEGER NOT NULL,
    "status" "SeedStatus" NOT NULL DEFAULT 'COMMITTED',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "revealedAt" TIMESTAMP(3),

    CONSTRAINT "fairness_seeds_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "game_rounds" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "game" "Game" NOT NULL,
    "status" "RoundStatus" NOT NULL DEFAULT 'ACTIVE',
    "stake" INTEGER NOT NULL,
    "requestKey" TEXT NOT NULL,
    "seedId" TEXT NOT NULL,
    "clientSeed" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "settledAt" TIMESTAMP(3),
    "payout" INTEGER,
    "resultMult" INTEGER,
    "shareId" TEXT NOT NULL,
    "liftoffAt" TIMESTAMP(3),
    "crashMult" INTEGER,
    "autoCashout" INTEGER,
    "cashedOut" BOOLEAN,
    "chute" INTEGER,
    "slot" INTEGER,
    "tokenId" INTEGER,
    "tokenLevel" INTEGER,
    "xpAwarded" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "game_rounds_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "nfts" (
    "tokenId" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "level" INTEGER NOT NULL,
    "imageUri" TEXT NOT NULL,
    "attributes" JSONB NOT NULL,
    "fetchedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "nfts_pkey" PRIMARY KEY ("tokenId")
);

-- CreateTable
CREATE TABLE "player_nfts" (
    "userId" TEXT NOT NULL,
    "tokenId" INTEGER NOT NULL,
    "firstUsed" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "plays" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "player_nfts_pkey" PRIMARY KEY ("userId","tokenId")
);

-- CreateTable
CREATE TABLE "achievements" (
    "key" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "xp" INTEGER NOT NULL,
    "sort" INTEGER NOT NULL,

    CONSTRAINT "achievements_pkey" PRIMARY KEY ("key")
);

-- CreateTable
CREATE TABLE "player_achievements" (
    "userId" TEXT NOT NULL,
    "achievementKey" TEXT NOT NULL,
    "earnedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "roundId" TEXT,

    CONSTRAINT "player_achievements_pkey" PRIMARY KEY ("userId","achievementKey")
);

-- CreateTable
CREATE TABLE "xp_transactions" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "source" "XpSource" NOT NULL,
    "amount" INTEGER NOT NULL,
    "ref" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "xp_transactions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "daily_challenge_progress" (
    "userId" TEXT NOT NULL,
    "day" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "progress" INTEGER NOT NULL DEFAULT 0,
    "completedAt" TIMESTAMP(3),

    CONSTRAINT "daily_challenge_progress_pkey" PRIMARY KEY ("userId","day","key")
);

-- CreateTable
CREATE TABLE "error_logs" (
    "id" TEXT NOT NULL,
    "scope" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "error_logs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "users_ipHash_createdAt_idx" ON "users"("ipHash", "createdAt");

-- CreateIndex
CREATE INDEX "users_lastSeenAt_idx" ON "users"("lastSeenAt");

-- CreateIndex
CREATE UNIQUE INDEX "wallets_userId_key" ON "wallets"("userId");

-- CreateIndex
CREATE INDEX "auth_nonces_expiresAt_idx" ON "auth_nonces"("expiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "player_profiles_username_key" ON "player_profiles"("username");

-- CreateIndex
CREATE UNIQUE INDEX "player_profiles_usernameKey_key" ON "player_profiles"("usernameKey");

-- CreateIndex
CREATE UNIQUE INDEX "player_profiles_shareId_key" ON "player_profiles"("shareId");

-- CreateIndex
CREATE INDEX "player_profiles_xp_idx" ON "player_profiles"("xp" DESC);

-- CreateIndex
CREATE INDEX "player_profiles_gamesPlayed_idx" ON "player_profiles"("gamesPlayed" DESC);

-- CreateIndex
CREATE INDEX "player_profiles_bestRunMult_idx" ON "player_profiles"("bestRunMult" DESC);

-- CreateIndex
CREATE INDEX "player_profiles_bestDropMult_idx" ON "player_profiles"("bestDropMult" DESC);

-- CreateIndex
CREATE INDEX "demo_transactions_userId_createdAt_idx" ON "demo_transactions"("userId", "createdAt" DESC);

-- CreateIndex
CREATE INDEX "demo_transactions_type_createdAt_idx" ON "demo_transactions"("type", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "demo_transactions_roundId_type_key" ON "demo_transactions"("roundId", "type");

-- CreateIndex
CREATE UNIQUE INDEX "fairness_seeds_hash_key" ON "fairness_seeds"("hash");

-- CreateIndex
CREATE INDEX "fairness_seeds_userId_status_idx" ON "fairness_seeds"("userId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "fairness_seeds_userId_nonce_key" ON "fairness_seeds"("userId", "nonce");

-- CreateIndex
CREATE UNIQUE INDEX "game_rounds_seedId_key" ON "game_rounds"("seedId");

-- CreateIndex
CREATE UNIQUE INDEX "game_rounds_shareId_key" ON "game_rounds"("shareId");

-- CreateIndex
CREATE INDEX "game_rounds_userId_createdAt_idx" ON "game_rounds"("userId", "createdAt" DESC);

-- CreateIndex
CREATE INDEX "game_rounds_game_settledAt_idx" ON "game_rounds"("game", "settledAt");

-- CreateIndex
CREATE INDEX "game_rounds_game_status_idx" ON "game_rounds"("game", "status");

-- CreateIndex
CREATE UNIQUE INDEX "game_rounds_userId_requestKey_key" ON "game_rounds"("userId", "requestKey");

-- CreateIndex
CREATE INDEX "player_achievements_achievementKey_idx" ON "player_achievements"("achievementKey");

-- CreateIndex
CREATE INDEX "xp_transactions_userId_createdAt_idx" ON "xp_transactions"("userId", "createdAt" DESC);

-- CreateIndex
CREATE INDEX "xp_transactions_createdAt_idx" ON "xp_transactions"("createdAt");

-- CreateIndex
CREATE INDEX "error_logs_createdAt_idx" ON "error_logs"("createdAt" DESC);

-- AddForeignKey
ALTER TABLE "wallets" ADD CONSTRAINT "wallets_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "player_profiles" ADD CONSTRAINT "player_profiles_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "demo_balances" ADD CONSTRAINT "demo_balances_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "demo_transactions" ADD CONSTRAINT "demo_transactions_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "demo_transactions" ADD CONSTRAINT "demo_transactions_roundId_fkey" FOREIGN KEY ("roundId") REFERENCES "game_rounds"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fairness_seeds" ADD CONSTRAINT "fairness_seeds_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "game_rounds" ADD CONSTRAINT "game_rounds_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "game_rounds" ADD CONSTRAINT "game_rounds_seedId_fkey" FOREIGN KEY ("seedId") REFERENCES "fairness_seeds"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "player_nfts" ADD CONSTRAINT "player_nfts_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "player_nfts" ADD CONSTRAINT "player_nfts_tokenId_fkey" FOREIGN KEY ("tokenId") REFERENCES "nfts"("tokenId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "player_achievements" ADD CONSTRAINT "player_achievements_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "player_achievements" ADD CONSTRAINT "player_achievements_achievementKey_fkey" FOREIGN KEY ("achievementKey") REFERENCES "achievements"("key") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "xp_transactions" ADD CONSTRAINT "xp_transactions_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "daily_challenge_progress" ADD CONSTRAINT "daily_challenge_progress_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- Rules the database enforces no matter what the application does.
ALTER TABLE "demo_balances" ADD CONSTRAINT "demo_balance_not_negative" CHECK ("amount" >= 0);
ALTER TABLE "game_rounds" ADD CONSTRAINT "round_stake_positive" CHECK ("stake" > 0);
ALTER TABLE "game_rounds" ADD CONSTRAINT "round_payout_not_negative" CHECK ("payout" IS NULL OR "payout" >= 0);
ALTER TABLE "game_rounds" ADD CONSTRAINT "round_settled_complete" CHECK (
  ("status" = 'ACTIVE' AND "settledAt" IS NULL AND "payout" IS NULL)
  OR ("status" <> 'ACTIVE' AND "settledAt" IS NOT NULL AND "payout" IS NOT NULL)
);
-- A player has one wheel. Every player's round is theirs alone.
CREATE UNIQUE INDEX "one_active_run_per_player" ON "game_rounds" ("userId") WHERE "status" = 'ACTIVE' AND "game" = 'RUN';
-- One unspent commitment at a time.
CREATE UNIQUE INDEX "one_committed_seed_per_player" ON "fairness_seeds" ("userId") WHERE "status" = 'COMMITTED';
