// 251 target words across the 5 locked categories, tiered by difficulty.
// A full game draws 3 Easy + 4 Medium + 2 Hard words spanning ≥3 categories (see generateGame()).

export type Category = 'Objects' | 'Animals' | 'Places' | 'Food & Drink' | 'Sports';
export type Difficulty = 'easy' | 'medium' | 'hard';

export interface WordEntry {
  word: string;
  category: Category;
  difficulty: Difficulty;
}

const OBJECTS_EASY = [
  'Umbrella', 'Backpack', 'Telephone', 'Television', 'Bicycle', 'Candle', 'Blanket',
  'Pillow', 'Mirror', 'Hammer', 'Ladder', 'Scissors', 'Camera', 'Guitar', 'Balloon',
  'Bucket', 'Broom',
];
const OBJECTS_MEDIUM = [
  'Telescope', 'Compass', 'Lantern', 'Hourglass', 'Parachute', 'Trampoline', 'Saxophone',
  'Typewriter', 'Microscope', 'Thermometer', 'Wheelbarrow', 'Chandelier', 'Accordion',
  'Harmonica', 'Binoculars', 'Wristwatch', 'Suitcase', 'Anchor', 'Magnet', 'Flashlight',
  'Corkscrew', 'Pitchfork', 'Bagpipes',
];
const OBJECTS_HARD = [
  'Metronome', 'Gyroscope', 'Barometer', 'Sextant', 'Astrolabe', 'Periscope',
  'Harpsichord', 'Abacus', 'Stethoscope', 'Kaleidoscope', 'Xylophone',
];

const ANIMALS_EASY = [
  'Elephant', 'Giraffe', 'Penguin', 'Dolphin', 'Kangaroo', 'Zebra', 'Rabbit', 'Squirrel',
  'Butterfly', 'Octopus', 'Crocodile', 'Flamingo', 'Peacock', 'Tortoise', 'Hedgehog',
  'Raccoon', 'Otter',
];
const ANIMALS_MEDIUM = [
  'Chameleon', 'Porcupine', 'Jellyfish', 'Rhinoceros', 'Hippopotamus', 'Orangutan',
  'Chimpanzee', 'Armadillo', 'Platypus', 'Mongoose', 'Meerkat', 'Wolverine', 'Pelican',
  'Woodpecker', 'Hummingbird', 'Scorpion', 'Tarantula', 'Seahorse', 'Starfish',
  'Stingray', 'Anteater', 'Albatross', 'Toucan',
];
const ANIMALS_HARD = [
  'Salamander', 'Pangolin', 'Narwhal', 'Capybara', 'Okapi', 'Axolotl', 'Wildebeest',
  'Aardvark', 'Echidna', 'Basilisk', 'Cassowary',
];

const PLACES_EASY = [
  'Castle', 'Library', 'Museum', 'Stadium', 'Aquarium', 'Lighthouse', 'Playground',
  'Bakery', 'Hospital', 'School', 'Farmhouse', 'Treehouse', 'Windmill', 'Harbor',
  'Fountain', 'Bridge', 'Volcano',
];
const PLACES_MEDIUM = [
  'Cathedral', 'Skyscraper', 'Observatory', 'Greenhouse', 'Warehouse', 'Amphitheater',
  'Monastery', 'Courtyard', 'Boardwalk', 'Marketplace', 'Planetarium', 'Racetrack',
  'Vineyard', 'Orchard', 'Canyon', 'Glacier', 'Waterfall', 'Rainforest', 'Peninsula',
  'Archipelago', 'Arboretum', 'Citadel',
];
const PLACES_HARD = [
  'Mausoleum', 'Sanatorium', 'Aqueduct', 'Catacombs', 'Colosseum', 'Fjord', 'Isthmus',
  'Prairie', 'Tundra', 'Savanna', 'Steppe',
];

const FOOD_EASY = [
  'Pineapple', 'Watermelon', 'Strawberry', 'Chocolate', 'Pancake', 'Popcorn', 'Sandwich',
  'Hamburger', 'Spaghetti', 'Cupcake', 'Doughnut', 'Lemonade', 'Avocado', 'Broccoli',
  'Pretzel', 'Waffle', 'Coconut',
];
const FOOD_MEDIUM = [
  'Blueberry', 'Cinnamon', 'Milkshake', 'Meatball', 'Pepperoni', 'Cheesecake',
  'Marshmallow', 'Grapefruit', 'Cantaloupe', 'Applesauce', 'Eggplant', 'Cornbread',
  'Honeycomb', 'Asparagus', 'Artichoke', 'Cauliflower', 'Zucchini', 'Casserole',
  'Guacamole', 'Croissant', 'Baguette', 'Smoothie',
];
const FOOD_HARD = [
  'Enchilada', 'Quesadilla', 'Butterscotch', 'Gingerbread', 'Buttermilk', 'Ratatouille',
  'Bouillabaisse', 'Prosciutto', 'Bruschetta', 'Empanada', 'Tiramisu',
];

const SPORTS_EASY = [
  'Basketball', 'Football', 'Baseball', 'Volleyball', 'Swimming', 'Bowling', 'Boxing',
  'Skateboarding', 'Surfing', 'Skiing', 'Cycling', 'Wrestling', 'Golf', 'Tennis',
  'Hockey', 'Gymnastics',
];
const SPORTS_MEDIUM = [
  'Badminton', 'Snowboarding', 'Archery', 'Fencing', 'Rowing', 'Sailing', 'Diving',
  'Cricket', 'Rugby', 'Karate', 'Triathlon', 'Marathon', 'Weightlifting', 'Powerlifting',
  'Racquetball', 'Curling', 'Lacrosse', 'Handball', 'Softball', 'Paintball', 'Dodgeball',
  'Trampolining',
];
const SPORTS_HARD = [
  'Taekwondo', 'Pentathlon', 'Decathlon', 'Biathlon', 'Parkour', 'Bobsledding',
  'Orienteering', 'Steeplechase', 'Dressage', 'Waterpolo', 'Canoeing',
];

function tier(words: string[], category: Category, difficulty: Difficulty): WordEntry[] {
  return words.map((word) => ({ word, category, difficulty }));
}

export const WORD_LIST: WordEntry[] = [
  ...tier(OBJECTS_EASY, 'Objects', 'easy'),
  ...tier(OBJECTS_MEDIUM, 'Objects', 'medium'),
  ...tier(OBJECTS_HARD, 'Objects', 'hard'),
  ...tier(ANIMALS_EASY, 'Animals', 'easy'),
  ...tier(ANIMALS_MEDIUM, 'Animals', 'medium'),
  ...tier(ANIMALS_HARD, 'Animals', 'hard'),
  ...tier(PLACES_EASY, 'Places', 'easy'),
  ...tier(PLACES_MEDIUM, 'Places', 'medium'),
  ...tier(PLACES_HARD, 'Places', 'hard'),
  ...tier(FOOD_EASY, 'Food & Drink', 'easy'),
  ...tier(FOOD_MEDIUM, 'Food & Drink', 'medium'),
  ...tier(FOOD_HARD, 'Food & Drink', 'hard'),
  ...tier(SPORTS_EASY, 'Sports', 'easy'),
  ...tier(SPORTS_MEDIUM, 'Sports', 'medium'),
  ...tier(SPORTS_HARD, 'Sports', 'hard'),
];

/** Fisher-Yates sample of n distinct items (n may exceed pool length; clamps). */
function sample<T>(pool: readonly T[], n: number): T[] {
  const copy = [...pool];
  const out: T[] = [];
  const count = Math.min(n, copy.length);
  for (let i = 0; i < count; i++) {
    const idx = Math.floor(Math.random() * copy.length);
    out.push(copy.splice(idx, 1)[0]);
  }
  return out;
}

/**
 * Builds one full game's 9 target words, per the locked spec:
 * 3 Easy + 4 Medium + 2 Hard, no repeats, spanning at least 3 categories,
 * shuffled so difficulty doesn't telegraph round to round.
 */
export function generateGame(): WordEntry[] {
  const easyPool = WORD_LIST.filter((w) => w.difficulty === 'easy');
  const mediumPool = WORD_LIST.filter((w) => w.difficulty === 'medium');
  const hardPool = WORD_LIST.filter((w) => w.difficulty === 'hard');

  for (let attempt = 0; attempt < 25; attempt++) {
    const picks = [...sample(easyPool, 3), ...sample(mediumPool, 4), ...sample(hardPool, 2)];
    const categoriesUsed = new Set(picks.map((w) => w.category));
    if (categoriesUsed.size >= 3) {
      return sample(picks, picks.length); // shuffle final round order
    }
  }

  // Astronomically unlikely fallback — accept whatever the last attempt drew.
  return [...sample(easyPool, 3), ...sample(mediumPool, 4), ...sample(hardPool, 2)];
}

/** Single random pick — used by dev tooling; gameplay uses generateGame(). */
export function pickWord(): WordEntry {
  return WORD_LIST[Math.floor(Math.random() * WORD_LIST.length)];
}
