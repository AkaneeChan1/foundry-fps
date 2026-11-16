// The HUD. It reads the state once a frame and writes only what changed, so a 200 fps monitor does
// not relayout the document 200 times a second. Every number on screen comes from the simulation;
// nothing here invents a value the game does not have.
import { WEAPONS } from '../weapons/defs.js';
import { PHASE_BUY, PHASE_LIVE, PHASE_ROUND_END, PHASE_MATCH_END, TEAM_ATK, TEAM_DEF, BOMB_TIME } from '../sim/state.js';

const FEED_LIFE = 6.5;
const FEED_MAX = 5;

function el(id) {
  return document.getElementById(id);
}

export function createHud() {
  const dom = {
    timer: el('timer'),
    clock: el('clock'),
    roundLabel: el('round-label'),
    scoreAtk: el('score-atk'),
    scoreDef: el('score-def'),
    pipsAtk: el('pips-atk'),
    pipsDef: el('pips-def'),
    hp: el('hp'),
    hpBar: el('hp-bar'),
    statHp: el('stat-hp'),
    armour: el('armour'),
    armourBar: el('armour-bar'),
    statArm: el('stat-arm'),
    money: el('money'),
    wpn: el('wpn'),
    mag: el('mag'),
    reserve: el('reserve'),
    ammo: el('ammo'),
    reloadHint: el('reload-hint'),
    crosshair: el('crosshair'),
    hitmarker: el('hitmarker'),
    killfeed: el('killfeed'),
    banner: el('banner'),
    bannerTitle: el('banner-title'),
    bannerSub: el('banner-sub'),
    objective: el('objective'),
    objText: el('obj-text'),
    objFill: el('obj-fill'),
    vignette: el('vignette'),
    blind: el('blind'),
    overlay: el('overlay'),
    overlayTitle: el('overlay-title'),
    overlayCopy: el('overlay-copy'),
    overlayEyebrow: el('overlay-eyebrow'),
    play: el('play'),
    playLine: el('play-line'),
    scoreline: el('scoreline'),
    howto: el('howto'),
    buymenu: el('buymenu'),
  };

  const chT = dom.crosshair.querySelector('.t');
  const chB = dom.crosshair.querySelector('.b');
  const chL = dom.crosshair.querySelector('.l');
  const chR = dom.crosshair.querySelector('.r');

  const pips = { atk: [], def: [] };
  for (let i = 0; i < 4; i += 1) {
    const a = document.createElement('i');
    a.className = 'pip atk';
    dom.pipsAtk.appendChild(a);
    pips.atk.push(a);
    const d = document.createElement('i');
    d.className = 'pip def';
    dom.pipsDef.appendChild(d);
    pips.def.push(d);
  }

  const cache = {
    timer: '', label: '', hp: -1, armour: -1, money: -1, wpn: '', mag: -1, reserve: -1,
    atk: -1, def: -1, gap: -1, low: null, reloading: null, obj: '', objFill: -1, vite: -1, blind: -1,
  };
  let bannerTimer = 0;
  let hitTimer = 0;
  const feed = [];
  let now = 0;

  function setText(node, key, value) {
    if (cache[key] === value) return;
    cache[key] = value;
    node.textContent = value;
  }

  function teamAlive(st, team) {
    let n = 0;
    for (const e of st.entities) if (e.team === team && e.alive) n += 1;
    return n;
  }

  function objectiveText(st, me) {
    const b = st.bomb;
    if (st.phase === PHASE_MATCH_END) return '';
    if (b.state === 'planted') {
      const left = Math.max(0, b.timer);
      if (me.team === TEAM_DEF) return `Defuse the charge · ${left.toFixed(0)}s`;
      return `Charge armed · ${left.toFixed(0)}s`;
    }
    if (b.state === 'defused') return 'Charge defused';
    if (b.state === 'exploded') return 'Charge detonated';
    if (b.state === 'dropped') return me.team === TEAM_ATK ? 'Charge on the floor — pick it up' : 'Charge dropped';
    if (st.phase === PHASE_BUY) return me.team === TEAM_ATK ? 'Buy, then take Site A' : 'Buy, then hold Site A';
    return me.team === TEAM_ATK ? (me.hasBomb ? 'Plant at Site A — hold E in the zone' : 'Cover the carrier') : 'Hold Site A';
  }

  function objectiveProgress(st) {
    const b = st.bomb;
    if (b.state === 'planted') {
      if (b.defuseT > 0) {
        const need = st.entities[b.defuser]?.hasKit ? 6.5 * 0.5 : 6.5;
        return Math.min(1, b.defuseT / need); // someone is cutting it: the bar fills
      }
      return Math.max(0, Math.min(1, b.timer / BOMB_TIME)); // otherwise: the fuse burns down
    }
    if (st.phase === PHASE_LIVE && b.plantT > 0) return Math.min(1, b.plantT / 3.2);
    return 0;
  }

  return {
    /** Per-frame sync. `spread` is the live cone in radians; `blind` is 0..1. */
    update(st, me, spread, blind, dt) {
      now += dt;
      const secs = Math.max(0, st.phaseTime);
      const mm = Math.floor(secs / 60);
      const ss = Math.floor(secs % 60);
      setText(dom.timer, 'timer', `${mm}:${ss < 10 ? '0' : ''}${ss}`);
      let label;
      if (st.phase === PHASE_BUY) label = `Round ${st.round} · Buy phase`;
      else if (st.phase === PHASE_LIVE) label = `Round ${st.round} · Live`;
      else if (st.phase === PHASE_ROUND_END) label = `Round ${st.round} · Over`;
      else label = 'Match over';
      setText(dom.roundLabel, 'label', label);
      const low = st.phase === PHASE_LIVE && secs < 20;
      if (cache.low !== low) {
        cache.low = low;
        dom.clock.classList.toggle('low', low);
      }

      setText(dom.scoreAtk, 'atk', String(st.scoreAtk));
      setText(dom.scoreDef, 'def', String(st.scoreDef));

      const aliveAtk = teamAlive(st, TEAM_ATK);
      const aliveDef = teamAlive(st, TEAM_DEF);
      for (let i = 0; i < 4; i += 1) {
        pips.atk[i].classList.toggle('gone', i >= aliveAtk);
        pips.def[i].classList.toggle('gone', i >= aliveDef);
      }

      const hp = Math.max(0, Math.round(me.health));
      const armour = Math.max(0, Math.round(me.armour));
      setText(dom.hp, 'hp', String(hp));
      setText(dom.armour, 'armour', String(armour));
      dom.hpBar.style.width = `${hp}%`;
      dom.armourBar.style.width = `${Math.min(100, armour)}%`;
      dom.statHp.classList.toggle('low', hp <= 30);
      dom.statArm.classList.toggle('low', armour <= 0);
      setText(dom.money, 'money', String(me.money));

      const w = WEAPONS[me.weapon];
      setText(dom.wpn, 'wpn', w.name);
      const slot = me.inv[me.weapon];
      const mag = w.kind === 'gun' ? slot.mag : w.kind === 'melee' ? 1 : slot.mag;
      const reserve = w.kind === 'gun' ? slot.reserve : 0;
      setText(dom.mag, 'mag', String(mag));
      setText(dom.reserve, 'reserve', w.kind === 'gun' ? `/ ${reserve}` : '');
      dom.ammo.classList.toggle('empty', w.kind === 'gun' && slot.mag === 0);
      const reloading = me.reloading;
      if (cache.reloading !== reloading) {
        cache.reloading = reloading;
        dom.reloadHint.classList.toggle('on', reloading);
      }

      // Crosshair: the gap is the real cone, scaled so a still rifle is a fine cross and a run
      // is a warning. Never a fixed reticle — the player can read their own accuracy off it.
      const gap = Math.min(30, 3 + spread * 620);
      if (Math.abs(gap - cache.gap) > 0.4) {
        cache.gap = gap;
        chT.style.top = `${31 - gap - 7}px`;
        chB.style.top = `${31 + gap}px`;
        chL.style.left = `${31 - gap - 7}px`;
        chR.style.left = `${31 + gap}px`;
      }

      const obj = objectiveText(st, me);
      if (obj !== cache.obj) {
        cache.obj = obj;
        dom.objText.innerHTML = obj.replace('Site A', '<b>Site A</b>');
        dom.objective.classList.toggle('on', obj !== '');
      }
      const prog = objectiveProgress(st);
      if (Math.abs(prog - cache.objFill) > 0.01) {
        cache.objFill = prog;
        dom.objFill.style.width = `${prog * 100}%`;
      }

      if (cache.vite !== st.hitFlash) {
        cache.vite = st.hitFlash;
        dom.vignette.style.opacity = String(Math.min(1, st.hitFlash));
      }
      if (Math.abs(blind - cache.blind) > 0.01) {
        cache.blind = blind;
        dom.blind.style.opacity = String(Math.min(1, blind * 0.96));
      }
      if (me.flash > 0.6 && me.alive && blind < 0.2) dom.blind.style.opacity = '0';

      if (bannerTimer > 0) {
        bannerTimer -= dt;
        if (bannerTimer <= 0) dom.banner.classList.remove('on');
      }
      if (hitTimer > 0) {
        hitTimer -= dt;
        if (hitTimer <= 0) dom.hitmarker.classList.remove('on');
      }
      for (let i = feed.length - 1; i >= 0; i -= 1) {
        if (now - feed[i].born > FEED_LIFE) {
          feed[i].node.remove();
          feed.splice(i, 1);
        }
      }
    },

    hit(head, kill) {
      dom.hitmarker.classList.add('on');
      dom.hitmarker.classList.toggle('kill', !!kill);
      hitTimer = kill ? 0.28 : 0.09;
      void head;
    },

    feed(killer, victim, weapon, head, killerTeam) {
      const row = document.createElement('div');
      row.className = `feed ${killerTeam === TEAM_ATK ? 'atk' : 'def'}`;
      const k = document.createElement('span');
      k.className = killer === 'You' ? 'who you' : 'who';
      k.textContent = killer;
      const how = document.createElement('span');
      how.className = head ? 'how head' : 'how';
      how.textContent = head ? `${weapon} · head` : weapon;
      const v = document.createElement('span');
      v.className = victim === 'You' ? 'who you' : 'who';
      v.textContent = victim;
      row.append(k, how, v);
      dom.killfeed.appendChild(row);
      feed.push({ node: row, born: now });
      while (feed.length > FEED_MAX) {
        const old = feed.shift();
        old.node.remove();
      }
    },

    banner(title, sub, atk, seconds = 2.6) {
      dom.bannerTitle.textContent = title;
      dom.bannerSub.textContent = sub;
      dom.banner.classList.toggle('atk', atk === true);
      dom.banner.classList.toggle('def', atk === false);
      dom.banner.classList.add('on');
      bannerTimer = seconds;
    },

    showBuy(open, items, me) {
      dom.buymenu.classList.toggle('on', open);
      if (!open) return;
      if (dom.buymenu.childElementCount !== items.length) {
        dom.buymenu.textContent = '';
        for (const item of items) {
          const card = document.createElement('div');
          card.className = 'buy';
          card.dataset.key = item.key;
          const k = document.createElement('span');
          k.className = 'k';
          k.textContent = item.key;
          const n = document.createElement('span');
          n.className = 'n';
          n.textContent = item.label;
          const p = document.createElement('span');
          p.className = 'p';
          p.textContent = `$${item.price}`;
          const d = document.createElement('span');
          d.className = 'd';
          d.textContent = item.note;
          card.append(k, n, p, d);
          dom.buymenu.appendChild(card);
        }
      }
      const cards = dom.buymenu.children;
      for (let i = 0; i < cards.length; i += 1) {
        const owned = (i === 0 && me.inv[0].owned) || (i === 1 && me.armour >= 100)
          || (i === 2 && me.inv[3].mag > 0) || (i === 3 && me.hasKit);
        cards[i].classList.toggle('afford', me.money >= items[i].price && !owned);
        cards[i].classList.toggle('owned', owned);
      }
    },

    showOverlay(mode, data = {}) {
      dom.overlay.hidden = false;
      document.body.classList.add('menu');
      // The controls belong on the way in; once a match is over, the scoreboard takes that space.
      dom.howto.hidden = mode !== 'start';
      dom.scoreline.classList.toggle('loud', mode !== 'start');
      if (mode === 'pause') {
        dom.overlayEyebrow.textContent = 'Paused';
        dom.overlayTitle.innerHTML = 'HOLD<em>ING</em>';
        dom.overlayCopy.textContent = 'Click to take the mouse back.';
        dom.play.textContent = 'Click to resume';
        dom.scoreline.hidden = false;
        dom.scoreline.innerHTML = `Raiders <b>${data.atk ?? 0}</b> — <b>${data.def ?? 0}</b> Wardens · round ${data.round ?? 1}`;
      } else if (mode === 'end') {
        const won = data.won;
        dom.overlayEyebrow.textContent = won ? 'Match over · Raiders take it' : 'Match over · Wardens take it';
        dom.overlayTitle.innerHTML = won ? 'MATCH <em>WON</em>' : 'MATCH <em>LOST</em>';
        dom.overlayCopy.textContent = won ? 'Site A is yours. The raid is over — run it back on a fresh economy.' : 'The Wardens held. The raid is over — run it back on a fresh economy.';
        dom.play.textContent = 'Play again';
        dom.scoreline.hidden = false;
        dom.scoreline.innerHTML = `Raiders <b>${data.atk ?? 0}</b> — <b>${data.def ?? 0}</b> Wardens · `
          + `<b>${data.kills ?? 0}</b> kills · <b>${data.heads ?? 0}</b> head shots · <b>${data.acc ?? 0}%</b> accuracy`;
      } else {
        dom.play.textContent = 'Click to deploy';
        dom.scoreline.hidden = true;
      }
      dom.play.focus({ preventScroll: true });
    },

    hideOverlay() {
      dom.overlay.hidden = true;
      document.body.classList.remove('menu');
    },

    reset() {
      cache.timer = '';
      cache.hp = -1;
      cache.mag = -1;
      cache.obj = '';
      dom.killfeed.textContent = '';
      feed.length = 0;
      dom.banner.classList.remove('on');
    },
  };
}
