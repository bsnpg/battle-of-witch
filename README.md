# Battle of Witch

[![make.fun · threejs-fps-02](https://make.fun/badge/threejs-fps-02.svg)](https://make.fun/bounty/threejs-fps-02?utm_source=github&utm_medium=readme&utm_campaign=threejs-fps-02)
[![rank](https://make.fun/badge/threejs-fps-02/bsnpg/battle-of-witch/rank.svg)](https://make.fun/bounty/threejs-fps-02/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=threejs-fps-02)
[![reward](https://make.fun/badge/threejs-fps-02/bsnpg/battle-of-witch/reward.svg)](https://make.fun/bounty/threejs-fps-02?utm_source=github&utm_medium=readme&utm_campaign=threejs-fps-02)

A round-based tactical first-person wizard battle in the browser, built on
three.js 0.187.0, in the style Counter-Strike made famous — with its own map,
art, sounds and names, never a copy.

**Play it:** serve `game/` with any static file server (or `node serve.ts`) and
open `http://localhost:8080` in desktop Chrome. No build step, no network
request: everything the game needs is vendored under `game/`.

## The game

Dustline Yard is a container yard at dusk, and one magical banner stands at its
heart. Two covens of eight — Azure attacks, Ember defends — fight short rounds,
best of 5, first to 3.

- **Objective:** claim the banner by standing on its ground ring and
  channelling it; if both covens stand on the ring the claim pauses. A coven
  also wins the round by wiping the other out. A round lasts 3:00; if the clock
  runs out with no claim, the round is a draw and neither coven scores. A 2–2
  tie after five rounds goes to an overtime round.
- **Spellcasting:** four spellbooks (Spark Bolt, Ember Lance, Frost Shards,
  Void Lance). Each book holds charges: casting spends one, `R` recharges it
  from the reserve, and an empty book cannot cast. Headshots pay more, recoil
  and spread punish casting on the move, stopping to aim pays. Right-click to
  aim, `R` to recharge, `Shift` to walk slow, `Ctrl` to crouch, `Space` to jump.
- **Blast tomes:** four explosion spells, dearer the harder they hit — and the
  harder they are to use. Ember Burst is quick and small, Fireball arcs slower
  and hits harder, Meteor Call has a long wind-up, a slow orb and a huge blast
  that is risky up close. Void Nova is the dearest: a slow, huge blast that
  leaves a collapsing void field behind it, burning and dragging enemy witches
  for four seconds. Buy a tome in the shop, cast it with `G`.
- **Economy:** crystals of magic between rounds — ◆ 800 to start, ◆ 300 a kill,
  ◆ 300 a banner claim, ◆ 3,250 for a round win, ◆ 1,900 for a loss or a draw.
  Press `B` in the buy phase to buy spellbooks, blast tomes and robes.
- **Bots:** fifteen bots that walk waypoint routes through the lanes, hold
  positions, push the banner, contest an enemy claim, react to what they see
  and hear, and cast in bursts. During the buy phase they stage at their own
  approach node — nobody stands on the banner ring before the round starts,
  and nobody fights until it is live. A witch standing on the ring never
  wanders off after a distant sound: the claim is the job. Friendly fire is
  off: Ember witches alone target the player, and the player's bolts, blasts
  and void field only ever hurt Ember.
- **Minimap and radio:** a live minimap (walls, the banner ring with its
  claim arc, teammates always, Ember witches only while the coven's spotted
  intel on them is fresh) with the name of the ground you stand on — Banner
  Ring, Azure Yard, Ember Yard, West Stacks, East Stacks, Mid Yard. The
  coven talks on the radio: contacts, banner claims and contests, called out
  by name.
- **HUD:** health and robe, charges, round timer, score, coven alive counts,
  kill feed, crystals, banner claim progress, minimap and radio.

## Layout

- `game/index.html` — page, HUD, buy menu, import map for three.js
- `game/src/main.js` — boot and the fixed 60 Hz simulation / render loop
- `game/src/map.js` — the Dustline Yard map, waypoint graph, line-of-sight test
- `game/src/bots.js` — bot AI: routes, sight, hearing, bursts, banner pushes
- `game/src/player.js` — movement: acceleration, friction, crouch, jump, collision
- `game/src/weapons.js` — the spellbooks, the blast tomes and the staff view model
- `game/src/flag.js` — the banner: ring, claim channel, contest rules
- `game/src/economy.js` — crystal income and the buy menu's prices
- `game/src/rounds.js` — round and match flow, draws, overtime
- `game/src/effects.js` — pooled bolt tracers, sparks, blast orbs, explosions and the collapsing void field
- `game/src/audio.js` — synthesised WebAudio sound, no audio files
- `game/src/hud.js` — the DOM HUD (never touches the simulation)
- `game/src/input.js` — keyboard, mouse and pointer lock
- `game/src/state.js` — the one state store
- `game/src/palette.js`, `game/src/rng.js` — look plan and seeded randomness
- `main.ts` — the make.fun entry program: copies `game/` and `screenshots/` to
  `/output` and writes `dossier.json`
- `screenshots/` — real renders of the game's own code (`?shot=` captures)

## Screenshots

The four captures are deterministic frames of the game's own code, taken in a
headless browser with WebGL 2:

1. `1-play.jpg` — a Void Nova detonating on the banner (cover): the blast
   ball mid-bloom, its collapsing void field over the yard, five Ember
   witches dead inside it, the kill feed naming the tome
2. `2-start.jpg` — the menu over the yard at dusk
3. `3-buy.jpg` — the buy phase menu
4. `4-flag.jpg` — the banner three quarters claimed, a Fireball detonating
   on the ring as an Ember witch contests it, the ring lit by the blast

## Self-test

`?selftest=1` drives the real simulation headlessly — buy-phase safety and
staging, no instant banner claim, teammates never targeting the player,
charges and recharge, banner claim, wipe, draw, overtime, shop spending,
blast area damage, blast wind-up, Void Nova field, minimap draw and radio —
and writes PASS/FAIL lines to `window.__selftest`.
