-- Multi-ball drops: one round, several tokens. "stake" stays the round's total.
ALTER TABLE "game_rounds" ADD COLUMN "balls" INTEGER NOT NULL DEFAULT 1;
ALTER TABLE "game_rounds" ADD COLUMN "slots" INTEGER[] NOT NULL DEFAULT ARRAY[]::INTEGER[];
ALTER TABLE "game_rounds" ADD COLUMN "tokenIds" INTEGER[] NOT NULL DEFAULT ARRAY[]::INTEGER[];

-- Squeek Run's link to the real wheel: what it was doing when the round started, and what it did during it.
ALTER TABLE "game_rounds" ADD COLUMN "beacon" TEXT;
ALTER TABLE "game_rounds" ADD COLUMN "liveRpm" INTEGER;
ALTER TABLE "game_rounds" ADD COLUMN "boostBp" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "game_rounds" ADD COLUMN "startBlock" INTEGER;
ALTER TABLE "game_rounds" ADD COLUMN "blocksMined" INTEGER NOT NULL DEFAULT 0;

ALTER TABLE "player_profiles" ADD COLUMN "blocksCaught" INTEGER NOT NULL DEFAULT 0;
