// The one state store. Every module reads or writes through this object, so the
// whole match — phase, health, crystals, the banner, blast orbs, score — lives in
// one place and a round reset touches every field in one function.
export function createGameState() {
  const state = {
    time: 0,
    health: 100,
    armor: 0,
    alive: true,
    owned: new Set(['spark']),
    kills: 0,
    deaths: 0,
    damageFlash: 0,
    orb: null, // {x,y,z,vx,vy,vz,fuse,tier} or null — the one live blast orb
    orbWindUp: 0, // seconds left before a cast orb leaves the staff
    orbPending: null, // blast def waiting out its wind-up
    voidField: null, // {x,y,z,left,radius,startRadius,tick} or null — the collapsing field a Void Nova leaves behind
    noise: null, // {x, z, time} — the last loud sound bots heard
    feed: [], // kill-feed entries, newest first, capped in hud.js
    started: false,
    buyOpen: false,
  };

  return {
    state,
    resetRound() {
      state.health = 100;
      state.alive = true;
      state.damageFlash = 0;
      state.orb = null;
      state.orbWindUp = 0;
      state.orbPending = null;
      state.voidField = null;
      state.noise = null;
    },
    resetMatch() {
      this.resetRound();
      state.armor = 0;
      state.owned = new Set(['spark']);
      state.kills = 0;
      state.deaths = 0;
      state.feed = [];
      state.buyOpen = false;
    },
    addFeed(text, team) {
      state.feed.unshift({ text, team, at: state.time });
      if (state.feed.length > 5) state.feed.length = 5;
    },
  };
}
