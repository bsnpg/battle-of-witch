// The economy: crystals of magic, earned each round and spent in the buy menu.
// Win big, lose small, kill for a bonus, claim the banner for a bonus — the same
// shape as the genre's classic, with original numbers. A draw pays the loss
// income, so the economy keeps moving. The buy menu only opens during the buy
// phase, and the shop sells spellbooks and robes.
import { SPELLBOOKS, BLASTS, ARMOR_PRICE } from './weapons.js';

export const START_CRYSTALS = 800;
export const WIN_REWARD = 3250;
export const LOSS_REWARD = 1900;
export const KILL_REWARD = 300;
export const CAPTURE_REWARD = 300;

export function createEconomy() {
  const state = { crystals: START_CRYSTALS, kills: 0, captures: 0 };

  function canAfford(cost) {
    return state.crystals >= cost;
  }

  // Returns the bought id, or null when the player cannot afford it / already owns it.
  function buyBook(id, owned) {
    const def = SPELLBOOKS[id];
    if (!def) return null;
    if (owned.has(id)) return null;
    if (!canAfford(def.price)) return null;
    state.crystals -= def.price;
    owned.add(id);
    return id;
  }

  // A blast tome: buying it grants its charges. Buying the same tier again
  // refills the charges at full price, so crystals always have a sink.
  function buyBlast(id, blastId, blastCharges) {
    const def = BLASTS[id];
    if (!def) return null;
    if (!canAfford(def.price)) return null;
    state.crystals -= def.price;
    return { id, charges: def.charges };
  }

  function buyArmor(hasArmor) {
    if (hasArmor || !canAfford(ARMOR_PRICE)) return false;
    state.crystals -= ARMOR_PRICE;
    return true;
  }

  return {
    state,
    canAfford,
    buyBook,
    buyBlast,
    buyArmor,
    resetMatch() {
      state.crystals = START_CRYSTALS;
      state.kills = 0;
      state.captures = 0;
    },
    rewardKill() {
      state.crystals += KILL_REWARD;
      state.kills += 1;
    },
    rewardCapture() {
      state.crystals += CAPTURE_REWARD;
      state.captures += 1;
    },
    rewardRound(won) {
      state.crystals += won ? WIN_REWARD : LOSS_REWARD;
    },
  };
}
