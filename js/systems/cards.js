export const CARD_CATALOG = [
  {
    id: 'bronze_row',
    name: 'שורה מושלמת',
    rarity: 'bronze',
    ovr: 62,
    desc: '+5% נקודות על ניקוי שורות אופקיות',
    effect: 'row_bonus'
  },
  {
    id: 'bronze_combo',
    name: 'רצף ניצוץ',
    rarity: 'bronze',
    ovr: 58,
    desc: '+3% נקודות בכל רצף ניקוי',
    effect: 'combo_bonus'
  },
  {
    id: 'silver_cyan',
    name: 'גלי ים',
    rarity: 'silver',
    ovr: 72,
    desc: 'בלוקים בצבע כחול מופיעים לעיתים קרובות יותר',
    effect: 'favor_color',
    favorColor: 2
  },
  {
    id: 'silver_pink',
    name: 'פריחת ורוד',
    rarity: 'silver',
    ovr: 70,
    desc: 'בלוקים ורודים מופיעים לעיתים קרובות יותר',
    effect: 'favor_color',
    favorColor: 1
  },
  {
    id: 'gold_rotation',
    name: 'סיבוב זהב',
    rarity: 'gold',
    ovr: 85,
    desc: 'סובב בלוק אחד לפני ההנחה (פעם במשחק)',
    effect: 'rotation'
  },
  {
    id: 'gold_double',
    name: 'כפול נקודות',
    rarity: 'gold',
    ovr: 82,
    desc: 'הניקוי הראשון שלך שווה x2 נקודות',
    effect: 'first_clear_double'
  },
  {
    id: 'legendary_undo',
    name: 'החזר בזמן',
    rarity: 'legendary',
    ovr: 94,
    desc: 'בטל את המהלך האחרון (פעם אחת במאצ\')',
    effect: 'undo'
  },
  {
    id: 'legendary_wild',
    name: 'פראי',
    rarity: 'legendary',
    ovr: 96,
    desc: 'בלוק 1x1 נוסף בכל סיבוב חלקים',
    effect: 'extra_dot'
  }
];

export const RARITY_WEIGHTS = {
  bronze: 50,
  silver: 30,
  gold: 15,
  legendary: 5
};

export const RARITY_LABELS = {
  bronze: 'ארד',
  silver: 'כסף',
  gold: 'זהב',
  legendary: 'אגדי'
};

export function getCardById(id) {
  return CARD_CATALOG.find(c => c.id === id);
}

export function getCardName(card, t) {
  if (!card) return '';
  const key = `card.${card.id}.name`;
  if (t) {
    const translated = t(key);
    if (translated !== key) return translated;
  }
  return card.name;
}

export function getCardDesc(card, t) {
  if (!card) return '';
  const key = `card.${card.id}.desc`;
  if (t) {
    const translated = t(key);
    if (translated !== key) return translated;
  }
  return card.desc;
}

export function getRarityLabel(rarity, t) {
  const key = `rarity.${rarity}`;
  if (t) {
    const translated = t(key);
    if (translated !== key) return translated;
  }
  return RARITY_LABELS[rarity] || rarity;
}

export function rollCard() {
  const roll = Math.random() * 100;
  let rarity;
  if (roll < RARITY_WEIGHTS.legendary) rarity = 'legendary';
  else if (roll < RARITY_WEIGHTS.legendary + RARITY_WEIGHTS.gold) rarity = 'gold';
  else if (roll < RARITY_WEIGHTS.legendary + RARITY_WEIGHTS.gold + RARITY_WEIGHTS.silver) rarity = 'silver';
  else rarity = 'bronze';

  const pool = CARD_CATALOG.filter(c => c.rarity === rarity);
  return pool[Math.floor(Math.random() * pool.length)];
}

export function getLoadoutEffects(loadout) {
  const effects = {
    rowBonus: 0,
    comboBonus: 0,
    favorColor: null,
    rotation: false,
    undo: false,
    firstClearDouble: false,
    extraDot: false
  };

  for (const cardId of loadout) {
    const card = getCardById(cardId);
    if (!card) continue;
    switch (card.effect) {
      case 'row_bonus': effects.rowBonus += 0.05; break;
      case 'combo_bonus': effects.comboBonus += 0.03; break;
      case 'favor_color': effects.favorColor = card.favorColor; break;
      case 'rotation': effects.rotation = true; break;
      case 'undo': effects.undo = true; break;
      case 'first_clear_double': effects.firstClearDouble = true; break;
      case 'extra_dot': effects.extraDot = true; break;
    }
  }
  return effects;
}

export function getDefaultInventory() {
  return ['bronze_row', 'bronze_combo'];
}

export function getDefaultLoadout() {
  return ['bronze_row'];
}
