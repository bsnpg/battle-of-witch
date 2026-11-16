// The banner: the one objective beyond killing. A magical banner stands at the
// yard's heart; stand on its ground ring and channel it to claim it. Only one
// coven may channel at a time — if fighters of both covens stand on the ring,
// the claim pauses. Claim it and the round is yours. One banner, one light, one
// ring: the whole match turns on this spot.
import * as THREE from 'three';
import { PALETTE } from './palette.js';

export const CAPTURE_TIME = 4;
export const FLAG_RADIUS = 2.6;
export const FLAG_X = 0;
export const FLAG_Z = 1;

export function createFlag(scene) {
  const group = new THREE.Group();
  // The pole and the cloth.
  const pole = new THREE.Mesh(
    new THREE.CylinderGeometry(0.07, 0.09, 4.4, 8),
    new THREE.MeshStandardMaterial({ color: new THREE.Color('#2c2620'), roughness: 0.8 }),
  );
  pole.position.y = 2.2;
  const clothMaterial = new THREE.MeshStandardMaterial({
    color: new THREE.Color(PALETTE.sodium), emissive: new THREE.Color(PALETTE.sodium),
    emissiveIntensity: 0.7, roughness: 0.9, side: THREE.DoubleSide,
  });
  const cloth = new THREE.Mesh(new THREE.PlaneGeometry(1.5, 0.95), clothMaterial);
  cloth.position.set(0.78, 3.8, 0);
  const finialMaterial = new THREE.MeshStandardMaterial({
    color: new THREE.Color(PALETTE.sodium), emissive: new THREE.Color(PALETTE.sodium),
    emissiveIntensity: 2.2, roughness: 0.4,
  });
  const finial = new THREE.Mesh(new THREE.SphereGeometry(0.14, 12, 8), finialMaterial);
  finial.position.y = 4.5;
  // The ground ring: the channel zone.
  const ringMaterial = new THREE.MeshBasicMaterial({
    color: new THREE.Color(PALETTE.sodium), transparent: true, opacity: 0.4, side: THREE.DoubleSide,
  });
  const ring = new THREE.Mesh(new THREE.RingGeometry(FLAG_RADIUS - 0.25, FLAG_RADIUS, 40), ringMaterial);
  ring.rotation.x = -Math.PI / 2;
  ring.position.y = 0.03;
  const light = new THREE.PointLight(new THREE.Color(PALETTE.sodium), 20, 20, 1.8);
  light.position.set(FLAG_X, 3.4, FLAG_Z);
  group.add(pole, cloth, finial, ring);
  group.position.set(FLAG_X, 0, FLAG_Z);
  scene.add(group, light);

  const state = {
    x: FLAG_X,
    z: FLAG_Z,
    radius: FLAG_RADIUS,
    progress: 0, // 0..1 toward a claim
    team: null, // 'azure' | 'ember' | null — who is channelling now
    capturedBy: null,
  };

  return {
    state,
    group,
    resetRound() {
      state.progress = 0;
      state.team = null;
      state.capturedBy = null;
      clothMaterial.color.set(PALETTE.sodium);
      clothMaterial.emissive.set(PALETTE.sodium);
      ringMaterial.color.set(PALETTE.sodium);
      light.color.set(PALETTE.sodium);
    },
    // One step of the claim. Returns the claiming team when the banner is
    // claimed this step, or null. `azureHere` / `emberHere` say whether a living
    // fighter of that coven stands on the ring.
    captureTick(dt, azureHere, emberHere) {
      if (state.capturedBy) return null;
      if (azureHere && !emberHere) {
        if (state.team !== 'azure') { state.team = 'azure'; state.progress = 0; }
        state.progress += dt / CAPTURE_TIME;
      } else if (emberHere && !azureHere) {
        if (state.team !== 'ember') { state.team = 'ember'; state.progress = 0; }
        state.progress += dt / CAPTURE_TIME;
      } else if (azureHere && emberHere) {
        // Contested: the claim pauses where it is.
      } else {
        state.progress = Math.max(0, state.progress - dt * 0.25);
        if (state.progress === 0) state.team = null;
      }
      if (state.progress >= 1) {
        state.progress = 1;
        state.capturedBy = state.team;
        return state.team;
      }
      return null;
    },
    syncMesh(time) {
      // The cloth waves; the ring breathes while a claim is building.
      cloth.rotation.y = Math.sin(time * 1.6) * 0.22;
      const pulse = 0.35 + 0.15 * Math.sin(time * 3);
      ringMaterial.opacity = state.team ? pulse + state.progress * 0.3 : 0.3;
      const colour = state.team === 'azure' ? PALETTE.azure : state.team === 'ember' ? PALETTE.ember : PALETTE.sodium;
      clothMaterial.color.set(colour);
      clothMaterial.emissive.set(colour);
      ringMaterial.color.set(colour);
      light.color.set(colour);
      light.intensity = 14 + state.progress * 26;
    },
  };
}
