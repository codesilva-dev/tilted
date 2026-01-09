-- CreateEnum
CREATE TYPE "table_type" AS ENUM ('cash_game', 'tournament');

-- CreateEnum
CREATE TYPE "table_status" AS ENUM ('waiting', 'active', 'paused', 'closed');

-- CreateEnum
CREATE TYPE "seat_status" AS ENUM ('active', 'sitting_out', 'away', 'left');

-- CreateEnum
CREATE TYPE "street" AS ENUM ('preflop', 'flop', 'turn', 'river', 'showdown');

-- CreateEnum
CREATE TYPE "hand_status" AS ENUM ('in_progress', 'completed', 'cancelled');

-- CreateEnum
CREATE TYPE "hand_player_status" AS ENUM ('active', 'folded', 'all_in', 'out');

-- CreateEnum
CREATE TYPE "action_type" AS ENUM ('fold', 'check', 'call', 'bet', 'raise', 'all_in', 'post_blind');

-- CreateEnum
CREATE TYPE "pot_type" AS ENUM ('main', 'side');

-- CreateTable
CREATE TABLE "accounts" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "type" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "provider_account_id" TEXT NOT NULL,
    "refresh_token" TEXT,
    "access_token" TEXT,
    "expires_at" INTEGER,
    "token_type" TEXT,
    "scope" TEXT,
    "id_token" TEXT,
    "session_state" TEXT,

    CONSTRAINT "accounts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sessions" (
    "id" UUID NOT NULL,
    "session_token" TEXT NOT NULL,
    "user_id" UUID NOT NULL,
    "expires" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "users" (
    "id" UUID NOT NULL,
    "name" TEXT,
    "email" TEXT,
    "email_verified" TIMESTAMP(3),
    "image" TEXT,
    "username" VARCHAR(50),
    "total_chips" BIGINT NOT NULL DEFAULT 10000,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "verification_tokens" (
    "identifier" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "expires" TIMESTAMP(3) NOT NULL
);

-- CreateTable
CREATE TABLE "tables" (
    "id" UUID NOT NULL,
    "name" VARCHAR(100) NOT NULL,
    "table_type" "table_type" NOT NULL DEFAULT 'cash_game',
    "maxSeats" SMALLINT NOT NULL DEFAULT 6,
    "smallBlind" INTEGER NOT NULL,
    "big_blind" INTEGER NOT NULL,
    "min_buyin" INTEGER NOT NULL,
    "max_buyin" INTEGER NOT NULL,
    "status" "table_status" NOT NULL DEFAULT 'waiting',
    "current_hand_id" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "tables_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "table_seats" (
    "id" UUID NOT NULL,
    "table_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "seat_position" SMALLINT NOT NULL,
    "stack" BIGINT NOT NULL,
    "status" "seat_status" NOT NULL DEFAULT 'active',
    "is_dealer" BOOLEAN NOT NULL DEFAULT false,
    "is_small_blind" BOOLEAN NOT NULL DEFAULT false,
    "is_big_blind" BOOLEAN NOT NULL DEFAULT false,
    "joined_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "left_at" TIMESTAMP(3),

    CONSTRAINT "table_seats_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "hands" (
    "id" UUID NOT NULL,
    "table_id" UUID NOT NULL,
    "hand_number" INTEGER NOT NULL,
    "dealer_seat" SMALLINT NOT NULL,
    "small_blind_seat" SMALLINT NOT NULL,
    "big_blind_seat" SMALLINT NOT NULL,
    "small_blind_amount" INTEGER NOT NULL,
    "big_blind_amount" INTEGER NOT NULL,
    "current_street" "street" NOT NULL DEFAULT 'preflop',
    "current_bet" INTEGER NOT NULL DEFAULT 0,
    "last_raise_amount" INTEGER NOT NULL DEFAULT 0,
    "active_seat" SMALLINT,
    "total_pot" INTEGER NOT NULL DEFAULT 0,
    "main_pot" INTEGER NOT NULL DEFAULT 0,
    "status" "hand_status" NOT NULL DEFAULT 'in_progress',
    "started_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completed_at" TIMESTAMP(3),

    CONSTRAINT "hands_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "hand_players" (
    "id" UUID NOT NULL,
    "hand_id" UUID NOT NULL,
    "table_seat_id" UUID NOT NULL,
    "seat_position" SMALLINT NOT NULL,
    "starting_stack" INTEGER NOT NULL,
    "current_stack" INTEGER NOT NULL,
    "total_bet_current_street" INTEGER NOT NULL DEFAULT 0,
    "total_bet_hand" INTEGER NOT NULL DEFAULT 0,
    "hole_card_1" VARCHAR(3),
    "hole_card_2" VARCHAR(3),
    "cards_revealed" BOOLEAN NOT NULL DEFAULT false,
    "status" "hand_player_status" NOT NULL DEFAULT 'active',
    "last_action" "action_type",
    "last_action_at" TIMESTAMP(3),
    "final_hand_rank" VARCHAR(50),
    "hand_rank_value" INTEGER,
    "total_won" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "hand_players_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "actions" (
    "id" UUID NOT NULL,
    "hand_id" UUID NOT NULL,
    "hand_player_id" UUID NOT NULL,
    "seat_position" SMALLINT NOT NULL,
    "action_type" "action_type" NOT NULL,
    "amount" INTEGER NOT NULL DEFAULT 0,
    "street" "street" NOT NULL,
    "action_sequence" INTEGER NOT NULL,
    "pot_before_action" INTEGER,
    "bet_to_match" INTEGER,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "actions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "community_cards" (
    "id" UUID NOT NULL,
    "hand_id" UUID NOT NULL,
    "card" VARCHAR(3) NOT NULL,
    "card_position" SMALLINT NOT NULL,
    "street" "street" NOT NULL,
    "revealed_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "community_cards_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pots" (
    "id" UUID NOT NULL,
    "hand_id" UUID NOT NULL,
    "pot_type" "pot_type" NOT NULL,
    "pot_number" INTEGER NOT NULL DEFAULT 0,
    "amount" INTEGER NOT NULL,
    "eligible_player_ids" JSONB NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "pots_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pot_winners" (
    "id" UUID NOT NULL,
    "pot_id" UUID NOT NULL,
    "hand_player_id" UUID NOT NULL,
    "amount_won" INTEGER NOT NULL,
    "winning_hand" VARCHAR(100) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "pot_winners_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "accounts_provider_provider_account_id_key" ON "accounts"("provider", "provider_account_id");

-- CreateIndex
CREATE UNIQUE INDEX "sessions_session_token_key" ON "sessions"("session_token");

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE UNIQUE INDEX "users_username_key" ON "users"("username");

-- CreateIndex
CREATE INDEX "users_username_idx" ON "users"("username");

-- CreateIndex
CREATE INDEX "users_email_idx" ON "users"("email");

-- CreateIndex
CREATE UNIQUE INDEX "verification_tokens_identifier_token_key" ON "verification_tokens"("identifier", "token");

-- CreateIndex
CREATE INDEX "tables_status_idx" ON "tables"("status");

-- CreateIndex
CREATE INDEX "table_seats_table_id_idx" ON "table_seats"("table_id");

-- CreateIndex
CREATE INDEX "table_seats_user_id_idx" ON "table_seats"("user_id");

-- CreateIndex
CREATE INDEX "table_seats_table_id_status_idx" ON "table_seats"("table_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "table_seats_table_id_seat_position_key" ON "table_seats"("table_id", "seat_position");

-- CreateIndex
CREATE UNIQUE INDEX "table_seats_table_id_user_id_key" ON "table_seats"("table_id", "user_id");

-- CreateIndex
CREATE INDEX "hands_table_id_idx" ON "hands"("table_id");

-- CreateIndex
CREATE INDEX "hands_table_id_status_idx" ON "hands"("table_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "hands_table_id_hand_number_key" ON "hands"("table_id", "hand_number");

-- CreateIndex
CREATE INDEX "hand_players_hand_id_idx" ON "hand_players"("hand_id");

-- CreateIndex
CREATE INDEX "hand_players_hand_id_status_idx" ON "hand_players"("hand_id", "status");

-- CreateIndex
CREATE INDEX "hand_players_hand_id_status_seat_position_idx" ON "hand_players"("hand_id", "status", "seat_position");

-- CreateIndex
CREATE UNIQUE INDEX "hand_players_hand_id_seat_position_key" ON "hand_players"("hand_id", "seat_position");

-- CreateIndex
CREATE INDEX "actions_hand_id_idx" ON "actions"("hand_id");

-- CreateIndex
CREATE INDEX "actions_hand_id_action_sequence_idx" ON "actions"("hand_id", "action_sequence");

-- CreateIndex
CREATE INDEX "actions_hand_player_id_idx" ON "actions"("hand_player_id");

-- CreateIndex
CREATE UNIQUE INDEX "actions_hand_id_action_sequence_key" ON "actions"("hand_id", "action_sequence");

-- CreateIndex
CREATE INDEX "community_cards_hand_id_idx" ON "community_cards"("hand_id");

-- CreateIndex
CREATE UNIQUE INDEX "community_cards_hand_id_card_position_key" ON "community_cards"("hand_id", "card_position");

-- CreateIndex
CREATE INDEX "pots_hand_id_idx" ON "pots"("hand_id");

-- CreateIndex
CREATE INDEX "pots_hand_id_pot_type_pot_number_idx" ON "pots"("hand_id", "pot_type", "pot_number");

-- CreateIndex
CREATE INDEX "pot_winners_pot_id_idx" ON "pot_winners"("pot_id");

-- CreateIndex
CREATE INDEX "pot_winners_hand_player_id_idx" ON "pot_winners"("hand_player_id");

-- AddForeignKey
ALTER TABLE "accounts" ADD CONSTRAINT "accounts_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tables" ADD CONSTRAINT "tables_current_hand_id_fkey" FOREIGN KEY ("current_hand_id") REFERENCES "hands"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "table_seats" ADD CONSTRAINT "table_seats_table_id_fkey" FOREIGN KEY ("table_id") REFERENCES "tables"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "table_seats" ADD CONSTRAINT "table_seats_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "hands" ADD CONSTRAINT "hands_table_id_fkey" FOREIGN KEY ("table_id") REFERENCES "tables"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "hand_players" ADD CONSTRAINT "hand_players_hand_id_fkey" FOREIGN KEY ("hand_id") REFERENCES "hands"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "hand_players" ADD CONSTRAINT "hand_players_table_seat_id_fkey" FOREIGN KEY ("table_seat_id") REFERENCES "table_seats"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "actions" ADD CONSTRAINT "actions_hand_id_fkey" FOREIGN KEY ("hand_id") REFERENCES "hands"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "actions" ADD CONSTRAINT "actions_hand_player_id_fkey" FOREIGN KEY ("hand_player_id") REFERENCES "hand_players"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "community_cards" ADD CONSTRAINT "community_cards_hand_id_fkey" FOREIGN KEY ("hand_id") REFERENCES "hands"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pots" ADD CONSTRAINT "pots_hand_id_fkey" FOREIGN KEY ("hand_id") REFERENCES "hands"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pot_winners" ADD CONSTRAINT "pot_winners_pot_id_fkey" FOREIGN KEY ("pot_id") REFERENCES "pots"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pot_winners" ADD CONSTRAINT "pot_winners_hand_player_id_fkey" FOREIGN KEY ("hand_player_id") REFERENCES "hand_players"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
