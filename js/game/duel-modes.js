/** Five distinct online competitive variants */
export const DUEL_VARIANTS = {
  blitz: {
    id: 'blitz',
    icon: '⚡',
    durationMs: 180000,
    sudden: false,
    mirror: false,
    attack: false,
    shrink: false
  },
  mirror: {
    id: 'mirror',
    icon: '🪞',
    durationMs: 180000,
    sudden: false,
    mirror: true,
    attack: false,
    shrink: false
  },
  attack: {
    id: 'attack',
    icon: '💥',
    durationMs: 180000,
    sudden: false,
    mirror: false,
    attack: true,
    shrink: false
  },
  shrink: {
    id: 'shrink',
    icon: '🔻',
    durationMs: 180000,
    sudden: false,
    mirror: false,
    attack: false,
    shrink: true,
    shrinkIntervalMs: 45000
  },
  sudden: {
    id: 'sudden',
    icon: '☠️',
    durationMs: 300000,
    sudden: true,
    mirror: false,
    attack: false,
    shrink: false
  }
};

export function getVariant(id) {
  return DUEL_VARIANTS[id] || DUEL_VARIANTS.blitz;
}

export function listVariants() {
  return Object.values(DUEL_VARIANTS);
}
