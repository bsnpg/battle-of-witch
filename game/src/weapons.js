// The spellbooks: four bolt books, one per role, plus three blast tomes. A book
// holds charges (its ammunition): casting spends one, R recharges it from the
// reserve, and at zero charges it cannot cast. Stopping to aim pays: spread grows
// with movement speed and shrinks while aiming, and every cast kicks the view.
// Blast tomes are bought in the shop and cast with G: the dearer the tome, the
// harder it hits — and the harder it is to use (longer wind-up, slower orb,
// longer cooldown, fewer charges, risky up close).
// The view model is one carved staff whose orb glows in the current book's
// element colour; the camera in main.js owns the ray.
import * as THREE from 'three';
import { PALETTE, ELEMENT_COLORS } from './palette.js';

export const SPELLBOOKS = {
  spark: {
    id: 'spark', name: 'Spark Bolt', kind: 'bolt', element: 'spark', price: 0,
    damage: 26, headMult: 3.5, magSize: 12, reserveMax: 48,
    fireGap: 0.16, reloadTime: 1.4, auto: false,
    spreadStill: 0.004, spreadMoving: 0.03, spreadAim: 0.0015,
    recoil: 0.011, kick: 0.035, moveSpeed: 5.6, zoomFov: 74,
  },
  ember: {
    id: 'ember', name: 'Ember Lance', kind: 'bolt', element: 'ember', price: 2700,
    damage: 33, headMult: 4, magSize: 30, reserveMax: 90,
    fireGap: 0.1, reloadTime: 2.0, auto: true,
    spreadStill: 0.002, spreadMoving: 0.03, spreadAim: 0.0008,
    recoil: 0.013, kick: 0.05, moveSpeed: 5.2, zoomFov: 66,
  },
  frost: {
    id: 'frost', name: 'Frost Shards', kind: 'bolt', element: 'frost', price: 1500,
    damage: 22, headMult: 3, magSize: 28, reserveMax: 84,
    fireGap: 0.07, reloadTime: 1.7, auto: true,
    spreadStill: 0.006, spreadMoving: 0.035, spreadAim: 0.003,
    recoil: 0.008, kick: 0.032, moveSpeed: 5.5, zoomFov: 70,
  },
  void: {
    id: 'void', name: 'Void Lance', kind: 'bolt', element: 'void', price: 4200,
    damage: 78, headMult: 4, magSize: 8, reserveMax: 24,
    fireGap: 0.9, reloadTime: 2.6, auto: false,
    spreadStill: 0.0008, spreadMoving: 0.022, spreadAim: 0.0003,
    recoil: 0.03, kick: 0.09, moveSpeed: 4.8, zoomFov: 46,
  },
};

export const BLASTS = {
  burst: {
    id: 'burst', name: 'Ember Burst', tier: 1, price: 300, charges: 3,
    damage: 70, radius: 4.5, windUp: 0.25, speed: 16, cooldown: 1.2, fuse: 2.0, element: 'ember',
  },
  fireball: {
    id: 'fireball', name: 'Fireball', tier: 2, price: 900, charges: 2,
    damage: 120, radius: 6.5, windUp: 0.55, speed: 12, cooldown: 2.5, fuse: 2.5, element: 'ember',
  },
  meteor: {
    id: 'meteor', name: 'Meteor Call', tier: 3, price: 2200, charges: 1,
    damage: 190, radius: 9, windUp: 0.9, speed: 8, cooldown: 5, fuse: 3.0, element: 'void',
  },
};

export const ARMOR_PRICE = 650;

function buildStaff() {
  const wood = new THREE.MeshStandardMaterial({ color: new THREE.Color('#4a3220'), roughness: 0.8, metalness: 0.05 });
  const brass = new THREE.MeshStandardMaterial({ color: new THREE.Color(PALETTE.sodium), roughness: 0.45, metalness: 0.6 });
  const group = new THREE.Group();
  const shaft = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.5, 0.04), wood);
  shaft.position.set(0, -0.06, 0);
  const grip = new THREE.Mesh(new THREE.BoxGeometry(0.055, 0.1, 0.055), brass);
  grip.position.set(0, -0.24, 0);
  const claw = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.05, 0.08), brass);
  claw.position.set(0, 0.21, 0);
  group.add(shaft, grip, claw);
  group.position.set(0.26, -0.22, -0.45);
  group.rotation.z = -0.35;
  group.rotation.x = -0.3;
  return group;
}

export function createWeapons(camera) {
  const staff = buildStaff();
  camera.add(staff);
  const orbMaterial = new THREE.MeshStandardMaterial({
    color: new THREE.Color(ELEMENT_COLORS.spark),
    emissive: new THREE.Color(ELEMENT_COLORS.spark),
    emissiveIntensity: 2.4,
    roughness: 0.3,
  });
  const orb = new THREE.Mesh(new THREE.SphereGeometry(0.04, 14, 10), orbMaterial);
  orb.position.set(0, 0.26, 0);
  staff.add(orb);
  const flash = new THREE.Mesh(
    new THREE.PlaneGeometry(0.26, 0.26),
    new THREE.MeshBasicMaterial({ color: new THREE.Color(ELEMENT_COLORS.spark), transparent: true, opacity: 0.9, depthWrite: false, side: THREE.DoubleSide }),
  );
  flash.position.set(0.24, -0.17, -0.95);
  flash.visible = false;
  camera.add(flash);
  const flashLight = new THREE.PointLight(new THREE.Color(ELEMENT_COLORS.spark), 0, 6);
  flashLight.position.set(0.24, -0.15, -0.6);
  camera.add(flashLight);

  const state = {
    current: 'spark',
    charges: {},
    blastId: null,
    blastCharges: 0,
    blastCooldown: 0,
    cooldown: 0,
    reloadLeft: 0,
    flash: 0,
    kick: 0,
    aimBlend: 0,
  };
  for (const def of Object.values(SPELLBOOKS)) {
    state.charges[def.id] = { mag: def.magSize, reserve: def.reserveMax };
  }

  function def() {
    return SPELLBOOKS[state.current];
  }

  function paintOrb() {
    const colour = ELEMENT_COLORS[def().element];
    orbMaterial.color.set(colour);
    orbMaterial.emissive.set(colour);
    flash.material.color.set(colour);
    flashLight.color.set(colour);
  }

  function step(dt, aiming) {
    const d = def();
    state.cooldown = Math.max(0, state.cooldown - dt);
    state.blastCooldown = Math.max(0, state.blastCooldown - dt);
    state.flash = Math.max(0, state.flash - dt);
    state.kick += (0 - state.kick) * Math.min(1, dt * 14);
    state.aimBlend += ((aiming ? 1 : 0) - state.aimBlend) * Math.min(1, dt * 10);
    staff.position.z = -0.45 + state.kick + state.aimBlend * 0.1;
    staff.position.x = 0.26 - state.aimBlend * 0.26;
    staff.position.y = -0.22 + state.aimBlend * 0.045;
    staff.rotation.x = -0.3 + state.kick * 2.2;
    flash.visible = state.flash > 0;
    flash.rotation.z = state.flash * 30;
    flashLight.intensity = state.flash > 0 ? 16 : 0;
    if (state.reloadLeft > 0) {
      state.reloadLeft = Math.max(0, state.reloadLeft - dt);
      staff.rotation.x = -0.3 - 0.55 * Math.sin(Math.PI * Math.min(1, (d.reloadTime - state.reloadLeft) / d.reloadTime));
      if (state.reloadLeft === 0) {
        const slot = state.charges[state.current];
        const take = Math.min(d.magSize - slot.mag, slot.reserve);
        slot.mag += take;
        slot.reserve -= take;
      }
    }
  }

  return {
    state,
    defs: SPELLBOOKS,
    blasts: BLASTS,
    def,
    step,
    currentDef() {
      return def();
    },
    blastDef() {
      return state.blastId ? BLASTS[state.blastId] : null;
    },
    ready() {
      const slot = state.charges[state.current];
      return slot.mag > 0 && state.cooldown === 0 && state.reloadLeft === 0;
    },
    pullTrigger() {
      const d = def();
      state.cooldown = d.fireGap;
      state.flash = 0.06;
      state.kick = d.kick;
      paintOrb();
    },
    takeCharge() {
      const slot = state.charges[state.current];
      if (slot.mag <= 0) return false;
      slot.mag -= 1;
      return true;
    },
    recharge() {
      const d = def();
      const slot = state.charges[state.current];
      if (state.reloadLeft > 0 || slot.mag === d.magSize || slot.reserve === 0) return false;
      state.reloadLeft = d.reloadTime;
      return true;
    },
    spread(speed, aiming) {
      const d = def();
      const moving = Math.min(1, speed / 5.2);
      const base = aiming ? d.spreadAim : d.spreadStill;
      return base + moving * d.spreadMoving;
    },
    equip(id) {
      if (!SPELLBOOKS[id] || state.current === id) return false;
      state.current = id;
      state.reloadLeft = 0;
      state.cooldown = Math.max(state.cooldown, 0.25);
      paintOrb();
      return true;
    },
    give(id) {
      const d = SPELLBOOKS[id];
      state.charges[id] = { mag: d.magSize, reserve: d.reserveMax };
      this.equip(id);
    },
    setBlast(id) {
      const d = BLASTS[id];
      if (!d) return false;
      state.blastId = id;
      state.blastCharges = d.charges;
      state.blastCooldown = 0;
      return true;
    },
    takeBlastCharge() {
      if (!state.blastId || state.blastCharges <= 0) return false;
      state.blastCharges -= 1;
      return true;
    },
    refillRound() {
      // Between rounds every owned book is topped up to a fresh set of charges;
      // reserves stay as bought, so running dry still matters across the match.
      for (const d of Object.values(SPELLBOOKS)) {
        const slot = state.charges[d.id];
        const need = d.magSize - slot.mag;
        const take = Math.min(need, slot.reserve);
        slot.mag += take;
        slot.reserve -= take;
      }
    },
    resetMatch() {
      for (const d of Object.values(SPELLBOOKS)) {
        state.charges[d.id] = { mag: d.magSize, reserve: d.reserveMax };
      }
      state.blastId = null;
      state.blastCharges = 0;
      state.blastCooldown = 0;
      state.cooldown = 0;
      state.reloadLeft = 0;
      state.flash = 0;
      state.kick = 0;
      state.current = 'spark';
      paintOrb();
    },
  };
}
