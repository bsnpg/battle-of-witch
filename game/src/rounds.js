// Rounds and the match: buy phase, live round, round end, next round, match end.
// Best of 5 rounds, first to 3 round wins takes the match. A round ends when one
// coven is wiped out, the banner is claimed, or the 3:00 clock runs out with no
// claim — that last one is a draw and neither coven scores. A 2–2 tie after five
// rounds goes to an overtime round: first claim or wipe wins it, and a draw there
// replays the overtime until someone takes it.
export const BUY_SECONDS = 15;
export const ROUND_SECONDS = 180;
export const ROUNDS_TO_WIN = 3;
export const MAX_ROUNDS = 5;

export function createRounds() {
  const state = {
    phase: 'menu', // menu | buy | live | ended | match
    round: 1,
    scoreAzure: 0,
    scoreEmber: 0,
    clock: BUY_SECONDS,
    endReason: '',
    endWinner: null,
    matchWinner: null,
    overtime: false,
    roundKills: 0,
  };

  function leader() {
    if (state.scoreAzure > state.scoreEmber) return 'azure';
    if (state.scoreEmber > state.scoreAzure) return 'ember';
    return null;
  }

  function settleMatch() {
    state.phase = 'match';
    state.matchWinner = leader() || 'draw';
  }

  return {
    state,
    startMatch() {
      state.phase = 'buy';
      state.round = 1;
      state.scoreAzure = 0;
      state.scoreEmber = 0;
      state.clock = BUY_SECONDS;
      state.endReason = '';
      state.endWinner = null;
      state.matchWinner = null;
      state.overtime = false;
      state.roundKills = 0;
    },
    startRound() {
      state.phase = 'buy';
      state.clock = BUY_SECONDS;
      state.endReason = '';
      state.endWinner = null;
      state.roundKills = 0;
    },
    beginLive() {
      state.phase = 'live';
      state.clock = ROUND_SECONDS;
    },
    endRound(winner, reason) {
      if (state.phase === 'ended' || state.phase === 'match') return false;
      state.phase = 'ended';
      state.endWinner = winner;
      state.endReason = reason;
      if (winner === 'azure') state.scoreAzure += 1;
      else if (winner === 'ember') state.scoreEmber += 1;
      // A draw scores for nobody.
      if (state.scoreAzure >= ROUNDS_TO_WIN || state.scoreEmber >= ROUNDS_TO_WIN) {
        settleMatch();
      } else if (state.round >= MAX_ROUNDS) {
        if (state.scoreAzure === state.scoreEmber) {
          // 2–2 after five rounds: overtime, first claim or wipe wins it.
          state.overtime = true;
        } else {
          settleMatch();
        }
      }
      return true;
    },
    nextRound() {
      if (state.overtime && state.round > MAX_ROUNDS) {
        // Overtime replays on the same round number until someone takes it.
        this.startRound();
        return;
      }
      state.round += 1;
      this.startRound();
    },
    tick(dt) {
      if (state.phase === 'buy' || state.phase === 'live') {
        state.clock = Math.max(0, state.clock - dt);
      }
    },
  };
}
