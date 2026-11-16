// Rounds: the buy phase, the live phase, the objective, the score. This module owns the clock and
// the win conditions and nothing else — it never moves a body and never draws a pixel. The step
// calls it once a tick, after everyone has moved.
import { MAP } from '../world/map.js';
import {
  PHASE_BUY, PHASE_LIVE, PHASE_ROUND_END, PHASE_MATCH_END,
  BUY_TIME, ROUND_TIME, BOMB_TIME, FREEZE_TIME, ROUNDS_TO_WIN, PLANT_TIME, DEFUSE_TIME,
  TEAM_ATK, TEAM_DEF, emit, resetEntityForRound, placeOnSpawn, makeEntity,
} from '../sim/state.js';
import { WEAPONS } from '../weapons/defs.js';
import { awardRound, spend } from './economy.js';
import { prepareBot, botBuy } from '../ai/bots.js';

/** The buy menu, in key order. Four lines, four prices, no submenus. */
export const BUY_ITEMS = [
  { key: '1', label: 'VK-7 rifle', price: WEAPONS[0].price, note: '30 rounds, kills in three body shots' },
  { key: '2', label: 'Body armour', price: 650, note: 'soaks a quarter of every body shot' },
  { key: '3', label: 'Sunspot flash', price: WEAPONS[3].price, note: 'blinds anyone looking at it' },
  { key: '4', label: 'Defuse kit', price: 400, note: 'halves the defuse, defenders only' },
];

const LANE_ATK = ['long', 'mid', 'east'];
const LANE_DEF = ['site', 'mid', 'hall'];

export function createMatch() {
  return {
    /** Line the bodies up for a round and open the buy phase. */
    beginRound(st, col, nav, first) {
      st.phase = PHASE_BUY;
      st.phaseTime = BUY_TIME;
      st.roundWinner = -1;
      st.roundReason = '';
      st.buyOpen = true;
      st.botsBought = false;
      st.projectiles.length = 0;
      st.bomb.state = 'carried';
      st.bomb.carrier = -1;
      st.bomb.timer = 0;
      st.bomb.plantT = 0;
      st.bomb.defuseT = 0;
      st.bomb.defuser = -1;
      st.bomb.x = 0;
      st.bomb.y = 0;
      st.bomb.z = 0;

      let atkSlot = 0;
      let defSlot = 0;
      for (const e of st.entities) {
        resetEntityForRound(e);
        const spawn = e.team === TEAM_ATK ? MAP.spawns.atk[atkSlot++ % 3] : MAP.spawns.def[defSlot++ % 3];
        placeOnSpawn(e, spawn);
        if (!e.isPlayer) prepareBot(st, nav, e, e.team === TEAM_ATK ? LANE_ATK[(e.id - 1) % 3] : LANE_DEF[(e.id - 1) % 3]);
      }
      // The bomb rides with a random attacker — sometimes with the player.
      const attackers = st.entities.filter((e) => e.team === TEAM_ATK);
      const carrier = attackers[Math.floor(st.rng() * attackers.length)];
      carrier.hasBomb = true;
      st.bomb.carrier = carrier.id;
      if (!carrier.isPlayer) {
        // The carrier walks to the plant spot, not to a lane's holding angle. The leg from the end
        // of its lane is a real path through the graph, never a straight line through a wall.
        const spot = nav.index.get('s1');
        const end = carrier.path[carrier.path.length - 1];
        const tail = nav.find(end, spot);
        if (tail.length > 1) carrier.path = carrier.path.concat(tail.slice(1));
        carrier.pathStep = 0;
      }
      emit(st, 'roundStart', 0, 0, 0, st.round, 0, 0, 0);
    },

    /** Spend on the buy menu. `index` is 0-3. */
    buy(st, e, index) {
      const item = BUY_ITEMS[index];
      if (!item || st.phase !== PHASE_BUY) return false;
      if (index === 0) {
        if (e.inv[0].owned) return false;
        if (!spend(e, item.price)) return false;
        e.inv[0].owned = true;
        e.inv[0].mag = WEAPONS[0].mag;
        e.inv[0].reserve = WEAPONS[0].reserve;
        e.weapon = 0;
      } else if (index === 1) {
        if (e.armour >= 100) return false;
        if (!spend(e, item.price)) return false;
        e.armour = 100;
      } else if (index === 2) {
        if (!spend(e, item.price)) return false;
        e.inv[3].owned = true;
        e.inv[3].mag = Math.min(2, e.inv[3].mag + 1);
      } else if (index === 3) {
        if (e.team !== TEAM_DEF || e.hasKit) return false;
        if (!spend(e, item.price)) return false;
        e.hasKit = true;
      } else return false;
      emit(st, 'buy', e.x, e.y, e.z, e.id, index, e.money, 0);
      return true;
    },

    /** One tick of clock, objective and win checking. */
    update(st, col, nav, dt) {
      if (st.phase === PHASE_MATCH_END) return;

      if (st.phase === PHASE_BUY) {
        if (!st.botsBought && st.phaseTime < BUY_TIME - 2) {
          st.botsBought = true;
          for (const e of st.entities) if (!e.isPlayer) botBuy(st, e, st.round);
        }
        st.phaseTime -= dt;
        if (st.phaseTime <= 0) {
          st.phaseTime = ROUND_TIME;
          st.phase = PHASE_LIVE;
          st.buyOpen = false;
          emit(st, 'live', 0, 0, 0, st.round, 0, 0, 0);
        }
        return;
      }

      if (st.phase === PHASE_LIVE) {
        st.phaseTime -= dt;
        this.updateBomb(st, col, dt);
        if (st.phase !== PHASE_LIVE) return;
        const aliveAtk = countAlive(st, TEAM_ATK);
        const aliveDef = countAlive(st, TEAM_DEF);
        if (aliveDef === 0) { this.endRound(st, TEAM_ATK, 'Defenders eliminated'); return; }
        if (aliveAtk === 0 && st.bomb.state !== 'planted') { this.endRound(st, TEAM_DEF, 'Attackers eliminated'); return; }
        if (st.phaseTime <= 0) { this.endRound(st, TEAM_DEF, 'Time expired'); return; }
        return;
      }

      if (st.phase === PHASE_ROUND_END) {
        st.phaseTime -= dt;
        if (st.phaseTime > 0) return;
        if (st.scoreAtk >= ROUNDS_TO_WIN || st.scoreDef >= ROUNDS_TO_WIN) {
          st.phase = PHASE_MATCH_END;
          st.matchOver = true;
          st.buyOpen = false;
          emit(st, 'matchEnd', 0, 0, 0, st.scoreAtk, st.scoreDef, 0, 0);
        } else {
          st.round += 1;
          this.beginRound(st, col, nav, false);
        }
      }
    },

    /** Plant, beep, defuse, explode. The only place the objective's state machine lives. */
    updateBomb(st, col, dt) {
      const b = st.bomb;
      if (b.state === 'carried') {
        const carrier = st.entities[b.carrier];
        if (!carrier || !carrier.alive || !carrier.hasBomb) {
          // the carrier died: the bomb is on the floor where they fell, and anyone can take it
          const dead = carrier && !carrier.alive ? carrier : null;
          if (dead) { b.x = dead.x; b.y = dead.y; b.z = dead.z; }
          b.state = 'dropped';
          b.carrier = -1;
          emit(st, 'bombDrop', b.x, b.y, b.z, 0, 0, 0, 0);
          return;
        }
        const inSite = insideSite(carrier.x, carrier.z);
        const wantsPlant = carrier.isPlayer ? st.playerPlanting === true : carrier.speed < 1.2;
        if (inSite && wantsPlant) {
          b.plantT += dt;
          b.x = carrier.x;
          b.y = carrier.y;
          b.z = carrier.z;
          if (b.plantT >= PLANT_TIME) {
            b.state = 'planted';
            b.timer = BOMB_TIME;
            b.plantT = 0;
            b.defuseT = 0;
            carrier.hasBomb = false;
            emit(st, 'planted', b.x, b.y, b.z, carrier.id, 0, 0, 0);
          }
        } else if (b.plantT > 0) {
          b.plantT = Math.max(0, b.plantT - dt * 2);
        }
        return;
      }

      if (b.state === 'dropped') {
        // a body standing on the bomb picks it up
        for (const e of st.entities) {
          if (!e.alive || e.team !== TEAM_ATK || e.hasBomb) continue;
          const dx = e.x - b.x;
          const dz = e.z - b.z;
          if (dx * dx + dz * dz > 2.2) continue;
          e.hasBomb = true;
          b.carrier = e.id;
          b.state = 'carried';
          emit(st, 'bombPickup', e.x, e.y, e.z, e.id, 0, 0, 0);
          return;
        }
        return;
      }

      if (b.state === 'planted') {
        b.timer -= dt;
        const beeps = Math.ceil(b.timer / 1.2);
        if (beeps !== b.beeps) {
          b.beeps = beeps;
          emit(st, 'beep', b.x, b.y, b.z, b.timer < 10 ? 1 : 0, 0, 0, 0);
        }
        // defusing: a living defender within reach, holding the key, with a line to the bomb
        let defuser = null;
        for (const e of st.entities) {
          if (!e.alive || e.team !== TEAM_DEF) continue;
          const dx = e.x - b.x;
          const dz = e.z - b.z;
          if (dx * dx + dz * dz > 2.6) continue;
          const holding = e.isPlayer ? st.playerDefusing === true : e.speed < 1.1 && e.targetId < 0 && e.alertTimer < 4;
          if (holding) { defuser = e; break; }
        }
        if (defuser) {
          b.defuser = defuser.id;
          b.defuseT += dt;
          const need = defuser.hasKit ? DEFUSE_TIME * 0.5 : DEFUSE_TIME;
          if (b.defuseT >= need) {
            b.state = 'defused';
            this.endRound(st, TEAM_DEF, 'Bomb defused');
            emit(st, 'defused', b.x, b.y, b.z, defuser.id, 0, 0, 0);
          }
        } else {
          b.defuser = -1;
          b.defuseT = Math.max(0, b.defuseT - dt * 1.6);
        }
        if (b.timer <= 0 && b.state === 'planted') {
          b.state = 'exploded';
          st.shake = 1;
          this.endRound(st, TEAM_ATK, 'Bomb detonated');
          emit(st, 'explode', b.x, b.y, b.z, 0, 0, 0, 0);
        }
      }
    },

    endRound(st, winner, reason) {
      if (st.phase !== PHASE_LIVE) return;
      st.phase = PHASE_ROUND_END;
      st.phaseTime = FREEZE_TIME;
      st.roundWinner = winner;
      st.roundReason = reason;
      st.lastWinAtk = winner === TEAM_ATK;
      if (winner === TEAM_ATK) st.scoreAtk += 1;
      else st.scoreDef += 1;
      awardRound(st, winner, st.bomb.state === 'planted' || st.bomb.state === 'exploded' || st.bomb.state === 'defused');
      emit(st, 'roundWin', 0, 0, 0, winner, 0, 0, 0);
    },

    restart(st, col, nav) {
      st.round = 1;
      st.scoreAtk = 0;
      st.scoreDef = 0;
      st.lossStreakAtk = 0;
      st.lossStreakDef = 0;
      st.matchOver = false;
      st.stats.shots = 0;
      st.stats.hits = 0;
      st.stats.headshots = 0;
      for (const e of st.entities) {
        e.money = 800;
        e.kills = 0;
        e.deaths = 0;
      }
      this.beginRound(st, col, nav, true);
    },
  };
}

export function insideSite(x, z) {
  const s = MAP.site;
  const dx = x - s.x;
  const dz = z - s.z;
  return dx * dx + dz * dz < s.radius * s.radius;
}

function countAlive(st, team) {
  let n = 0;
  for (const e of st.entities) if (e.alive && e.team === team) n += 1;
  return n;
}

export { countAlive, makeEntity, PHASE_BUY, PHASE_LIVE, PHASE_ROUND_END, PHASE_MATCH_END };
