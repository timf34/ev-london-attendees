import { createHash, randomInt } from "crypto";

const WORD_LIST = [
  "amber",
  "apple",
  "arrow",
  "autumn",
  "atlas",
  "bay",
  "breeze",
  "brook",
  "canyon",
  "cinder",
  "cliff",
  "comet",
  "crane",
  "crisp",
  "dawn",
  "drift",
  "dusk",
  "ember",
  "fable",
  "fern",
  "flame",
  "foxglove",
  "galaxy",
  "glade",
  "harbor",
  "harvest",
  "hollow",
  "horizon",
  "iron",
  "island",
  "ivory",
  "jade",
  "jelly",
  "knoll",
  "lantern",
  "marble",
  "meadow",
  "mint",
  "moss",
  "morrow",
  "ocean",
  "pebble",
  "pine",
  "quartz",
  "river",
  "rust",
  "sage",
  "silver",
  "sunset",
  "tide",
  "valley",
  "violet",
  "wharf",
  "winter",
];

export function generateEditSecret(): string {
  const words: string[] = [];

  for (let index = 0; index < 3; index += 1) {
    words.push(WORD_LIST[randomInt(0, WORD_LIST.length)]);
  }

  return words.join("-");
}

export function hashEditSecret(secret: string): string {
  return createHash("sha256").update(secret).digest("hex");
}
