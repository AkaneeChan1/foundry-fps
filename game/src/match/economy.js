// The money. Nothing here touches the world: it only turns a round's result into the amount a
// body can spend next round, which is what makes losing twice a strategy and winning cheap a risk.
import { MAX_MONEY } from '../sim/state.js';

export const WIN_REWARD = 3250;
export const LOSS_BASE = 1400;
export const LOSS_STEP = 500;
export const LOSS_CAP = 3400;
export const PLANT_BONUS = 300;

export function clampMoney(e) {
  if (e.money > MAX_MONEY) e.money = MAX_MONEY;
  if (e.money < 0) e.money = 0;
}

/** The loss bonus a side is owed after losing `streak` rounds in a row. */
export function lossReward(streak) {
  const r = LOSS_BASE + LOSS_STEP * Math.max(0, streak - 1);
  return r > LOSS_CAP ? LOSS_CAP : r;
}

/** Award a finished round. `winner` is 0 for attackers, 1 for defenders. */
export function awardRound(st, winner, planted) {
  const atkWon = winner === 0;
  if (atkWon) {
    st.lossStreakAtk = 0;
    st.lossStreakDef += 1;
  } else {
    st.lossStreakDef = 0;
    st.lossStreakAtk += 1;
  }
  const atkPay = atkWon ? WIN_REWARD : lossReward(st.lossStreakAtk);
  const defPay = atkWon ? lossReward(st.lossStreakDef) : WIN_REWARD;

  for (const e of st.entities) {
    e.money += e.team === 0 ? atkPay : defPay;
    if (planted && e.team === 0) e.money += PLANT_BONUS;
    clampMoney(e);
  }
}

/** Spend on an item. Returns true when the purchase went through. */
export function spend(e, price) {
  if (e.money < price) return false;
  e.money -= price;
  return true;
}
