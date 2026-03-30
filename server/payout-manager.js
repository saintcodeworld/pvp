import { createClient } from '@supabase/supabase-js';
import {
  Connection,
  Keypair,
  LAMPORTS_PER_SOL,
  PublicKey,
  SystemProgram,
  Transaction,
  sendAndConfirmTransaction,
} from '@solana/web3.js';

const PAYOUT_ENABLED = process.env.PAYOUT_ENABLED !== 'false';
const PAYOUT_CURRENCY = process.env.PAYOUT_CURRENCY || 'SOL';
const AUTO_PAYOUTS_ENABLED = process.env.AUTO_PAYOUTS_ENABLED === 'true';
const PAYOUT_BATCH_SIZE = Math.max(1, Math.min(50, Number(process.env.PAYOUT_BATCH_SIZE || 10)));
const PAYOUT_INTERVAL_MS = Math.max(2000, Math.min(120000, Number(process.env.PAYOUT_INTERVAL_MS || 15000)));
const SOLANA_RPC_URL = process.env.SOLANA_RPC_URL || '';

function readAmount(name, fallback) {
  const raw = process.env[name];
  if (raw == null || raw === '') return fallback;
  const parsed = Number(raw);
  if (!Number.isFinite(parsed) || parsed < 0) return fallback;
  return parsed;
}

const PAYOUTS = {
  pvp1v1Win: readAmount('PAYOUT_PVP_1V1_WIN_SOL', 0.05),
  pvp2v2WinEach: readAmount('PAYOUT_PVP_2V2_WIN_EACH_SOL', 0.03),
  ffaFirst: readAmount('PAYOUT_FFA_FIRST_SOL', 0.06),
  ffaSecond: readAmount('PAYOUT_FFA_SECOND_SOL', 0.03),
  ffaThird: readAmount('PAYOUT_FFA_THIRD_SOL', 0.01),
};

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_ANON_KEY;
const defaultSupabase = (supabaseUrl && supabaseKey) ? createClient(supabaseUrl, supabaseKey) : null;

function setupPayoutManager(supabase = defaultSupabase) {
  let runTimer = null;
  let isProcessing = false;
  let treasuryKeypair = null;
  let solanaConnection = null;

  function parseTreasuryKeypair() {
    const json = process.env.TREASURY_PRIVATE_KEY_JSON;
    if (json && json.trim()) {
      const arr = JSON.parse(json);
      if (!Array.isArray(arr)) throw new Error('TREASURY_PRIVATE_KEY_JSON must be a JSON array');
      return Keypair.fromSecretKey(Uint8Array.from(arr));
    }
    const b64 = process.env.TREASURY_PRIVATE_KEY_BASE64;
    if (b64 && b64.trim()) {
      return Keypair.fromSecretKey(Uint8Array.from(Buffer.from(b64, 'base64')));
    }
    throw new Error('Missing treasury key');
  }

  function ensureSolanaReady() {
    if (treasuryKeypair && solanaConnection) return true;
    if (!SOLANA_RPC_URL) return false;
    try {
      treasuryKeypair = parseTreasuryKeypair();
      solanaConnection = new Connection(SOLANA_RPC_URL, 'confirmed');
      return true;
    } catch (err) {
      console.error('[Payout] Treasury setup error:', err.message);
      return false;
    }
  }

  async function getWalletForUsername(username) {
    if (!supabase || !username) return null;
    const { data, error } = await supabase
      .from('profiles')
      .select('username, solana_wallet')
      .ilike('username', username)
      .limit(1)
      .maybeSingle();
    if (error) return null;
    const wallet = data?.solana_wallet;
    if (typeof wallet !== 'string') return null;
    const trimmed = wallet.trim();
    return trimmed || null;
  }

  async function queuePayouts(recipients, context) {
    if (!PAYOUT_ENABLED || !supabase || !Array.isArray(recipients) || recipients.length === 0) return;
    const rows = [];

    for (const entry of recipients) {
      const playerName = typeof entry?.playerName === 'string' ? entry.playerName.trim() : '';
      const amountSol = Number(entry?.amountSol);
      if (!playerName || !Number.isFinite(amountSol) || amountSol <= 0) continue;
      const wallet = await getWalletForUsername(playerName);
      const metadata = {
        mode: context?.mode || null,
        reason: context?.reason || null,
        matchId: context?.matchId || null,
        placement: entry?.placement ?? null,
      };
      rows.push({
        player_name: playerName,
        solana_wallet: wallet,
        amount_sol: amountSol,
        currency: PAYOUT_CURRENCY,
        game_mode: context?.mode || 'unknown',
        reason: context?.reason || 'match_reward',
        status: wallet ? 'pending' : 'wallet_missing',
        metadata,
      });
    }

    if (rows.length === 0) return;
    const { error } = await supabase.from('payout_records').insert(rows);
    if (error) {
      console.error('[Payout] Failed to queue payouts:', error.message);
    } else {
      console.log(`[Payout] Queued ${rows.length} payout record(s)`);
      if (AUTO_PAYOUTS_ENABLED) processPendingPayouts().catch(() => {});
    }
  }

  async function markFailed(payoutId, reason) {
    await supabase
      .from('payout_records')
      .update({
        status: 'failed',
        fail_reason: String(reason || 'failed').substring(0, 400),
        processed_at: new Date().toISOString(),
      })
      .eq('id', payoutId);
  }

  async function processSinglePayout(row) {
    if (!supabase || !row || !Number.isFinite(Number(row.amount_sol))) return;
    const claimed = await supabase
      .from('payout_records')
      .update({ status: 'processing', processing_started_at: new Date().toISOString() })
      .eq('id', row.id)
      .eq('status', 'pending')
      .select('id')
      .maybeSingle();
    if (claimed.error || !claimed.data) return;

    try {
      const lamports = Math.round(Number(row.amount_sol) * LAMPORTS_PER_SOL);
      if (!Number.isInteger(lamports) || lamports <= 0) {
        await markFailed(row.id, 'Invalid amount');
        return;
      }
      let destination;
      try {
        destination = new PublicKey(String(row.solana_wallet));
      } catch {
        await markFailed(row.id, 'Invalid destination wallet');
        return;
      }

      const tx = new Transaction().add(SystemProgram.transfer({
        fromPubkey: treasuryKeypair.publicKey,
        toPubkey: destination,
        lamports,
      }));
      const signature = await sendAndConfirmTransaction(solanaConnection, tx, [treasuryKeypair], {
        commitment: 'confirmed',
      });

      const { error } = await supabase
        .from('payout_records')
        .update({
          status: 'processed',
          tx_signature: signature,
          processed_at: new Date().toISOString(),
          fail_reason: null,
        })
        .eq('id', row.id);
      if (error) {
        console.error('[Payout] Failed to mark processed:', error.message);
      }
    } catch (err) {
      await markFailed(row.id, err.message || 'Transfer failed');
    }
  }

  async function processPendingPayouts() {
    if (isProcessing || !AUTO_PAYOUTS_ENABLED || !PAYOUT_ENABLED || !supabase) return;
    if (!ensureSolanaReady()) return;
    isProcessing = true;
    try {
      const { data, error } = await supabase
        .from('payout_records')
        .select('id, amount_sol, solana_wallet')
        .eq('status', 'pending')
        .not('solana_wallet', 'is', null)
        .order('created_at', { ascending: true })
        .limit(PAYOUT_BATCH_SIZE);
      if (error || !Array.isArray(data) || data.length === 0) return;
      for (const row of data) {
        await processSinglePayout(row);
      }
    } finally {
      isProcessing = false;
    }
  }

  function startAutoPayouts() {
    if (!AUTO_PAYOUTS_ENABLED || runTimer) return;
    if (!ensureSolanaReady()) {
      console.error('[Payout] Auto payouts disabled: missing SOLANA_RPC_URL or treasury key');
      return;
    }
    runTimer = setInterval(() => {
      processPendingPayouts().catch((err) => {
        console.error('[Payout] Worker error:', err.message);
      });
    }, PAYOUT_INTERVAL_MS);
    processPendingPayouts().catch(() => {});
    console.log(`[Payout] Auto payouts enabled from treasury ${treasuryKeypair.publicKey.toBase58()}`);
  }

  function stopAutoPayouts() {
    if (!runTimer) return;
    clearInterval(runTimer);
    runTimer = null;
  }

  return {
    queuePayouts,
    processPendingPayouts,
    startAutoPayouts,
    stopAutoPayouts,
    PAYOUTS,
    PAYOUT_ENABLED,
    AUTO_PAYOUTS_ENABLED,
  };
}

export { setupPayoutManager };
