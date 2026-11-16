// The look plan in one place: slate concrete, oxidised steel, teal shadow, one rust accent that
// only ever marks something shootable or something about to hurt you. These are albedo values —
// the texture is a near-white detail map — so the light rig and the tone curve take them down.
export const PALETTE = {
  canvas: '#122b33',
  deep: '#4c5f65',
  surface: '#8ba1a3',
  hairline: '#a2917a',
  steel: '#8b9c9e',
  ink: '#dbe7e4',
  muted: '#7d9490',
  accent: '#d9663a',
  teal: '#3fa39b',
};

/** Team tint: the attacking side wears the rust of hot metal, the defenders the cold teal. */
export const TEAM_COLOR = [PALETTE.accent, PALETTE.teal];
