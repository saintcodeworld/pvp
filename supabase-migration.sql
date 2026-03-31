-- ═══════════════════════════════════════════════════════════════════
-- PVP WARS — Supabase Database Migration
-- Run this SQL in: Supabase Dashboard → SQL Editor → New Query
-- ═══════════════════════════════════════════════════════════════════

-- 1. Profiles table (extends auth.users)
CREATE TABLE IF NOT EXISTS public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  username TEXT UNIQUE NOT NULL,
  solana_wallet TEXT DEFAULT NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

-- Users can read all profiles (for leaderboard)
CREATE POLICY "Profiles are viewable by everyone"
  ON public.profiles FOR SELECT
  USING (true);

-- Users can update their own profile
CREATE POLICY "Users can update own profile"
  ON public.profiles FOR UPDATE
  USING (auth.uid() = id);

-- Users can insert their own profile (on signup)
CREATE POLICY "Users can insert own profile"
  ON public.profiles FOR INSERT
  WITH CHECK (auth.uid() = id);

-- 2. Match results table
CREATE TABLE IF NOT EXISTS public.match_results (
  id BIGSERIAL PRIMARY KEY,
  winner_name TEXT NOT NULL,
  loser_name TEXT NOT NULL,
  winner_rounds INTEGER NOT NULL DEFAULT 0,
  loser_rounds INTEGER NOT NULL DEFAULT 0,
  played_at TIMESTAMPTZ DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.match_results ENABLE ROW LEVEL SECURITY;

-- Everyone can read match results (for leaderboard)
CREATE POLICY "Match results are viewable by everyone"
  ON public.match_results FOR SELECT
  USING (true);

-- Server (anon key) can insert match results
CREATE POLICY "Server can insert match results"
  ON public.match_results FOR INSERT
  WITH CHECK (true);

-- 3. Add game_mode column to match_results (for 1v1 vs 2v2 filtering)
ALTER TABLE public.match_results ADD COLUMN IF NOT EXISTS game_mode TEXT DEFAULT '1v1';

-- 4. Free-For-All results table
CREATE TABLE IF NOT EXISTS public.ffa_results (
  id BIGSERIAL PRIMARY KEY,
  player_name TEXT NOT NULL,
  placement INTEGER NOT NULL,        -- 1 = winner, 2-8 = order of elimination
  kills INTEGER NOT NULL DEFAULT 0,
  total_players INTEGER NOT NULL DEFAULT 8,
  played_at TIMESTAMPTZ DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.ffa_results ENABLE ROW LEVEL SECURITY;

-- Everyone can read FFA results (for leaderboard)
CREATE POLICY "FFA results are viewable by everyone"
  ON public.ffa_results FOR SELECT
  USING (true);

-- Server (anon key) can insert FFA results
CREATE POLICY "Server can insert FFA results"
  ON public.ffa_results FOR INSERT
  WITH CHECK (true);

CREATE TABLE IF NOT EXISTS public.payout_records (
  id BIGSERIAL PRIMARY KEY,
  player_name TEXT NOT NULL,
  solana_wallet TEXT DEFAULT NULL,
  amount_sol NUMERIC(18,9) NOT NULL CHECK (amount_sol > 0),
  currency TEXT NOT NULL DEFAULT 'SOL',
  game_mode TEXT NOT NULL,
  reason TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  metadata JSONB DEFAULT '{}'::jsonb,
  processing_started_at TIMESTAMPTZ DEFAULT NULL,
  tx_signature TEXT DEFAULT NULL,
  fail_reason TEXT DEFAULT NULL,
  created_at TIMESTAMPTZ DEFAULT now(),
  processed_at TIMESTAMPTZ DEFAULT NULL
);

ALTER TABLE public.payout_records ADD COLUMN IF NOT EXISTS processing_started_at TIMESTAMPTZ DEFAULT NULL;
ALTER TABLE public.payout_records ADD COLUMN IF NOT EXISTS tx_signature TEXT DEFAULT NULL;
ALTER TABLE public.payout_records ADD COLUMN IF NOT EXISTS fail_reason TEXT DEFAULT NULL;

ALTER TABLE public.payout_records ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Payout records are viewable by everyone"
  ON public.payout_records FOR SELECT
  USING (true);

CREATE POLICY "Server can insert payout records"
  ON public.payout_records FOR INSERT
  WITH CHECK (true);

-- 5. Auto-create profile on user signup via trigger
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (id, username)
  VALUES (NEW.id, NEW.raw_user_meta_data->>'username');
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Drop existing trigger if any
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_new_user();
