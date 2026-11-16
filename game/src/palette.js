// Battle of Witch — the look plan in one place. A container yard at dusk: cold
// blue-grey steel and asphalt, warm sodium orange as the one accent, teal
// containers, ember-red for the defending coven and signal cyan for the attacking
// coven. Spell elements each carry a colour: spark gold, ember orange, frost
// cyan, void violet. Every colour the game uses is one of these names; the same
// names are the CSS custom properties in index.html.
export const PALETTE = {
  sky: '#1b2436',
  canvas: '#14181f',
  asphalt: '#23262b',
  steel: '#3a4048',
  concrete: '#565b60',
  rust: '#8a5a34',
  teal: '#2e6f6a',
  ochre: '#a97e2f',
  sodium: '#f0a830',
  ink: '#e9e6df',
  muted: '#98a0a8',
  azure: '#39b6d9',
  ember: '#e2543a',
  hazard: '#d8c33a',
  spark: '#ffe9a8',
  frost: '#7fd4ff',
  void: '#c07fff',
};

// One colour per spell element, used for bolts, orbs, flashes and the staff orb.
export const ELEMENT_COLORS = {
  spark: '#ffe9a8',
  ember: '#ff7a3c',
  frost: '#7fd4ff',
  void: '#c07fff',
  bolt: '#9fe8ff',
};

export const TEAM = {
  azure: { name: 'AZURE', color: PALETTE.azure, dark: '#1d6f88' },
  ember: { name: 'EMBER', color: PALETTE.ember, dark: '#8a2f1e' },
};

// Bot callsigns, original names, one per fighter: 7 Azure, 8 Ember.
export const CALLSIGNS = {
  azure: ['Juno', 'Moss', 'Pike', 'Wren', 'Sable', 'Rowan', 'Linden'],
  ember: ['Ash', 'Bramble', 'Cinder', 'Flint', 'Soot', 'Rune', 'Sage', 'Hex'],
};
