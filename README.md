# Battle of Witch

[![make.fun · threejs-fps-02](https://make.fun/badge/threejs-fps-02.svg)](https://make.fun/bounty/threejs-fps-02?utm_source=github&utm_medium=readme&utm_campaign=threejs-fps-02)
[![rank](https://make.fun/badge/bsnpg/battle-of-witch/rank.svg)](https://make.fun/bounty/threejs-fps-02/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=threejs-fps-02)
[![reward](https://make.fun/badge/bsnpg/battle-of-witch/reward.svg)](https://make.fun/bounty/threejs-fps-02?utm_source=github&utm_medium=readme&utm_campaign=threejs-fps-02)

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
- **Blast tomes:** three explosion spells, dearer the harder they hit — and the
  harder they are to use. Ember Burst is quick and small, Fireball arcs slower
  and hits harder, Meteor Call has a long wind-up, a slow orb and a huge blast
  that is risky up close. Buy a tome in the shop, cast it with `G`.
- **Economy:** crystals of magic between rounds — ◆ 800 to start, ◆ 300 a kill,
  ◆ 300 a banner claim, ◆ 3,250 for a round win, ◆ 1,900 for a loss or a draw.
  Press `B` in the buy phase to buy spellbooks, blast tomes and robes.
- **Bots:** fifteen bots that walk waypoint routes through the lanes, hold
  positions, push the banner, contest an enemy claim, react to what they see
  and hear, and cast in bursts.
- **HUD:** health and robe, charges, round timer, score, coven alive counts,
  kill feed, crystals, and banner claim progress.

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
- `game/src/effects.js` — pooled bolt tracers, sparks, blast orbs and explosions
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

1. `1-start.jpg` — the menu over the yard at dusk (cover)
2. `2-play.jpg` — mid-round bolt fight near the banner
3. `3-buy.jpg` — the buy phase menu
4. `4-flag.jpg` — the banner three quarters claimed, an Ember witch contesting

## Self-test

`?selftest=1` drives the real simulation headlessly — charges and recharge,
banner claim, wipe, draw, overtime, shop spending, blast area damage, blast
wind-up — and writes PASS/FAIL lines to `window.__selftest`.
