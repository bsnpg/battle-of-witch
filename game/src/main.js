// Battle of Witch — boot and the one loop. A fixed 60 Hz simulation feeds a render
// at the display's rate; rendering never mutates the simulation. The player casts
// hitscan bolts against bot bodies (headshots pay more) and the map; bots cast back
// through the events their module emits. Rounds, the banner, the blast orbs and
// the buy menu all live here, wired to the modules that own them.
//
// ?shot=start|play|buy|flag with &seed=N sets up a deterministic frame, renders
// it twice, freezes it and sets window.__shotReady — the capture mode the
// screenshots are taken from.
// ?selftest=1 runs the logic checks below instead of the game loop and writes
// the results to window.__selftest.
import * as THREE from 'three';
import { PALETTE } from './palette.js';
import { mulberry32, clamp } from './rng.js';
import { createMap } from './map.js';
import { createPlayer } from './player.js';
import { createWeapons, SPELLBOOKS, BLASTS, ARMOR_PRICE } from './weapons.js';
import { createBots } from './bots.js';
import { createFlag } from './flag.js';
import { createEconomy } from './economy.js';
import { createRounds, BUY_SECONDS } from './rounds.js';
import { createEffects } from './effects.js';
import { createHud } from './hud.js';
import { createInput } from './input.js';
import { createAudio } from './audio.js';
import { createGameState } from './state.js';

const FIXED_STEP = 1 / 60;
const params = new URLSearchParams(window.location.search);
const shot = params.get('shot');
const seed = Number.parseInt(params.get('seed') ?? '1', 10) || 1;
const random = mulberry32(seed);

window.addEventListener('error', (event) => {
  window.__gameError = String(event.message || event.error || 'error');
});

const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
document.getElementById('game').appendChild(renderer.domElement);

const scene = new THREE.Scene();
scene.background = new THREE.Color(PALETTE.sky);
scene.fog = new THREE.Fog(new THREE.Color(PALETTE.sky), 26, 60);
const camera = new THREE.PerspectiveCamera(74, window.innerWidth / window.innerHeight, 0.05, 160);
scene.add(camera);

const map = createMap(scene);
const audio = createAudio();
const game = createGameState();
const state = game.state;
const economy = createEconomy();
const rounds = createRounds();
const flag = createFlag(scene);
const effects = createEffects(scene);
const bots = createBots(scene, map, random);
const player = createPlayer(map.colliders, map.azureSpawn);
const weapons = createWeapons(camera);
const input = createInput(renderer.domElement, onLockChange);

// Clicking the canvas while a round is live but the pointer is free re-locks it,
// so a failed lock request after closing the buy menu never strands the player.
renderer.domElement.addEventListener('mousedown', () => {
  if (shot) return;
  if (!input.state.locked && (rounds.state.phase === 'live' || rounds.state.phase === 'buy') && !state.buyOpen) {
    input.requestLock();
  }
});

const raycaster = new THREE.Raycaster();
raycaster.far = 90;
const direction = new THREE.Vector3();
const muzzle = new THREE.Vector3();
const aimPoint = new THREE.Vector3();
const worldView = {
  time: 0,
  canFight: false,
  playerAlive: true,
  playerPos: player.state.position,
  playerCrouching: false,
  playerSpeed: 0,
  noise: null,
  flag: flag.state,
  zoneName: (x, z) => map.zoneName(x, z),
};

let frozen = false;
let overlayTimer = -1;
let stepSoundAt = 0;
let lastClockSecond = -1;
let lastCaptureMark = 0;
let lastRadioAt = -99;
let lastFlagTeam = null;
let lastContested = false;

const hud = createHud({
  onBuy: buyItem,
  onBuyClose: closeBuy,
});
hud.setMinimapWalls(map.colliders);
hud.onPlay(() => {
  if (shot) return;
  audio.unlock();
  if (rounds.state.phase === 'match') {
    restartMatch();
    return;
  }
  if (rounds.state.phase === 'ended') {
    nextRound();
    return;
  }
  if (rounds.state.phase === 'menu') {
    startMatch();
    return;
  }
  input.requestLock();
});

function onLockChange(locked) {
  if (shot) return;
  if (locked) {
    hud.hideOverlay();
    if (state.buyOpen) closeBuy();
  } else if (rounds.state.phase === 'live' && !state.buyOpen && overlayTimer < 0) {
    hud.showOverlay('paused');
  }
}

function syncCamera() {
  const body = player.state;
  camera.position.set(body.position.x, body.position.y + body.eye, body.position.z);
  camera.rotation.set(body.pitch, body.yaw, 0, 'YXZ');
  const targetFov = body.aiming ? weapons.def().zoomFov : 74;
  if (Math.abs(camera.fov - targetFov) > 0.05) {
    camera.fov += (targetFov - camera.fov) * 0.2;
    camera.updateProjectionMatrix();
  }
}

function aimAt(point) {
  const body = player.state;
  const dx = point.x - body.position.x;
  const dy = point.y - (body.position.y + body.eye);
  const dz = point.z - body.position.z;
  const length = Math.hypot(dx, dy, dz) || 1;
  body.yaw = Math.atan2(-dx, -dz);
  body.pitch = Math.asin(clamp(dy / length, -1, 1));
  syncCamera();
}

function muzzleWorld() {
  muzzle.set(0.24, -0.17, -0.95);
  return camera.localToWorld(muzzle);
}

function blastText() {
  const def = weapons.blastDef();
  return def ? `✦ ${def.name} ×${weapons.state.blastCharges}` : '✦ no blast tome';
}

// The radio: one line at a time, at most one every three seconds, from the
// first living Azure witch. Bot callouts and banner callouts share the throttle.
function postRadio(text) {
  if (state.time - lastRadioAt < 3) return;
  lastRadioAt = state.time;
  hud.addRadio(text);
}

function radioFromBot(text) {
  const caller = bots.bots.find((b) => b.team === 'azure' && b.alive);
  postRadio(`RADIO ${caller ? caller.name : 'Coven'}: ${text}`);
}

function applyPlayerDamage(amount, fromName, head) {
  if (!state.alive) return;
  let remaining = amount;
  if (state.armor > 0) {
    const absorbed = Math.min(state.armor, Math.round(amount * 0.5));
    state.armor -= absorbed;
    remaining -= absorbed;
  }
  state.health -= remaining;
  state.damageFlash = 1;
  audio.hurt();
  hud.setHealth(state.health);
  hud.setArmor(state.armor);
  if (state.health <= 0) {
    state.health = 0;
    state.alive = false;
    state.deaths += 1;
    game.addFeed(`${fromName} ▸ You${head ? ' (headshot)' : ''}`, 'ember');
    hud.addFeed(`${fromName} ▸ You${head ? ' (headshot)' : ''}`, 'ember');
    hud.showBanner('You are down — your coven fights on', 3000);
    input.exitLock();
    checkRoundEnd();
  }
}

function castBolt(spread) {
  if (!weapons.takeCharge()) {
    audio.dryFire();
    return false;
  }
  camera.getWorldDirection(direction);
  direction.x += (random() * 2 - 1) * spread;
  direction.y += (random() * 2 - 1) * spread;
  direction.z += (random() * 2 - 1) * spread;
  direction.normalize();
  const from = muzzleWorld().clone();
  scene.updateMatrixWorld(true);
  raycaster.set(camera.position, direction);
  const targets = map.shootables.concat(bots.hitMeshes());
  const hit = raycaster.intersectObjects(targets, false)[0];
  const end = hit ? hit.point.clone() : camera.position.clone().add(direction.clone().multiplyScalar(60));
  effects.tracer(from, end, weapons.def().element);
  state.noise = { x: player.state.position.x, z: player.state.position.z, time: state.time };
  audio.shot(weapons.def().element, 1);
  if (hit && hit.object.userData.bot) {
    const bot = hit.object.userData.bot;
    const head = hit.object.userData.part === 'head';
    const def = weapons.def();
    const damage = Math.round(def.damage * (head ? def.headMult : 1));
    bots.damageBot(bot, damage, { name: 'You', team: 'azure' }, head);
    hud.hitMarker(!bot.alive, 4000);
    audio.hit();
    if (!bot.alive) {
      audio.kill();
      state.kills += 1;
      economy.rewardKill();
      game.addFeed(`You ▸ ${bot.name}${head ? ' (headshot)' : ''}`, 'azure');
      hud.addFeed(`You ▸ ${bot.name}${head ? ' (headshot)' : ''}`, 'azure');
      hud.setMoney(economy.state.crystals);
      checkRoundEnd();
    }
  } else if (hit) {
    effects.spark(hit.point);
  }
  weapons.pullTrigger();
  player.recoil(weapons.def().recoil * (0.9 + random() * 0.3), (random() * 2 - 1) * 0.004);
  hud.setAmmo(weapons.state.charges[weapons.state.current].mag, weapons.state.charges[weapons.state.current].reserve);
  return true;
}

function castBlast() {
  const def = weapons.blastDef();
  if (!def || weapons.state.blastCharges <= 0 || state.orb || state.orbPending
    || weapons.state.blastCooldown > 0 || rounds.state.phase !== 'live' || !state.alive) return false;
  if (!weapons.takeBlastCharge()) return false;
  weapons.state.blastCooldown = def.cooldown;
  state.orbPending = def;
  state.orbWindUp = def.windUp;
  audio.castWindUp(def.windUp);
  hud.setWeapon(weapons.def().name, blastText());
  return true;
}

function launchOrb(def) {
  camera.getWorldDirection(direction);
  state.orb = {
    x: camera.position.x, y: camera.position.y, z: camera.position.z,
    vx: direction.x * def.speed + player.state.velocity.x,
    vy: direction.y * def.speed + 3.5,
    vz: direction.z * def.speed + player.state.velocity.z,
    fuse: def.fuse,
    tier: def.id,
  };
  state.noise = { x: player.state.position.x, z: player.state.position.z, time: state.time };
}

function explodeOrb() {
  const orb = state.orb;
  if (!orb) return;
  const def = BLASTS[orb.tier];
  state.orb = null;
  const at = new THREE.Vector3(orb.x, Math.max(0.3, orb.y), orb.z);
  effects.hideOrb();
  effects.explosion(at, def.element);
  audio.explosion();
  state.noise = { x: orb.x, z: orb.z, time: state.time };
  for (const bot of bots.bots) {
    if (!bot.alive || bot.team === 'azure') continue;
    const dist = Math.hypot(bot.position.x - orb.x, bot.position.z - orb.z);
    if (dist < def.radius) {
      const damage = Math.round(def.damage * (1 - (dist / def.radius) * 0.6));
      bots.damageBot(bot, damage, { name: 'You', team: 'azure' }, false);
      if (!bot.alive) {
        state.kills += 1;
        economy.rewardKill();
        hud.addFeed(`You ▸ ${bot.name} (${def.name})`, 'azure');
        hud.setMoney(economy.state.crystals);
      }
    }
  }
  const playerDist = Math.hypot(player.state.position.x - orb.x, player.state.position.z - orb.z);
  if (playerDist < def.radius && state.alive) {
    // Blast tomes are risky up close: half damage to the caster too.
    applyPlayerDamage(Math.round(def.damage * (1 - (playerDist / def.radius) * 0.6) * 0.5), `Your ${def.name}`, false);
  }
  if (def.id === 'nova') {
    // Void Nova leaves a collapsing void field behind its blast: four seconds
    // of burn and drag inside a shrinking circle, so the dearest tome keeps
    // hurting after the orb is gone.
    state.voidField = { x: at.x, y: at.y, z: at.z, left: 4, radius: def.radius, startRadius: def.radius, tick: 0 };
    effects.showVoidField(at.x, at.y, at.z, def.radius);
  }
  checkRoundEnd();
}

function stepOrb(dt) {
  if (state.orbPending) {
    state.orbWindUp -= dt;
    hud.setProgress(`Channelling ${state.orbPending.name}`, 1 - state.orbWindUp / state.orbPending.windUp);
    if (state.orbWindUp <= 0) {
      const def = state.orbPending;
      state.orbPending = null;
      hud.setProgress('', 0);
      launchOrb(def);
    }
    return;
  }
  const orb = state.orb;
  if (!orb) return;
  orb.fuse -= dt;
  orb.vy -= 13 * dt;
  orb.x += orb.vx * dt;
  orb.y += orb.vy * dt;
  orb.z += orb.vz * dt;
  effects.showOrb(orb.x, orb.y, orb.z, BLASTS[orb.tier].element);
  let boom = orb.fuse <= 0 || orb.y < 0.12;
  if (!boom) {
    for (const box of map.colliders) {
      if (box.max.y <= 0.05) continue;
      if (orb.x > box.min.x - 0.1 && orb.x < box.max.x + 0.1 && orb.y > box.min.y - 0.1 && orb.y < box.max.y + 0.1 && orb.z > box.min.z - 0.1 && orb.z < box.max.z + 0.1) {
        boom = true;
        break;
      }
    }
  }
  if (boom) explodeOrb();
}

function stepVoidField(dt) {
  const field = state.voidField;
  if (!field) return;
  field.left -= dt;
  if (field.left <= 0) {
    state.voidField = null;
    effects.hideVoidField();
    return;
  }
  // The circle collapses from its blast radius to nothing over four seconds.
  field.radius = field.startRadius * (field.left / 4);
  effects.showVoidField(field.x, field.y, field.z, field.radius);
  if (rounds.state.phase !== 'live') return;
  // The void drags every witch inside it toward the centre, a slow pull the
  // target can fight by walking out — but the circle is shrinking too.
  for (const bot of bots.bots) {
    if (!bot.alive || bot.team === 'azure') continue;
    const dx = field.x - bot.position.x;
    const dz = field.z - bot.position.z;
    const dist = Math.hypot(dx, dz);
    if (dist >= field.radius || dist < 0.05) continue;
    const pull = 1.2 * dt;
    bot.position.x += (dx / dist) * pull;
    bot.position.z += (dz / dist) * pull;
    bot.group.position.x = bot.position.x;
    bot.group.position.z = bot.position.z;
  }
  // Half-second burn ticks: 20 damage a tick to every witch still inside, half
  // that to the caster if they are standing in their own field.
  field.tick += dt;
  if (field.tick < 0.5) return;
  field.tick -= 0.5;
  for (const bot of bots.bots) {
    if (!bot.alive || bot.team === 'azure') continue;
    const burnDist = Math.hypot(bot.position.x - field.x, bot.position.z - field.z);
    if (burnDist >= field.radius) continue;
    bots.damageBot(bot, 20, { name: 'You', team: 'azure' }, false);
    if (!bot.alive) {
      state.kills += 1;
      economy.rewardKill();
      hud.addFeed(`You ▸ ${bot.name} (Void Nova)`, 'azure');
      hud.setMoney(economy.state.crystals);
    }
  }
  if (state.alive) {
    const casterDist = Math.hypot(player.state.position.x - field.x, player.state.position.z - field.z);
    if (casterDist < field.radius) applyPlayerDamage(10, 'Your Void Nova', false);
  }
  checkRoundEnd();
}

function checkRoundEnd() {
  if (rounds.state.phase !== 'live') return;
  const azureAlive = (state.alive ? 1 : 0) + bots.aliveCount('azure');
  const emberAlive = bots.aliveCount('ember');
  if (emberAlive === 0) endRound('azure', 'Ember coven eliminated');
  else if (azureAlive === 0) endRound('ember', 'Azure coven eliminated');
}

function endRound(winner, reason) {
  if (!rounds.endRound(winner, reason)) return;
  economy.rewardRound(winner === 'azure');
  hud.setMoney(economy.state.crystals);
  hud.setScore(rounds.state.scoreAzure, rounds.state.scoreEmber, rounds.state.round);
  if (winner === 'azure') audio.roundWin();
  else if (winner === 'ember') audio.roundLoss();
  else audio.tick();
  overlayTimer = 1.4;
}

function startMatch() {
  game.resetMatch();
  economy.resetMatch();
  weapons.resetMatch();
  rounds.startMatch();
  startRound();
  hud.setMoney(economy.state.crystals);
  hud.setScore(0, 0, 1);
  hud.hideOverlay();
  input.requestLock();
}

function restartMatch() {
  startMatch();
}

function startRound() {
  game.resetRound();
  flag.resetRound();
  weapons.refillRound();
  bots.resetRound(seed + rounds.state.round);
  player.respawn(map.azureSpawn, 0);
  state.owned = new Set(['spark', ...[...state.owned].filter((id) => id !== 'spark')]);
  rounds.startRound();
  lastCaptureMark = 0;
  lastFlagTeam = null;
  lastContested = false;
  hud.setHealth(100);
  hud.setArmor(state.armor);
  hud.setMoney(economy.state.crystals);
  hud.setScore(rounds.state.scoreAzure, rounds.state.scoreEmber, rounds.state.round);
  hud.setObjective('Claim the banner at the yard\'s heart — or wipe the Ember coven');
  hud.setAmmo(weapons.state.charges[weapons.state.current].mag, weapons.state.charges[weapons.state.current].reserve);
  hud.setWeapon(weapons.def().name, blastText());
  hud.setAlive(8, 8);
  if (!shot) openBuy();
  syncCamera();
}

function nextRound() {
  if (rounds.state.phase === 'match') {
    restartMatch();
    return;
  }
  rounds.nextRound();
  startRound();
  hud.hideOverlay();
  input.requestLock();
}

function openBuy() {
  if (rounds.state.phase !== 'buy') return;
  state.buyOpen = true;
  hud.showBuy(economy.state.crystals, state.owned, weapons.state.blastId, weapons.state.blastCharges, state.armor > 0);
  input.exitLock();
}

function closeBuy() {
  state.buyOpen = false;
  hud.hideBuy();
  if (!shot && rounds.state.phase !== 'menu') input.requestLock();
}

function buyItem(id) {
  if (rounds.state.phase !== 'buy') return;
  if (id === 'armor') {
    if (economy.buyArmor(state.armor > 0)) {
      state.armor = 100;
      audio.buy();
    } else audio.denied();
  } else if (id in BLASTS) {
    const bought = economy.buyBlast(id);
    if (bought) {
      weapons.setBlast(bought.id);
      audio.buy();
      hud.setWeapon(weapons.def().name, blastText());
    } else audio.denied();
  } else {
    const bought = economy.buyBook(id, state.owned);
    if (bought) {
      weapons.give(id);
      audio.buy();
      hud.setAmmo(weapons.state.charges[id].mag, weapons.state.charges[id].reserve);
      hud.setWeapon(weapons.def().name, blastText());
    } else audio.denied();
  }
  hud.setMoney(economy.state.crystals);
  hud.setArmor(state.armor);
  hud.refreshBuy(economy.state.crystals, state.owned, weapons.state.blastId, weapons.state.blastCharges, state.armor > 0);
}

function drainBotEvents() {
  for (const event of bots.events) {
    if (event.type === 'shot') {
      effects.tracer(event.from, event.to, event.team === 'azure' ? 'bolt' : 'ember');
      const dist = event.from.distanceTo(camera.position);
      audio.shot('bolt', clamp(1.4 - dist / 40, 0.08, 0.7));
      state.noise = { x: event.from.x, z: event.from.z, time: state.time };
    } else if (event.type === 'damage-player') {
      applyPlayerDamage(event.amount, event.from, event.head);
    } else if (event.type === 'radio') {
      postRadio(event.text);
    } else if (event.type === 'kill') {
      const killer = event.killerTeam === 'azure' ? 'azure' : 'ember';
      game.addFeed(`${event.killerName} ▸ ${event.victim.name}${event.head ? ' (headshot)' : ''}`, killer);
      // Player kills are already fed by castBolt / explodeOrb at the moment of
      // the kill (with their detail, e.g. the blast name); the event only feeds
      // bot-on-bot kills, so a player kill never shows twice.
      if (event.killerName !== 'You') {
        hud.addFeed(`${event.killerName} ▸ ${event.victim.name}${event.head ? ' (headshot)' : ''}`, killer);
      }
      checkRoundEnd();
    }
  }
  bots.events.length = 0;
}

function step(dt) {
  state.time += dt;
  worldView.time = state.time;
  // The buy phase is safe: bots walk to their positions but never engage.
  // (bots.js gates sight and firing on world.canFight; it was never set, so
  // bots fought — and killed the player — all through the buy phase.)
  worldView.canFight = rounds.state.phase === 'live';
  worldView.playerAlive = state.alive;
  worldView.playerCrouching = player.state.crouching;
  worldView.playerSpeed = player.groundSpeed();
  worldView.noise = state.noise;

  rounds.tick(dt);
  if (rounds.state.phase === 'buy' && rounds.state.clock <= 0) {
    rounds.beginLive();
    closeBuy();
    hud.showBanner(`Round ${rounds.state.round} — claim the banner`, 3000);
    hud.setObjective('Claim the banner at the yard\'s heart — or wipe the Ember coven');
    lastRadioAt = -99;
    radioFromBot('Push the banner');
  }
  if (rounds.state.phase === 'live') {
    // The banner: who stands on the ring decides the claim.
    const inRing = (x, z) => {
      const dx = x - flag.state.x;
      const dz = z - flag.state.z;
      return dx * dx + dz * dz < flag.state.radius * flag.state.radius;
    };
    let azureHere = state.alive && inRing(player.state.position.x, player.state.position.z);
    let emberHere = false;
    for (const bot of bots.bots) {
      if (!bot.alive || !inRing(bot.position.x, bot.position.z)) continue;
      if (bot.team === 'azure') azureHere = true;
      else emberHere = true;
    }
    const claimed = flag.captureTick(dt, azureHere, emberHere);
    // Banner radio: a claim starting, or the ring turning contested, is
    // called out once — the objective's state of play, spoken aloud.
    const contested = azureHere && emberHere;
    if (flag.state.team && flag.state.team !== lastFlagTeam) {
      radioFromBot(flag.state.team === 'ember' ? 'Ember is claiming the banner — contest it!' : 'Claiming the banner — cover me');
    } else if (contested && !lastContested) {
      radioFromBot('Banner contested — hold the ring');
    }
    lastFlagTeam = flag.state.team;
    lastContested = contested;
    if (flag.state.team && flag.state.progress > 0) {
      hud.setProgress(flag.state.team === 'azure' ? 'Azure claiming the banner' : 'Ember claiming the banner', flag.state.progress);
      const mark = Math.floor(flag.state.progress * 4);
      if (mark > lastCaptureMark) {
        lastCaptureMark = mark;
        audio.captureBeep(false);
      }
    } else {
      hud.setProgress('', 0);
      lastCaptureMark = 0;
    }
    if (claimed) {
      if (claimed === 'azure') {
        economy.rewardCapture();
        hud.setMoney(economy.state.crystals);
      }
      audio.capture();
      endRound(claimed, `Banner claimed by ${claimed === 'azure' ? 'Azure' : 'Ember'}`);
    } else if (rounds.state.clock <= 0) {
      endRound(null, 'Time expired — the banner stands unclaimed');
    }
  }
  flag.syncMesh(state.time);

  if (rounds.state.phase === 'buy' || rounds.state.phase === 'live') {
    player.step(dt, input.state.keys, input.state.aiming && state.alive);
    weapons.step(dt, input.state.aiming);
    bots.step(dt, worldView);
    drainBotEvents();
    stepOrb(dt);

    // Spotted intel: an Ember witch the player can see is marked for the
    // minimap; the minimap and the ground name follow the player every step.
    if (state.alive) {
      for (const bot of bots.bots) {
        if (!bot.alive || bot.team !== 'ember') continue;
        const dx = bot.position.x - player.state.position.x;
        const dz = bot.position.z - player.state.position.z;
        if (dx * dx + dz * dz > 42 * 42) continue;
        if (!map.segmentBlocked(player.state.position.x, player.state.position.y + player.state.eye, player.state.position.z, bot.position.x, 1.2, bot.position.z)) {
          bot.spottedAt = state.time;
        }
      }
    }
    hud.drawMinimap({
      px: player.state.position.x, pz: player.state.position.z, yaw: player.state.yaw,
      bots: bots.bots, flagTeam: flag.state.team, flagProgress: flag.state.progress, time: state.time,
    });
    hud.setZone(map.zoneName(player.state.position.x, player.state.position.z));

    // Footsteps while moving on the ground.
    if (player.groundSpeed() > 1.5 && player.state.onGround && state.time - stepSoundAt > 0.38) {
      stepSoundAt = state.time;
      audio.step();
    }
  }

  // The void field collapses on its own clock, even as the round ends.
  stepVoidField(dt);

  effects.step(dt);
  state.damageFlash = Math.max(0, state.damageFlash - dt * 1.6);
  hud.damageFlash(state.damageFlash);

  if (overlayTimer > 0) {
    overlayTimer -= dt;
    if (overlayTimer <= 0) {
      overlayTimer = -1;
      if (rounds.state.phase === 'match') {
        hud.showOverlay('match', { won: rounds.state.matchWinner === 'azure', draw: rounds.state.matchWinner === 'draw', scoreAzure: rounds.state.scoreAzure, scoreEmber: rounds.state.scoreEmber });
        input.exitLock();
      } else {
        hud.showOverlay('round', { won: rounds.state.endWinner === 'azure', draw: rounds.state.endWinner === null, reason: rounds.state.endReason, scoreAzure: rounds.state.scoreAzure, scoreEmber: rounds.state.scoreEmber });
        input.exitLock();
      }
    }
  }

  const clockSecond = Math.ceil(rounds.state.clock);
  if (clockSecond !== lastClockSecond) {
    lastClockSecond = clockSecond;
    if ((rounds.state.phase === 'buy' || rounds.state.phase === 'live') && clockSecond <= 5 && clockSecond > 0) audio.tick();
  }
  hud.setTimer(rounds.state.clock, flag.state.team !== null);
  hud.setAlive((state.alive ? 1 : 0) + bots.aliveCount('azure'), bots.aliveCount('ember'));
  hud.setCrosshairSpread(state.alive ? weapons.spread(player.groundSpeed(), input.state.aiming) : 0.01);
}

let accumulator = 0;
let lastTime = performance.now();

function frame(now) {
  requestAnimationFrame(frame);
  const dt = Math.min((now - lastTime) / 1000, 0.1);
  lastTime = now;
  if (!frozen) {
    scene.updateMatrixWorld(true);
    const look = input.takeLook();
    if (state.alive && (rounds.state.phase === 'buy' || rounds.state.phase === 'live')) player.look(look.x, look.y);
    // Edge-triggered keys.
    if (input.takePressed('KeyR') && state.alive) {
      if (weapons.recharge()) audio.recharge();
    }
    if (input.takePressed('KeyG')) castBlast();
    if (input.takePressed('KeyB')) {
      if (state.buyOpen) closeBuy();
      else openBuy();
    }
    if (state.buyOpen) {
      if (input.takePressed('Digit1')) buyItem('ember');
      if (input.takePressed('Digit2')) buyItem('frost');
      if (input.takePressed('Digit3')) buyItem('void');
      if (input.takePressed('Digit4')) buyItem('burst');
      if (input.takePressed('Digit5')) buyItem('fireball');
      if (input.takePressed('Digit6')) buyItem('meteor');
      if (input.takePressed('Digit7')) buyItem('nova');
      if (input.takePressed('Digit8')) buyItem('armor');
      if (input.takePressed('Escape')) closeBuy();
    } else {
      if (input.takePressed('Digit1') && state.owned.has('spark')) weapons.equip('spark');
      if (input.takePressed('Digit2') && state.owned.has('ember')) weapons.equip('ember');
      if (input.takePressed('Digit3') && state.owned.has('frost')) weapons.equip('frost');
      if (input.takePressed('Digit4') && state.owned.has('void')) weapons.equip('void');
      if (input.state.firing && state.alive && weapons.ready() && (rounds.state.phase === 'live' || rounds.state.phase === 'buy')) {
        // Automatic books cast while held; semi-automatic ones cast once per click.
        if (weapons.def().auto || input.takeClick()) {
          castBolt(weapons.spread(player.groundSpeed(), input.state.aiming));
        }
      } else {
        input.takeClick();
      }
    }
    if (rounds.state.phase === 'buy' || rounds.state.phase === 'live' || rounds.state.phase === 'ended' || rounds.state.phase === 'match') {
      accumulator += dt;
      let steps = 0;
      while (accumulator >= FIXED_STEP && steps < 5) {
        step(FIXED_STEP);
        accumulator -= FIXED_STEP;
        steps += 1;
      }
      if (accumulator > FIXED_STEP * 5) accumulator = 0;
    }
    if (state.alive) {
      const slot = weapons.state.charges[weapons.state.current];
      hud.setAmmo(slot.mag, slot.reserve);
    }
    syncCamera();
  }
  renderer.render(scene, camera);
}

function settle(steps) {
  for (let index = 0; index < steps; index += 1) step(FIXED_STEP);
}

function paintTwiceThenReady() {
  let painted = 0;
  function paint() {
    requestAnimationFrame(paint);
    syncCamera();
    renderer.render(scene, camera);
    painted += 1;
    if (painted === 2) {
      window.__shotReady = true;
      frozen = true;
    }
  }
  requestAnimationFrame(paint);
}

function nearestEmberBot() {
  let target = null;
  let best = Infinity;
  for (const bot of bots.bots) {
    if (!bot.alive || bot.team !== 'ember') continue;
    const dist = Math.hypot(bot.position.x - player.state.position.x, bot.position.z - player.state.position.z);
    if (dist < best) {
      best = dist;
      target = bot;
    }
  }
  return target;
}

// Capture staging: put the player back on their feet at full health after the
// settle, with a clean feed and no banner, so the frame shows a live fight.
function stagePlayer(x, z) {
  player.respawn({ x, z }, 0);
  state.health = 100;
  state.alive = true;
  state.damageFlash = 0;
  state.feed.length = 0;
  hud.setHealth(100);
  hud.damageFlash(0);
  hud.clearFeed();
  hud.clearBanner();
  syncCamera();
}

function runShot(name) {
  hud.hideOverlay();
  hud.hideBuy();
  if (name === 'start') {
    player.respawn(map.azureSpawn, 0);
    bots.resetRound(seed);
    settle(30);
    aimAt(new THREE.Vector3(0, 1.6, -10));
    hud.setHealth(100);
    hud.setMoney(economy.state.crystals);
    hud.setScore(0, 0, 1);
    hud.setTimer(BUY_SECONDS, false);
    hud.setAlive(8, 8);
    // The menu phase never steps the simulation, so the minimap would stay
    // blank behind the overlay — draw it once from the staged state.
    hud.drawMinimap({
      px: player.state.position.x, pz: player.state.position.z, yaw: player.state.yaw,
      bots: bots.bots, flagTeam: flag.state.team, flagProgress: flag.state.progress, time: state.time,
    });
    hud.setZone(map.zoneName(player.state.position.x, player.state.position.z));
    hud.showOverlay('start');
    document.getElementById('overlay').style.background = 'rgba(20, 24, 31, 0.55)';
  } else if (name === 'buy') {
    startMatch();
    economy.state.crystals = 3500;
    settle(10);
    player.respawn({ x: -2, z: 15 }, 0);
    aimAt(new THREE.Vector3(0, 1.6, -10));
    hud.showBuy(economy.state.crystals, state.owned, weapons.state.blastId, weapons.state.blastCharges, false);
    hud.setMoney(economy.state.crystals);
  } else if (name === 'play') {
    startMatch();
    rounds.beginLive();
    weapons.give('ember');
    settle(240);
    // Stage the frame: the settle lets the bots walk into the yard, and they
    // may have killed the player by then — restore the player, clear the feed,
    // and put the nearest defender in the open mid lane to shoot at.
    stagePlayer(3.5, 7);
    const target = nearestEmberBot();
    if (target) {
      target.position.set(1.5, 0, -3.0);
      target.yaw = Math.PI;
      target.group.position.set(1.5, 0, -3.0);
      target.group.rotation.y = Math.PI;
      target.seen = null;
      target.state = 'hold';
      target.holdUntil = state.time + 10;
      aimPoint.set(target.position.x, 1.2, target.position.z);
      aimAt(aimPoint);
      for (let round = 0; round < 4; round += 1) {
        castBolt(0);
        settle(6);
      }
    } else {
      aimAt(new THREE.Vector3(0, 1.5, 1));
      castBolt(0);
      settle(6);
    }
    hud.setScore(0, 0, 1);
  } else if (name === 'flag') {
    startMatch();
    rounds.beginLive();
    weapons.give('ember');
    settle(120);
    // Stage the claim: the player stands back from the ring with the banner
    // three quarters claimed, an Ember witch contesting from the ring's far edge.
    stagePlayer(0.5, 6.5);
    flag.state.team = 'azure';
    flag.state.progress = 0.7;
    const guard = nearestEmberBot();
    if (guard) {
      guard.position.set(-2.2, 0, 1.5);
      guard.yaw = Math.PI * 0.75;
      guard.group.position.set(-2.2, 0, 1.5);
      guard.group.rotation.y = Math.PI * 0.75;
      guard.seen = null;
      guard.state = 'hold';
      guard.holdUntil = state.time + 10;
    }
    aimAt(new THREE.Vector3(0, 2.2, 1));
    hud.setObjective('Claim the banner — Azure is channelling it');
    hud.setProgress('Azure claiming the banner', 0.7);
    hud.setTimer(150, true);
    hud.setScore(0, 0, 1);
  }
  hud.setAmmo(weapons.state.charges[weapons.state.current].mag, weapons.state.charges[weapons.state.current].reserve);
  hud.setWeapon(weapons.def().name, blastText());
  paintTwiceThenReady();
}

// Logic self-test (?selftest=1): drives the real simulation headlessly and
// reports PASS/FAIL lines to window.__selftest. No pointer lock, no rendering
// loop — settle() steps the fixed-step simulation directly.
function runSelfTest() {
  const results = [];
  const check = (name, ok) => results.push(`${ok ? 'PASS' : 'FAIL'} ${name}`);
  try {
    startMatch();
    check('15 bots on the field (7 Azure, 8 Ember)', bots.bots.length === 15 && bots.aliveCount('azure') === 7 && bots.aliveCount('ember') === 8);
    // Buy phase: safe staging — no combat, nobody standing on the ring.
    settle(840); // fourteen seconds of the fifteen-second buy phase
    check('buy phase is safe: nobody takes damage', rounds.state.phase === 'buy' && state.health === 100 && bots.bots.every((b) => b.health === 100));
    check('flag pushers stage off the ring during buy', bots.bots.every((b) => !b.alive || Math.hypot(b.position.x - 0, b.position.z - 1) >= 2.6));
    rounds.beginLive();
    check('round starts live with 3:00 clock', rounds.state.phase === 'live' && Math.round(rounds.state.clock) === 180);
    // Banner claim, first, while the round is still fresh: one Azure witch
    // on the ring, Ember witches far away. It must run before the covens
    // reach the ring on their own — five live seconds in, the ring is already
    // a contested scrum and no single witch's channel proves anything. The
    // placed witch faces south and forgets every contact, and the Ember
    // witches face north, so the claim is tested in isolation — in live play
    // a witch that spots an enemy leaves the ring to fight it.
    const azureBot = bots.bots.find((b) => b.team === 'azure' && b.alive);
    azureBot.position.set(0, 0, 1);
    azureBot.group.position.set(0, 0, 1);
    azureBot.state = 'hold';
    azureBot.holdUntil = 99999;
    azureBot.route = [];
    azureBot.seen = null;
    azureBot.yaw = Math.PI;
    azureBot.burstLeft = 0;
    for (const b of bots.bots) {
      if (b.team !== 'ember') continue;
      b.position.set(0, 0, -16);
      b.group.position.set(0, 0, -16);
      b.state = 'hold';
      b.holdUntil = 99999;
      b.seen = null;
      b.yaw = 0;
      b.burstLeft = 0;
    }
    player.respawn({ x: 8, z: 8 }, 0);
    settle(300);
    check('banner claim ends the round for Azure', rounds.state.phase === 'ended' && rounds.state.endWinner === 'azure' && rounds.state.scoreAzure === 1);
    // A fresh round for the opening-seconds checks: the pushers are still
    // walking in from staging, so no claim may complete yet.
    nextRound();
    rounds.beginLive();
    settle(240); // four live seconds
    check('no instant banner claim in the opening seconds', rounds.state.phase === 'live');
    check('teammates never target the player', bots.bots.filter((b) => b.team === 'azure').every((b) => !b.seen || b.seen.kind !== 'player'));
    check('minimap canvas is drawn', document.getElementById('minimap').toDataURL().length > 2000);
    window.__witch.hud.addRadio('RADIO Test: minimap check');
    check('radio line posts to the HUD', document.querySelectorAll('#radio .radio-item').length > 0);
    check('Spark Bolt starts with 12 charges', weapons.state.charges.spark.mag === 12);
    weapons.takeCharge();
    weapons.takeCharge();
    weapons.takeCharge();
    check('casting spends charges', weapons.state.charges.spark.mag === 9);
    while (weapons.state.charges.spark.mag > 0) weapons.takeCharge();
    check('empty book cannot cast', weapons.ready() === false);
    const started = weapons.recharge();
    settle(100);
    check('R recharges the book', started && weapons.state.charges.spark.mag === 12);
    // Wipe.
    nextRound();
    rounds.beginLive();
    for (const b of bots.bots) if (b.team === 'ember' && b.alive) bots.damageBot(b, 999, null, false);
    settle(30);
    check('wiping Ember ends the round', rounds.state.phase === 'ended' && rounds.state.endWinner === 'azure' && rounds.state.scoreAzure === 2);
    // Draw.
    nextRound();
    rounds.beginLive();
    rounds.state.clock = 0.5;
    settle(60);
    check('timeout with no claim is a draw', rounds.state.phase === 'ended' && rounds.state.endWinner === null && rounds.state.scoreAzure === 2 && rounds.state.scoreEmber === 0);
    // Overtime.
    rounds.state.phase = 'live';
    rounds.state.scoreAzure = 2;
    rounds.state.scoreEmber = 2;
    rounds.state.round = 5;
    rounds.endRound(null, 'test draw');
    check('2-2 after five rounds goes to overtime', rounds.state.overtime === true && rounds.state.phase === 'ended');
    nextRound();
    check('overtime is round 6 in buy phase', rounds.state.round === 6 && rounds.state.phase === 'buy');
    // Economy and shop.
    economy.state.crystals = 3000;
    const bought = economy.buyBook('ember', state.owned);
    check('buying Ember Lance spends crystals', bought === 'ember' && economy.state.crystals === 300 && state.owned.has('ember'));
    economy.state.crystals = 3000;
    const blast = economy.buyBlast('fireball');
    check('buying Fireball tome grants 2 charges', blast && blast.id === 'fireball' && blast.charges === 2);
    // Blast orb area damage.
    weapons.setBlast('fireball');
    const victim = bots.bots.find((b) => b.team === 'ember' && b.alive);
    victim.position.set(0, 0, 2);
    victim.group.position.set(0, 0, 2);
    const hpBefore = victim.health;
    state.orb = { x: 0, y: 1, z: 2, vx: 0, vy: 0, vz: 0, fuse: 0.1, tier: 'fireball' };
    settle(30);
    check('blast orb explodes and hurts bots in radius', state.orb === null && victim.health < hpBefore);
    // Blast wind-up and launch.
    rounds.beginLive();
    weapons.state.blastCharges = 1;
    const castOk = castBlast();
    check('G starts a blast wind-up', castOk && state.orbPending !== null && state.orbWindUp > 0);
    settle(60);
    check('orb launches after wind-up', state.orb !== null);
    // Void Nova: the dearest tome leaves a collapsing field behind its blast.
    player.respawn({ x: -14, z: -14 }, 0);
    economy.state.crystals = 4000;
    const nova = economy.buyBlast('nova');
    check('buying Void Nova tome grants 1 charge', nova && nova.id === 'nova' && nova.charges === 1);
    weapons.setBlast('nova');
    state.orb = { x: 0, y: 1, z: 2, vx: 0, vy: 0, vz: 0, fuse: 0.1, tier: 'nova' };
    settle(30);
    check('Void Nova detonation leaves a void field', state.orb === null && state.voidField !== null);
    if (rounds.state.phase !== 'live') rounds.beginLive();
    const fieldVictim = bots.bots.find((b) => b.team === 'ember' && b.alive) || bots.bots.find((b) => b.alive);
    fieldVictim.position.set(6, 0, 2);
    fieldVictim.group.position.set(6, 0, 2);
    fieldVictim.state = 'hold';
    fieldVictim.holdUntil = 99999;
    fieldVictim.route = [];
    const victimHp = fieldVictim.health;
    const victimDist = Math.hypot(fieldVictim.position.x - state.voidField.x, fieldVictim.position.z - state.voidField.z);
    settle(60);
    check('void field burns witches inside it', fieldVictim.health < victimHp);
    check('void field drags witches toward its centre', Math.hypot(fieldVictim.position.x - state.voidField.x, fieldVictim.position.z - state.voidField.z) < victimDist);
  } catch (error) {
    results.push(`FAIL exception: ${error.message}`);
  }
  window.__selftest = results.join('\n');
  document.title = 'SELFTEST DONE';
}

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

syncCamera();
hud.setHealth(100);
hud.setMoney(economy.state.crystals);
hud.setScore(0, 0, 1);
hud.setTimer(BUY_SECONDS, false);
hud.setObjective('Claim the banner at the yard\'s heart — or wipe the Ember coven');
// A read-only handle for play-testing: live state, never used by the game itself.
window.__witch = { state, rounds: rounds.state, money: economy.state, flag: flag.state, bots, player: player.state, weapons: weapons.state, hud };
if (params.get('selftest')) runSelfTest();
else if (shot) runShot(shot);
else {
  hud.showOverlay('start');
  requestAnimationFrame(frame);
}
