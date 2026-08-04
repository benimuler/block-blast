export const CURRENT_EVENT = {
  id: 'winter_frost',
  name: 'אירוע חורף ❄️',
  description: 'בלוקים מוקפאים מופיעים על הלוח! נקה שורות עם בלוקי אירוע לקבלת אסימונים.',
  durationDays: 14,
  eventBlockChance: 0.18,
  theme: 'winter'
};

export const EVENT_SHOP_ITEMS = [
  {
    id: 'skin_frost_board',
    nameKey: 'shop.skin_frost_board.name',
    descKey: 'shop.skin_frost_board.desc',
    cost: 30,
    type: 'cosmetic'
  },
  {
    id: 'anim_sparkle',
    nameKey: 'shop.anim_sparkle.name',
    descKey: 'shop.anim_sparkle.desc',
    cost: 25,
    type: 'cosmetic'
  },
  {
    id: 'card_event_frost',
    nameKey: 'shop.card_event_frost.name',
    descKey: 'shop.card_event_frost.desc',
    cost: 50,
    type: 'card',
    cardId: 'silver_cyan'
  },
  {
    id: 'card_event_blizzard',
    nameKey: 'shop.card_event_blizzard.name',
    descKey: 'shop.card_event_blizzard.desc',
    cost: 100,
    type: 'card',
    cardId: 'gold_double'
  }
];

export function isEventActive() {
  return true;
}

export function shouldSpawnEventBlock() {
  return isEventActive() && Math.random() < CURRENT_EVENT.eventBlockChance;
}

export function getEventBannerText() {
  if (!isEventActive()) return null;
  return `<strong>${CURRENT_EVENT.name}</strong> פעיל! ${CURRENT_EVENT.description}`;
}
