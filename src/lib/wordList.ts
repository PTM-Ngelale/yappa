export interface WordEntry {
  word: string;
  category: string;
}

export const WORD_LIST: WordEntry[] = [
  { word: 'Lighthouse', category: 'Objects' },
  { word: 'Volcano', category: 'Nature' },
  { word: 'Umbrella', category: 'Objects' },
  { word: 'Waterfall', category: 'Nature' },
  { word: 'Treasure', category: 'Objects' },
  { word: 'Dolphin', category: 'Animals' },
  { word: 'Rainbow', category: 'Nature' },
  { word: 'Castle', category: 'Places' },
  { word: 'Compass', category: 'Objects' },
  { word: 'Tornado', category: 'Weather' },
  { word: 'Library', category: 'Places' },
  { word: 'Penguin', category: 'Animals' },
  { word: 'Hammock', category: 'Objects' },
  { word: 'Lantern', category: 'Objects' },
  { word: 'Glacier', category: 'Nature' },
  { word: 'Coconut', category: 'Food' },
  { word: 'Carousel', category: 'Objects' },
  { word: 'Thunderstorm', category: 'Weather' },
  { word: 'Telescope', category: 'Objects' },
  { word: 'Avalanche', category: 'Nature' },
  { word: 'Flamingo', category: 'Animals' },
  { word: 'Submarine', category: 'Vehicles' },
  { word: 'Moonlight', category: 'Nature' },
  { word: 'Playground', category: 'Places' },
  { word: 'Hourglass', category: 'Objects' },
  { word: 'Crocodile', category: 'Animals' },
  { word: 'Fireplace', category: 'Objects' },
  { word: 'Orchestra', category: 'Music' },
  { word: 'Parachute', category: 'Objects' },
  { word: 'Blizzard', category: 'Weather' },
  { word: 'Cathedral', category: 'Places' },
  { word: 'Saxophone', category: 'Music' },
  { word: 'Porcupine', category: 'Animals' },
  { word: 'Trampoline', category: 'Objects' },
  { word: 'Expedition', category: 'Events' },
  { word: 'Cinnamon', category: 'Food' },
  { word: 'Jellyfish', category: 'Animals' },
  { word: 'Skyscraper', category: 'Places' },
  { word: 'Bulldozer', category: 'Vehicles' },
  { word: 'Snowflake', category: 'Nature' },
];

export function pickWord(): WordEntry {
  return WORD_LIST[Math.floor(Math.random() * WORD_LIST.length)];
}
