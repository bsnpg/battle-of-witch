// The DOM HUD. It never touches the simulation: main.js pushes numbers in and
// reads callbacks out. Every readout is cached and only written when it changes,
// so the HUD costs nothing on a quiet frame. Money is crystals of magic (◆), the
// weapon line is the spellbook, and the blast line shows the owned blast tome.
import { SPELLBOOKS, BLASTS, ARMOR_PRICE } from './weapons.js';
import { TEAM } from './palette.js';

const COPY = {
  start: {
    title: 'BATTLE OF WITCH',
    copy: 'Two covens, one banner. Claim the banner at the yard\'s heart — or wipe the Ember coven. Best of 5 rounds, first to 3 takes the match.',
    action: 'Click to play',
  },
  paused: {
    title: 'BATTLE OF WITCH',
    copy: 'Paused. Click to resume.',
    action: 'Click to resume',
  },
  round: {
    title: 'Round over',
    copy: '',
    action: 'Next round',
  },
  match: {
    title: 'Match over',
    copy: '',
    action: 'Play again',
  },
};

export function createHud(callbacks) {
  const $ = (id) => document.getElementById(id);
  const overlay = $('overlay');
  const title = $('overlay-title');
  const copy = $('overlay-copy');
  const play = $('play');
  const healthBar = $('health-fill');
  const healthValue = $('health-value');
  const armorValue = $('armor-value');
  const moneyValue = $('money-value');
  const ammoMag = $('ammo-mag');
  const ammoReserve = $('ammo-reserve');
  const weaponName = $('weapon-name');
  const blastValue = $('blast-count');
  const timerValue = $('timer-value');
  const scoreAzure = $('score-azure');
  const scoreEmber = $('score-ember');
  const roundValue = $('round-value');
  const objective = $('objective');
  const aliveAzure = $('alive-azure');
  const aliveEmber = $('alive-ember');
  const feedList = $('feed');
  const hitmarker = $('hitmarker');
  const crosshair = $('crosshair');
  const damageVignette = $('damage');
  const progressWrap = $('progress-wrap');
  const progressLabel = $('progress-label');
  const progressFill = $('progress-fill');
  const buyMenu = $('buy-menu');
  const buyMoney = $('buy-money');
  const buyGrid = $('buy-grid');
  const banner = $('banner');

  let last = {};
  let hitTimer = 0;
  let bannerTimer = 0;

  function setText(element, key, value) {
    if (last[key] === value) return;
    last[key] = value;
    element.textContent = value;
  }

  // Build the buy menu once from the spell tables: three books, three blast
  // tomes, one robe. Prices are crystals of magic.
  const buyButtons = {};
  function buyCard(id, name, detail, price, key) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'buy-card';
    button.innerHTML = `<span class="buy-key">${key}</span><span class="buy-name">${name}</span><span class="buy-detail">${detail}</span><span class="buy-price">◆ ${price}</span>`;
    button.addEventListener('click', () => callbacks.onBuy(id));
    buyGrid.appendChild(button);
    buyButtons[id] = button;
    return button;
  }
  buyCard('ember', 'Ember Lance', 'Auto bolt · 33 dmg · 30 charges', SPELLBOOKS.ember.price, '1');
  buyCard('frost', 'Frost Shards', 'Fast bolts · 22 dmg · 28 charges', SPELLBOOKS.frost.price, '2');
  buyCard('void', 'Void Lance', 'Heavy lance · 78 dmg · 8 charges', SPELLBOOKS.void.price, '3');
  buyCard('burst', 'Ember Burst', 'Blast tome · 70 dmg · 3 charges · G to cast', BLASTS.burst.price, '4');
  buyCard('fireball', 'Fireball', 'Blast tome · 120 dmg · 2 charges · slower orb', BLASTS.fireball.price, '5');
  buyCard('meteor', 'Meteor Call', 'Blast tome · 190 dmg · 1 charge · long wind-up', BLASTS.meteor.price, '6');
  buyCard('armor', 'Robe of Warding', 'Absorbs half of each hit', ARMOR_PRICE, '7');
  $('buy-close').addEventListener('click', () => callbacks.onBuyClose());

  function refreshBuy(money, owned, blastId, blastCharges, hasArmor) {
    setText(buyMoney, 'buyMoney', `◆ ${money}`);
    for (const [id, button] of Object.entries(buyButtons)) {
      const ownedNow = id === 'armor' ? hasArmor : id in BLASTS ? blastId === id : owned.has(id);
      const price = id === 'armor' ? ARMOR_PRICE : id in BLASTS ? BLASTS[id].price : SPELLBOOKS[id].price;
      button.classList.toggle('owned', ownedNow);
      button.classList.toggle('poor', !ownedNow && money < price);
    }
  }

  return {
    setHealth(health) {
      setText(healthValue, 'health', String(Math.max(0, Math.ceil(health))));
      const pct = Math.max(0, Math.min(100, health));
      if (last.healthPct !== pct) {
        last.healthPct = pct;
        healthBar.style.width = `${pct}%`;
        healthBar.classList.toggle('low', pct <= 30);
      }
    },
    setArmor(armor) {
      setText(armorValue, 'armor', armor > 0 ? `Robe ${armor}` : 'No robe');
    },
    setMoney(money) {
      setText(moneyValue, 'money', `◆ ${money}`);
    },
    setAmmo(mag, reserve) {
      setText(ammoMag, 'mag', String(mag));
      setText(ammoReserve, 'reserve', `/ ${reserve}`);
      $('ammo').classList.toggle('empty', mag === 0);
    },
    setWeapon(name, blastText) {
      setText(weaponName, 'weapon', name);
      setText(blastValue, 'blast', blastText);
    },
    setTimer(seconds, planted) {
      const total = Math.max(0, Math.ceil(seconds));
      const text = `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`;
      setText(timerValue, 'timer', text);
      $('timer').classList.toggle('planted', planted);
    },
    setScore(azure, ember, round) {
      setText(scoreAzure, 'scoreA', String(azure));
      setText(scoreEmber, 'scoreE', String(ember));
      setText(roundValue, 'round', `ROUND ${round}`);
    },
    setObjective(text) {
      setText(objective, 'objective', text);
    },
    setAlive(azure, ember) {
      setText(aliveAzure, 'aliveA', '●'.repeat(azure) + '○'.repeat(8 - azure));
      setText(aliveEmber, 'aliveE', '●'.repeat(ember) + '○'.repeat(8 - ember));
    },
    setCrosshairSpread(spread) {
      const px = Math.round(4 + spread * 900);
      if (last.spreadPx === px) return;
      last.spreadPx = px;
      crosshair.style.setProperty('--gap', `${px}px`);
    },
    hitMarker(killed, holdMs = 90) {
      hitmarker.classList.add('on');
      hitmarker.classList.toggle('kill', killed);
      clearTimeout(hitTimer);
      hitTimer = setTimeout(() => hitmarker.classList.remove('on', 'kill'), holdMs);
    },
    damageFlash(strength) {
      damageVignette.style.opacity = String(Math.min(0.85, strength));
    },
    showBanner(text, ms = 2600) {
      banner.textContent = text;
      banner.classList.add('on');
      clearTimeout(bannerTimer);
      bannerTimer = setTimeout(() => banner.classList.remove('on'), ms);
    },
    addFeed(text, team) {
      const item = document.createElement('div');
      item.className = `feed-item ${team}`;
      item.textContent = text;
      feedList.prepend(item);
      while (feedList.children.length > 5) feedList.lastChild.remove();
    },
    clearFeed() {
      feedList.innerHTML = '';
    },
    clearBanner() {
      clearTimeout(bannerTimer);
      banner.classList.remove('on');
    },
    setProgress(label, fraction) {
      if (fraction <= 0) {
        progressWrap.hidden = true;
        return;
      }
      progressWrap.hidden = false;
      progressLabel.textContent = label;
      progressFill.style.width = `${Math.round(fraction * 100)}%`;
    },
    showBuy(money, owned, blastId, blastCharges, hasArmor) {
      buyMenu.hidden = false;
      refreshBuy(money, owned, blastId, blastCharges, hasArmor);
    },
    hideBuy() {
      buyMenu.hidden = true;
    },
    refreshBuy,
    showOverlay(mode, data = {}) {
      const text = COPY[mode];
      title.textContent = mode === 'round' ? (data.won ? 'Round won' : data.draw ? 'Round drawn' : 'Round lost') : mode === 'match' ? (data.won ? 'Coven prevails' : data.draw ? 'Dead even' : 'Coven falls') : text.title;
      if (mode === 'round') copy.textContent = `${data.reason} — ${TEAM.azure.name} ${data.scoreAzure} · ${data.scoreEmber} ${TEAM.ember.name}.`;
      else if (mode === 'match') copy.textContent = `${TEAM.azure.name} ${data.scoreAzure} · ${data.scoreEmber} ${TEAM.ember.name}. ${data.won ? 'The banner is yours.' : data.draw ? 'Nobody takes the banner.' : 'Ember holds the banner.'}`;
      else copy.textContent = text.copy;
      play.textContent = text.action;
      overlay.hidden = false;
      play.focus();
    },
    hideOverlay() {
      overlay.hidden = true;
    },
    onPlay(handler) {
      play.addEventListener('click', handler);
    },
  };
}
