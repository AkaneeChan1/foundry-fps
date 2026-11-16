// Every weapon's numbers in one table: damage, head multiplier, cycle time, magazine, reload, and
// the recoil pattern a held trigger walks up. Spread is a function of stance and speed, so standing
// still is a decision worth making. Slot order is the number key that draws it.

export const SLOT_RIFLE = 0;
export const SLOT_PISTOL = 1;
export const SLOT_KNIFE = 2;
export const SLOT_GRENADE = 3;

// A held rifle walks up first, then wanders left and right — an original pattern, learned by
// pulling down and correcting, never a random cone.
const RIFLE_RECOIL = [
  [0.016, 0.0000], [0.017, 0.0022], [0.018, -0.0026], [0.017, 0.0034], [0.015, -0.0042],
  [0.013, 0.0050], [0.012, -0.0056], [0.010, 0.0058], [0.009, -0.0054], [0.008, 0.0044],
  [0.007, -0.0034], [0.006, 0.0026],
];
const PISTOL_RECOIL = [
  [0.030, 0.0000], [0.026, 0.0040], [0.022, -0.0050], [0.018, 0.0055], [0.015, -0.0050],
];

export const WEAPONS = [
  {
    id: 'rifle',
    name: 'VK-7',
    slot: SLOT_RIFLE,
    kind: 'gun',
    price: 2700,
    damage: 34,
    headMul: 4.2,
    legMul: 0.8,
    range: 90,
    rate: 0.098, // seconds between rounds
    auto: true,
    mag: 30,
    reserve: 90,
    reload: 2.35,
    pellets: 1,
    spreadStill: 0.0016,
    spreadMove: 0.055,
    spreadAir: 0.10,
    spreadCrouch: 0.5,
    spreadPerShot: 0.0055,
    spreadRecover: 0.10,
    recoil: RIFLE_RECOIL,
    recoilRecover: 6.5,
    kick: 0.05,
    sound: 'rifle',
    killReward: 300,
  },
  {
    id: 'pistol',
    name: 'P9',
    slot: SLOT_PISTOL,
    kind: 'gun',
    price: 500,
    damage: 27,
    headMul: 4.0,
    legMul: 0.85,
    range: 60,
    rate: 0.15,
    auto: false,
    mag: 12,
    reserve: 48,
    reload: 1.65,
    pellets: 1,
    spreadStill: 0.0042,
    spreadMove: 0.038,
    spreadAir: 0.085,
    spreadCrouch: 0.6,
    spreadPerShot: 0.014,
    spreadRecover: 0.16,
    recoil: PISTOL_RECOIL,
    recoilRecover: 8,
    kick: 0.035,
    sound: 'pistol',
    killReward: 300,
  },
  {
    id: 'knife',
    name: 'Gutter',
    slot: SLOT_KNIFE,
    kind: 'melee',
    price: 0,
    damage: 52,
    backMul: 2.2,
    headMul: 1,
    legMul: 1,
    range: 1.7,
    rate: 0.42,
    auto: false,
    mag: 0,
    reserve: 0,
    reload: 0,
    pellets: 1,
    spreadStill: 0,
    spreadMove: 0,
    spreadAir: 0,
    spreadCrouch: 1,
    spreadPerShot: 0,
    spreadRecover: 1,
    recoil: null,
    recoilRecover: 1,
    kick: 0,
    sound: 'knife',
    killReward: 1500,
  },
  {
    id: 'grenade',
    name: 'Sunspot',
    slot: SLOT_GRENADE,
    kind: 'throw',
    price: 300,
    damage: 0,
    headMul: 1,
    legMul: 1,
    range: 30,
    rate: 0.9,
    auto: false,
    mag: 1,
    reserve: 1,
    reload: 0,
    pellets: 1,
    spreadStill: 0,
    spreadMove: 0,
    spreadAir: 0,
    spreadCrouch: 1,
    spreadPerShot: 0,
    spreadRecover: 1,
    recoil: null,
    recoilRecover: 1,
    kick: 0,
    sound: 'throw',
    killReward: 0,
    fuse: 1.55,
    flashRadius: 13,
  },
];

/** Loadouts: what a body carries. The knife is always there; the rest is bought. */
export function emptyInventory() {
  return [
    { mag: 0, reserve: 0, owned: false },
    { mag: 0, reserve: 0, owned: true }, // the pistol is the free sidearm
    { mag: 1, reserve: 0, owned: true }, // knife, no ammunition
    { mag: 0, reserve: 0, owned: false },
  ];
}

/** A fresh round's loadout for the pistol: full magazine, full reserve. */
export const PISTOL_START = { mag: 12, reserve: 48 };
