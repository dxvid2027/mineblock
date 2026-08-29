// Definitions for every block in MineBlock. All names, palettes and
// materials below are original to this project. Importing this module has
// the side effect of populating BlockRegistry — it must be imported once,
// early, before world generation or rendering touches block IDs.
import { BlockRegistry } from './BlockRegistry.js';

const T = (pattern, color, opts = {}) => ({ pattern, color, ...opts });

function reg(def) { return BlockRegistry.register(def); }

// ---------------------------------------------------------------------- //
// Terrain & natural blocks
// ---------------------------------------------------------------------- //
export const GRASSY_SOD = reg({
  name: 'grassy_sod', displayName: 'Grassy Sod', category: 'terrain', hardness: 0.6, toolType: 'shovel',
  drops: 'loam',
  texture: {
    top: T('grain', '#5f9e42', { grain: '#71b352' }),
    bottom: T('grain', '#6b4a30', { grain: '#5a3d27' }),
    side: T('grassSide', '#6b4a30', { top: '#5f9e42', grain: '#5a3d27' })
  }
});
export const LOAM = reg({
  name: 'loam', displayName: 'Loam', category: 'terrain', hardness: 0.5, toolType: 'shovel',
  texture: { all: T('grain', '#6b4a30', { grain: '#5a3d27' }) }
});
export const STONE = reg({
  name: 'stone', displayName: 'Stone', category: 'terrain', hardness: 1.5, toolType: 'pickaxe',
  drops: 'cobbled_stone',
  texture: { all: T('speckle', '#8a8a8f', { grain: '#77777c' }) }
});
export const COBBLED_STONE = reg({
  name: 'cobbled_stone', displayName: 'Cobbled Stone', category: 'terrain', hardness: 2, toolType: 'pickaxe',
  texture: { all: T('cobble', '#83838a', { grain: '#66666c' }) }
});
export const SAND = reg({
  name: 'sand', displayName: 'Sand', category: 'terrain', hardness: 0.5, toolType: 'shovel', gravity: true,
  texture: { all: T('grain', '#dcc873', { grain: '#cbb763' }) }
});
export const RED_SAND = reg({
  name: 'red_sand', displayName: 'Red Sand', category: 'terrain', hardness: 0.5, toolType: 'shovel', gravity: true,
  texture: { all: T('grain', '#c46a3a', { grain: '#b25a2d' }) }
});
export const GRAVEL = reg({
  name: 'gravel', displayName: 'Gravel', category: 'terrain', hardness: 0.6, toolType: 'shovel', gravity: true,
  texture: { all: T('speckle', '#8d8579', { grain: '#726a5f' }) }
});
export const CLAY = reg({
  name: 'clay', displayName: 'Clay', category: 'terrain', hardness: 0.6, toolType: 'shovel',
  texture: { all: T('solid', '#9aa7b0') }
});
export const SNOWCAP = reg({
  name: 'snowcap', displayName: 'Snowcap', category: 'terrain', hardness: 0.2, toolType: 'shovel',
  texture: { all: T('grain', '#f3f7fb', { grain: '#e3ecf5' }) }
});
export const ICE_SHEET = reg({
  name: 'ice_sheet', displayName: 'Ice Sheet', category: 'terrain', hardness: 0.5, toolType: 'pickaxe', transparent: true,
  texture: { all: T('solid', '#a9d8ec') }
});
export const FROZEN_LOAM = reg({
  name: 'frozen_loam', displayName: 'Frozen Loam', category: 'terrain', hardness: 0.6, toolType: 'shovel',
  texture: { all: T('grain', '#5f7161', { grain: '#546655' }) }
});
export const BOG_MUD = reg({
  name: 'bog_mud', displayName: 'Bog Mud', category: 'terrain', hardness: 0.5, toolType: 'shovel',
  texture: { all: T('grain', '#4a4032', { grain: '#3c3427' }) }
});
export const MOSSY_STONE = reg({
  name: 'mossy_stone', displayName: 'Mossy Stone', category: 'terrain', hardness: 1.5, toolType: 'pickaxe',
  texture: { all: T('speckle', '#748a63', { grain: '#5f7350' }) }
});

// ---------------------------------------------------------------------- //
// Ores & rare resources
// ---------------------------------------------------------------------- //
export const RUDDLE_ORE = reg({
  name: 'ruddle_ore', displayName: 'Ruddle Ore', category: 'ore', hardness: 2, toolType: 'pickaxe', minToolTier: 1,
  drops: 'ruddle_chunk', dropCount: [1, 2],
  texture: { all: T('speckle', '#8a8a8f', { grain: '#c17a4c' }) }
});
export const GLINT_ORE = reg({
  name: 'glint_ore', displayName: 'Glint Ore', category: 'ore', hardness: 2, toolType: 'pickaxe', minToolTier: 1,
  drops: 'glint_chunk', dropCount: [1, 2],
  texture: { all: T('speckle', '#8a8a8f', { grain: '#c9d6d6' }) }
});
export const FERRITE_ORE = reg({
  name: 'ferrite_ore', displayName: 'Ferrite Ore', category: 'ore', hardness: 3, toolType: 'pickaxe', minToolTier: 2,
  drops: 'ferrite_chunk', dropCount: [1, 2],
  texture: { all: T('speckle', '#8a8a8f', { grain: '#b8926a' }) }
});
export const AURUM_ORE = reg({
  name: 'aurum_ore', displayName: 'Aurum Ore', category: 'ore', hardness: 3, toolType: 'pickaxe', minToolTier: 3,
  drops: 'aurum_chunk', dropCount: [1, 2],
  texture: { all: T('speckle', '#8a8a8f', { grain: '#e8cf4f' }) }
});
export const GLIMMERSTONE_ORE = reg({
  name: 'glimmerstone_ore', displayName: 'Glimmerstone Ore', category: 'ore', hardness: 4, toolType: 'pickaxe', minToolTier: 3,
  drops: 'glimmer_shard', dropCount: [1, 1],
  texture: { all: T('speckle', '#6f7bb0', { grain: '#8fe9e0' }) }
});
export const VOIDSHARD_ORE = reg({
  name: 'voidshard_ore', displayName: 'Voidshard Ore', category: 'ore', hardness: 5, toolType: 'pickaxe', minToolTier: 4,
  drops: 'voidshard', dropCount: [1, 1], lightEmission: 4,
  texture: { all: T('speckle', '#2a2338', { grain: '#a35bff' }) }
});
export const CHAR_COAL_SEAM = reg({
  name: 'char_seam', displayName: 'Char Seam', category: 'ore', hardness: 1.5, toolType: 'pickaxe',
  drops: 'char_lump', dropCount: [1, 3],
  texture: { all: T('speckle', '#8a8a8f', { grain: '#2b2b2e' }) }
});

// ---------------------------------------------------------------------- //
// Flora & wood
// ---------------------------------------------------------------------- //
function tree(id, displayPrefix, barkColor, barkGrain, leafColor, leafGrain, plankColor) {
  const log = reg({
    name: `${id}_log`, displayName: `${displayPrefix} Log`, category: 'wood', hardness: 1.2, toolType: 'axe',
    texture: {
      top: T('rings', barkColor, { grain: barkGrain }),
      bottom: T('rings', barkColor, { grain: barkGrain }),
      side: T('bark', barkColor, { grain: barkGrain })
    }
  });
  const leaves = reg({
    name: `${id}_leaves`, displayName: `${displayPrefix} Leaves`, category: 'wood', hardness: 0.3, toolType: 'none',
    transparent: true, drops: `${id}_sapling`, dropCount: [0, 1],
    texture: { all: T('leafy', leafColor, { grain: leafGrain }) }
  });
  const planks = reg({
    name: `${id}_planks`, displayName: `${displayPrefix} Planks`, category: 'wood', hardness: 1, toolType: 'axe',
    texture: { all: T('planks', plankColor, { grain: barkGrain }) }
  });
  const sapling = reg({
    name: `${id}_sapling`, displayName: `${displayPrefix} Sapling`, category: 'flora', hardness: 0, toolType: 'none',
    solid: false, transparent: true, plant: true,
    texture: { all: T('sprig', leafColor, { grain: barkGrain }) }
  });
  return { log, leaves, planks, sapling };
}

export const DUSKWOOD = tree('duskwood', 'Duskwood', '#6a4a2f', '#4f3721', '#4f8f4a', '#3d7a3d', '#a67a4a');
export const FROSTPINE = tree('frostpine', 'Frostpine', '#5c4636', '#463527', '#3f7a6e', '#2f6559', '#8a6a4f');
export const SABLEWOOD = tree('sablewood', 'Sablewood', '#403428', '#33291f', '#556b3f', '#465a32', '#6e5a44');

export const TALL_GRASS = reg({
  name: 'tall_grass', displayName: 'Tall Grass', category: 'flora', hardness: 0, toolType: 'none',
  solid: false, transparent: true, plant: true, drops: null,
  texture: { all: T('sprig', '#5f9e42', { grain: '#48793a' }) }
});
export const EMBERBLOOM = reg({
  name: 'emberbloom', displayName: 'Emberbloom', category: 'flora', hardness: 0, toolType: 'none',
  solid: false, transparent: true, plant: true,
  texture: { all: T('flower', '#e0703f', { grain: '#5f9e42' }) }
});
export const FROSTBELL = reg({
  name: 'frostbell', displayName: 'Frostbell', category: 'flora', hardness: 0, toolType: 'none',
  solid: false, transparent: true, plant: true,
  texture: { all: T('flower', '#8fb9e8', { grain: '#5f9e42' }) }
});
export const SPINEPAD = reg({
  name: 'spinepad', displayName: 'Spinepad', category: 'flora', hardness: 0.4, toolType: 'axe',
  texture: { all: T('grain', '#4c7a3f', { grain: '#3d6432' }) }
});

// ---------------------------------------------------------------------- //
// Liquids
// ---------------------------------------------------------------------- //
export const WATER = reg({
  name: 'water', displayName: 'Water', category: 'liquid', solid: false, liquid: true, transparent: true, hardness: 0,
  texture: { all: T('liquid', '#2e6fa8', { grain: '#3d84c4' }) }
});
export const MAGMA = reg({
  name: 'magma', displayName: 'Magma', category: 'liquid', solid: false, liquid: true, transparent: true, hardness: 0,
  lightEmission: 12,
  texture: { all: T('liquid', '#c9440f', { grain: '#f2a13a' }) }
});

// ---------------------------------------------------------------------- //
// Functional blocks
// ---------------------------------------------------------------------- //
export const WORKBENCH = reg({
  name: 'workbench', displayName: 'Workbench', category: 'functional', hardness: 1, toolType: 'axe',
  interactive: 'crafting',
  texture: {
    top: T('gridTop', '#a67a4a', { grain: '#7a5735' }),
    side: T('planks', '#8a643f', { grain: '#6a4a2f' })
  }
});
export const SMELTER = reg({
  name: 'smelter', displayName: 'Smelter', category: 'functional', hardness: 2.5, toolType: 'pickaxe',
  interactive: 'smelter',
  texture: {
    top: T('speckle', '#6a6a6e', { grain: '#4f4f52' }),
    side: T('furnaceFace', '#6a6a6e', { grain: '#2b2b2e' })
  }
});
export const RUNEFORGE = reg({
  name: 'runeforge', displayName: 'Runeforge', category: 'functional', hardness: 3, toolType: 'pickaxe',
  interactive: 'runeforge', lightEmission: 6,
  texture: {
    top: T('runic', '#2a2344', { grain: '#a35bff' }),
    side: T('runic', '#241f3b', { grain: '#7d3fe0' })
  }
});
export const STORAGE_CRATE = reg({
  name: 'storage_crate', displayName: 'Storage Crate', category: 'functional', hardness: 1, toolType: 'axe',
  interactive: 'storage',
  texture: {
    top: T('planks', '#8a6a4f', { grain: '#6a4a2f' }),
    side: T('crate', '#8a6a4f', { grain: '#5a3d27' })
  }
});
export const TORCH = reg({
  name: 'torch', displayName: 'Torch', category: 'functional', hardness: 0, toolType: 'none',
  solid: false, transparent: true, lightEmission: 14,
  texture: { all: T('torch', '#8a6a4f', { grain: '#f2a13a' }) }
});
export const GLOWSTONE_LANTERN = reg({
  name: 'glow_lantern', displayName: 'Glowstone Lantern', category: 'functional', hardness: 1, toolType: 'pickaxe',
  lightEmission: 15, texture: { all: T('speckle', '#f2e6a8', { grain: '#e0d27a' }) }
});
export const RIFTSTONE = reg({
  name: 'riftstone', displayName: 'Riftstone', category: 'functional', hardness: 8, toolType: 'pickaxe', minToolTier: 4,
  lightEmission: 10, interactive: 'portal',
  texture: { all: T('runic', '#160f2b', { grain: '#a35bff' }) }
});
export const TILLED_SOIL = reg({
  name: 'tilled_soil', displayName: 'Tilled Soil', category: 'functional', hardness: 0.5, toolType: 'shovel',
  texture: { top: T('furrow', '#4a3623', { grain: '#3a2a1a' }), side: T('grain', '#4a3623', { grain: '#3a2a1a' }) }
});
export const LADDER = reg({
  name: 'ladder', displayName: 'Ladder', category: 'functional', hardness: 0.4, toolType: 'axe',
  solid: false, transparent: true,
  texture: { all: T('ladder', '#8a6a4f', { grain: '#5a3d27' }) }
});
export const BEDROLL = reg({
  name: 'bedroll', displayName: 'Bedroll', category: 'functional', hardness: 0.3, toolType: 'none',
  solid: false, transparent: true, interactive: 'bed',
  texture: { all: T('cloth', '#b0453f', { grain: '#8a332e' }) }
});

// ---------------------------------------------------------------------- //
// Crops
// ---------------------------------------------------------------------- //
export const BARLEY_STALK = reg({
  name: 'barley_stalk', displayName: 'Barley Stalk', category: 'crop', hardness: 0, toolType: 'none',
  solid: false, transparent: true, plant: true, drops: 'barley_grain', dropCount: [1, 3],
  texture: { all: T('crop', '#d8b84a', { grain: '#c2a23e' }) }
});
export const TUBER_ROOT = reg({
  name: 'tuber_root', displayName: 'Tuber Root', category: 'crop', hardness: 0, toolType: 'none',
  solid: false, transparent: true, plant: true, drops: 'tuber', dropCount: [1, 3],
  texture: { all: T('crop', '#6a9e4a', { grain: '#4a7a32' }) }
});

// ---------------------------------------------------------------------- //
// Decorative / building blocks
// ---------------------------------------------------------------------- //
export const STONE_BRICKS = reg({
  name: 'stone_bricks', displayName: 'Stone Bricks', category: 'decorative', hardness: 2, toolType: 'pickaxe',
  texture: { all: T('brick', '#83838a', { grain: '#5c5c62' }) }
});
export const POLISHED_STONE = reg({
  name: 'polished_stone', displayName: 'Polished Stone', category: 'decorative', hardness: 2, toolType: 'pickaxe',
  texture: { all: T('solid', '#96969c') }
});
export const GLASS_PANE = reg({
  name: 'glass_pane', displayName: 'Glass Pane', category: 'decorative', hardness: 0.4, toolType: 'none',
  transparent: true,
  texture: { all: T('glass', '#cfe8f0', { grain: '#eaf6fa' }) }
});
export const WOVEN_CLOTH_RED = reg({
  name: 'woven_cloth_red', displayName: 'Woven Cloth (Crimson)', category: 'decorative', hardness: 0.3, toolType: 'none',
  texture: { all: T('cloth', '#b0453f', { grain: '#8a332e' }) }
});
export const WOVEN_CLOTH_BLUE = reg({
  name: 'woven_cloth_blue', displayName: 'Woven Cloth (Azure)', category: 'decorative', hardness: 0.3, toolType: 'none',
  texture: { all: T('cloth', '#3f6fb0', { grain: '#2e5590' }) }
});
export const WOVEN_CLOTH_GOLD = reg({
  name: 'woven_cloth_gold', displayName: 'Woven Cloth (Aurum)', category: 'decorative', hardness: 0.3, toolType: 'none',
  texture: { all: T('cloth', '#d8b84a', { grain: '#b0923a' }) }
});
export const SCROLL_SHELF = reg({
  name: 'scroll_shelf', displayName: 'Scroll Shelf', category: 'decorative', hardness: 1.5, toolType: 'axe',
  texture: { top: T('planks', '#8a6a4f', { grain: '#6a4a2f' }), side: T('shelf', '#8a6a4f', { grain: '#5a3d27' }) }
});
export const SUNBAKED_BRICK = reg({
  name: 'sunbaked_brick', displayName: 'Sunbaked Brick', category: 'decorative', hardness: 2, toolType: 'pickaxe',
  texture: { all: T('brick', '#c46a3a', { grain: '#a0552c' }) }
});

// ---------------------------------------------------------------------- //
// Ember Expanse dimension blocks
// ---------------------------------------------------------------------- //
export const ASHSTONE = reg({
  name: 'ashstone', displayName: 'Ashstone', category: 'terrain', hardness: 2.5, toolType: 'pickaxe',
  texture: { all: T('speckle', '#4a3f42', { grain: '#332a2d' }) }
});
export const EMBER_DUST = reg({
  name: 'ember_dust', displayName: 'Ember Dust', category: 'terrain', hardness: 0.4, toolType: 'shovel',
  lightEmission: 3,
  texture: { all: T('grain', '#5c2a1f', { grain: '#7a3a28' }) }
});
export const SULFUR_CRYSTAL = reg({
  name: 'sulfur_crystal', displayName: 'Sulfur Crystal', category: 'ore', hardness: 3, toolType: 'pickaxe', minToolTier: 2,
  drops: 'sulfur_shard', dropCount: [1, 2], lightEmission: 5,
  texture: { all: T('speckle', '#4a3f42', { grain: '#e0d24a' }) }
});
export const CINDER_LOG = reg({
  name: 'cinder_log', displayName: 'Cinderwood Log', category: 'wood', hardness: 1.5, toolType: 'axe',
  lightEmission: 2,
  texture: {
    top: T('rings', '#3a2a2a', { grain: '#8a3a1f' }),
    bottom: T('rings', '#3a2a2a', { grain: '#8a3a1f' }),
    side: T('bark', '#3a2a2a', { grain: '#8a3a1f' })
  }
});

export const ALL_BLOCKS = BlockRegistry.all();
