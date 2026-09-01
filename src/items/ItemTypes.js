// Item catalog: materials, tool/weapon/armor tiers, food, and magic items.
// Tool and armor tiers are generated from a compact table rather than
// hand-written per item, since the five equipment tiers (Ruddle, Ferrite,
// Aurum, Glimmer, Voidshard — MineBlock's original copper/iron/gold/
// diamond/netherite-equivalent line) all share the same shape.
import { ItemRegistry } from './ItemRegistry.js';
import { BlockRegistry } from '../blocks/BlockRegistry.js';

const icon = (shape, color, accent) => ({ shape, color, accent });

/** Registers a placeable item for every block so any block can be carried/placed. */
export function registerBlockItems() {
  for (const block of BlockRegistry.all()) {
    if (ItemRegistry.get(block.name)) continue;
    ItemRegistry.register({
      id: block.name,
      displayName: block.displayName,
      category: 'block',
      description: `A block of ${block.displayName.toLowerCase()}.`,
      stackSize: 64,
      blockName: block.name,
      texture: { shape: 'block', blockName: block.name },
      fuel: block.name.includes('log') || block.name.includes('planks') ? 300 : 0
    });
  }
}

// ---------------------------------------------------------------------- //
// Material tiers — mirrors the ore chain in BlockTypes.js
// ---------------------------------------------------------------------- //
export const MATERIAL_TIERS = [
  { id: 'wood', name: 'Wood', color: '#a67a4a', tierIndex: 0 },
  { id: 'ruddle', name: 'Ruddle', color: '#c17a4c', tierIndex: 1 },
  { id: 'ferrite', name: 'Ferrite', color: '#b8926a', tierIndex: 2 },
  { id: 'aurum', name: 'Aurum', color: '#e8cf4f', tierIndex: 3 },
  { id: 'glimmer', name: 'Glimmer', color: '#8fe9e0', tierIndex: 4 },
  { id: 'voidshard', name: 'Voidshard', color: '#a35bff', tierIndex: 5 }
];

const TOOL_STATS = {
  wood: { durability: 60, miningSpeed: 2.0, miningLevel: 0, damage: 1 },
  ruddle: { durability: 150, miningSpeed: 4.0, miningLevel: 1, damage: 2 },
  ferrite: { durability: 260, miningSpeed: 6.0, miningLevel: 2, damage: 3 },
  aurum: { durability: 100, miningSpeed: 9.0, miningLevel: 3, damage: 2 },
  glimmer: { durability: 900, miningSpeed: 8.0, miningLevel: 3, damage: 4 },
  voidshard: { durability: 1800, miningSpeed: 10.0, miningLevel: 4, damage: 6 }
};

const ARMOR_STATS = {
  ruddle: { defense: 1, toughness: 0 },
  ferrite: { defense: 2, toughness: 1 },
  aurum: { defense: 1, toughness: 0 },
  glimmer: { defense: 3, toughness: 2 },
  voidshard: { defense: 4, toughness: 3 }
};

const ARMOR_SLOTS = [
  { slot: 'helmet', weight: 1.0, shape: 'helmet' },
  { slot: 'chest', weight: 2.0, shape: 'chest' },
  { slot: 'legs', weight: 1.6, shape: 'legs' },
  { slot: 'boots', weight: 0.8, shape: 'boots' }
];

// Raw ore chunks (drop from mining) and their smelted ingots.
for (const tier of MATERIAL_TIERS) {
  if (tier.id === 'wood') continue;
  ItemRegistry.register({
    id: `${tier.id}_chunk`, displayName: `${tier.name} Chunk`, category: 'material',
    description: `Raw ${tier.name.toLowerCase()} ore, freshly mined. Smelt it into an ingot.`,
    texture: icon('chunk', tier.color)
  });
  if (tier.id !== 'glimmer' && tier.id !== 'voidshard') {
    ItemRegistry.register({
      id: `${tier.id}_ingot`, displayName: `${tier.name} Ingot`, category: 'material',
      description: `A refined bar of ${tier.name.toLowerCase()}, ready for the forge.`,
      texture: icon('ingot', tier.color)
    });
  }
}
ItemRegistry.register({ id: 'glimmer_shard', displayName: 'Glimmer Shard', category: 'material', description: 'A brilliant, hard gemstone.', texture: icon('gem', '#8fe9e0') });
ItemRegistry.register({ id: 'voidshard', displayName: 'Voidshard', category: 'material', description: 'A shard humming with otherworldly energy.', texture: icon('gem', '#a35bff') });
ItemRegistry.register({ id: 'glint_chunk', displayName: 'Glint Chunk', category: 'material', description: 'Raw glint ore, used in Infusions.', texture: icon('chunk', '#c9d6d6') });
ItemRegistry.register({ id: 'glint_ingot', displayName: 'Glint Ingot', category: 'material', description: 'A refined bar with a faint shimmer, prized by Runeforges.', texture: icon('ingot', '#c9d6d6') });
ItemRegistry.register({ id: 'sulfur_shard', displayName: 'Sulfur Shard', category: 'material', description: 'A crystal that reeks of the Ember Expanse.', texture: icon('gem', '#e0d24a') });
ItemRegistry.register({ id: 'char_lump', displayName: 'Char Lump', category: 'material', description: 'Combustible black lumps. Good fuel.', texture: icon('chunk', '#2b2b2e'), fuel: 800 });

ItemRegistry.register({ id: 'stick', displayName: 'Stick', category: 'material', description: 'A simple wooden stick.', texture: icon('stick', '#a67a4a'), fuel: 100 });
ItemRegistry.register({ id: 'fiber', displayName: 'Plant Fiber', category: 'material', description: 'Stringy fiber stripped from tall grass.', texture: icon('fiber', '#8fae5c') });

// ---------------------------------------------------------------------- //
// Tools & weapons
// ---------------------------------------------------------------------- //
const TOOL_TYPES = ['pickaxe', 'axe', 'shovel', 'sword', 'hoe'];
for (const tier of MATERIAL_TIERS) {
  const stats = TOOL_STATS[tier.id];
  for (const type of TOOL_TYPES) {
    ItemRegistry.register({
      id: `${tier.id}_${type}`,
      displayName: `${tier.name} ${type[0].toUpperCase()}${type.slice(1)}`,
      category: type === 'sword' ? 'weapon' : 'tool',
      description: `A ${type} forged from ${tier.name.toLowerCase()}.`,
      stackSize: 1,
      texture: icon(type, tier.color),
      tool: {
        type,
        tier: tier.id,
        tierIndex: tier.tierIndex,
        durability: stats.durability,
        miningSpeed: stats.miningSpeed,
        miningLevel: stats.miningLevel,
        damage: stats.damage + (type === 'sword' ? 2 : type === 'axe' ? 1 : 0)
      }
    });
  }
}
ItemRegistry.register({ id: 'bare_hand_reference', displayName: 'Bare Hands', category: 'tool', description: 'No tool equipped.', stackSize: 1, texture: icon('hand', '#e0b98a'), tool: { type: 'hand', tier: 'none', tierIndex: -1, durability: Infinity, miningSpeed: 1, miningLevel: 0, damage: 1 } });

// ---------------------------------------------------------------------- //
// Armor
// ---------------------------------------------------------------------- //
for (const tier of MATERIAL_TIERS) {
  const armorStats = ARMOR_STATS[tier.id];
  if (!armorStats) continue;
  for (const slotDef of ARMOR_SLOTS) {
    ItemRegistry.register({
      id: `${tier.id}_${slotDef.slot}`,
      displayName: `${tier.name} ${slotDef.slot[0].toUpperCase()}${slotDef.slot.slice(1)}`,
      category: 'armor',
      description: `${slotDef.slot} armor forged from ${tier.name.toLowerCase()}.`,
      stackSize: 1,
      texture: icon(slotDef.shape, tier.color),
      armor: {
        slot: slotDef.slot,
        defense: Math.round(armorStats.defense * slotDef.weight),
        toughness: armorStats.toughness,
        durability: 200 + tier.tierIndex * 150
      }
    });
  }
}

// ---------------------------------------------------------------------- //
// Food
// ---------------------------------------------------------------------- //
ItemRegistry.register({ id: 'barley_grain', displayName: 'Barley Grain', category: 'food', description: 'Raw grain harvested from a Barley Stalk.', texture: icon('grain', '#d8b84a'), food: { hunger: 1, saturation: 0.6 } });
ItemRegistry.register({ id: 'baked_loaf', displayName: 'Baked Loaf', category: 'food', description: 'Hearty bread baked in a Smelter.', texture: icon('bread', '#c99a4a'), food: { hunger: 4, saturation: 3.0 }, fuel: 0 });
ItemRegistry.register({ id: 'tuber', displayName: 'Tuber', category: 'food', description: 'A starchy root vegetable.', texture: icon('root', '#c9924a'), food: { hunger: 1, saturation: 0.5 } });
ItemRegistry.register({ id: 'roasted_tuber', displayName: 'Roasted Tuber', category: 'food', description: 'A tuber roasted until tender.', texture: icon('root', '#a06a2f'), food: { hunger: 3, saturation: 2.4 } });
ItemRegistry.register({ id: 'wild_berries', displayName: 'Wild Berries', category: 'food', description: 'Sweet forest berries.', texture: icon('berries', '#b0453f'), food: { hunger: 2, saturation: 1.2 } });
ItemRegistry.register({ id: 'raw_meat', displayName: 'Raw Meat', category: 'food', description: 'Meat from a creature. Best cooked first.', texture: icon('meat', '#c46a5a'), food: { hunger: 1, saturation: 0.4 } });
ItemRegistry.register({ id: 'cooked_meat', displayName: 'Cooked Meat', category: 'food', description: 'Meat seared over a Smelter.', texture: icon('meat', '#8a4a2f'), food: { hunger: 5, saturation: 4.0 } });

// ---------------------------------------------------------------------- //
// Magic / Infusion system items
// ---------------------------------------------------------------------- //
ItemRegistry.register({ id: 'infusion_dust', displayName: 'Infusion Dust', category: 'magic', description: 'Glittering dust used to power the Runeforge.', texture: icon('dust', '#a35bff') });
ItemRegistry.register({ id: 'rune_shard', displayName: 'Rune Shard', category: 'magic', description: 'A shard etched with a faint sigil. Consumed to apply an Infusion.', texture: icon('shard', '#7d3fe0') });
// The two amulets. Both used to be armour with a flavour line: the Warding
// Amulet was two points of defense, indistinguishable from a scrap of plate,
// and the Vigor Amulet promised a quicker step and swing while granting
// literally nothing — no code anywhere read it. They now carry standing
// powers (see Inventory.amuletPower) and their descriptions state the
// numbers, because an effect the player cannot see is one they cannot plan
// around.
ItemRegistry.register({ id: 'warding_amulet', displayName: 'Warding Amulet', category: 'magic', description: 'Worn around the neck. +2 defense, and turns aside a further 25% of every blow that gets through.', stackSize: 1, texture: icon('amulet', '#8fe9e0'), equipSlot: 'amulet', armor: { slot: 'amulet', defense: 2, toughness: 1, durability: 400 }, amulet: { ward: 0.25 } });
ItemRegistry.register({ id: 'vigor_amulet', displayName: 'Vigor Amulet', category: 'magic', description: 'Worn around the neck. Moves you 20% faster and lets you swing 30% quicker.', stackSize: 1, texture: icon('amulet', '#e8cf4f'), equipSlot: 'amulet', armor: { slot: 'amulet', defense: 0, toughness: 0, durability: 400 }, amulet: { haste: 0.20, swiftness: 0.30 } });
ItemRegistry.register({ id: 'elixir_of_mending', displayName: 'Elixir of Mending', category: 'magic', description: 'A bottled brew that knits wounds shut.', texture: icon('potion', '#6fc274'), food: { hunger: 0, saturation: 0, heal: 6 } });
ItemRegistry.register({ id: 'elixir_of_haste', displayName: 'Elixir of Haste', category: 'magic', description: 'A bottled brew that quickens the drinker.', texture: icon('potion', '#e8a33d') });
ItemRegistry.register({ id: 'warden_core', displayName: 'Warden Core', category: 'magic', description: 'The molten heart of the Cinder Warden. The ultimate Infusion catalyst.', texture: icon('gem', '#ff6a2f') });

// ---------------------------------------------------------------------- //
// Defensive gear — both are held in the offhand, so they cost you the
// torch-carrying slot rather than a hotbar slot or an armor piece.
// ---------------------------------------------------------------------- //
ItemRegistry.register({
  id: 'bulwark_shield', displayName: 'Bulwark Shield', category: 'shield', stackSize: 1,
  description: 'Held in the offhand. Soaks up part of every blow until it splinters.',
  texture: icon('shield', '#9a7a4f'),
  shield: { block: 0.45, durability: 260 }
});
ItemRegistry.register({
  id: 'warding_totem', displayName: 'Warding Totem', category: 'magic', stackSize: 1,
  description: 'Shatters instead of you. Spent automatically on a killing blow, from the offhand or your pack.',
  texture: icon('totem', '#e8cf4f'),
  totem: { reviveHealth: 8 }
});

// ---------------------------------------------------------------------- //
// Misc / crafted tools
// ---------------------------------------------------------------------- //
ItemRegistry.register({ id: 'flint_striker', displayName: 'Flint Striker', category: 'tool', description: 'Strikes a spark. Lights torches and Smelters.', stackSize: 1, texture: icon('striker', '#7a7a7f') });

export const TOOL_TYPES_LIST = TOOL_TYPES;
export const ARMOR_SLOTS_LIST = ARMOR_SLOTS.map((s) => s.slot);
