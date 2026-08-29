// Handles serializing/deserializing a full game session to a single save
// slot. Worlds are procedurally generated from a seed, so we only persist
// the *diff* from that generation (blocks the player placed or broke) —
// this keeps save files small regardless of how much of the infinite world
// has been explored.

const isElectron = !!window.mineblock?.saves;
const LOCAL_PREFIX = 'mineblock.save.';

async function listLocalSaves() {
  const slots = [];
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (!key?.startsWith(LOCAL_PREFIX)) continue;
    try {
      const data = JSON.parse(localStorage.getItem(key));
      slots.push({
        name: key.slice(LOCAL_PREFIX.length),
        modified: data.savedAt ?? 0,
        seed: data.seed,
        playedTime: data.playedTime ?? 0,
        dimension: data.player?.dimension ?? 'overworld'
      });
    } catch { /* skip corrupt entry */ }
  }
  slots.sort((a, b) => b.modified - a.modified);
  return slots;
}

export const SaveManager = {
  async listSaves() {
    return isElectron ? window.mineblock.saves.list() : listLocalSaves();
  },

  async load(name) {
    return isElectron
      ? window.mineblock.saves.load(name)
      : JSON.parse(localStorage.getItem(LOCAL_PREFIX + name));
  },

  async write(name, data) {
    data.savedAt = Date.now();
    if (isElectron) {
      return window.mineblock.saves.write(name, data);
    }
    localStorage.setItem(LOCAL_PREFIX + name, JSON.stringify(data));
    return true;
  },

  async delete(name) {
    return isElectron
      ? window.mineblock.saves.delete(name)
      : (localStorage.removeItem(LOCAL_PREFIX + name), true);
  },

  /** Builds the save payload from the live game systems. */
  serialize(game) {
    return {
      version: 1,
      seed: game.world.seed,
      playedTime: game.playedTime,
      ...game.dayNight.serialize(), // { time, day }
      player: game.player.serialize(),
      chunkDiffs: game.world.serializeAllDimensions()
    };
  }
};
