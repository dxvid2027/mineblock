// The Infusion system — MineBlock's original take on an enchantment-like
// upgrade mechanic. Infusions are applied at a Runeforge block, consuming
// player XP levels plus Rune Shards/Infusion Dust, and are stored directly
// on an equipment item's inventory stack (`stack.infusions: [{id, tier}]`).
// Because tools/armor always carry a `durability` field they never stack in
// Inventory (see Inventory.addItem), so each piece keeps its own list.
export const INFUSIONS = {
  keenedge: {
    id: 'keenedge', displayName: 'Keenedge', maxTier: 3,
    appliesTo: (item) => item.category === 'weapon' || item.category === 'tool',
    description: (tier) => `+${tier} melee damage.`
  },
  swiftmine: {
    id: 'swiftmine', displayName: 'Swiftmine', maxTier: 3,
    appliesTo: (item) => item.category === 'tool' && item.tool?.type !== 'sword',
    description: (tier) => `+${tier * 25}% mining speed.`
  },
  vitality_ward: {
    id: 'vitality_ward', displayName: 'Vitality Ward', maxTier: 3,
    appliesTo: (item) => item.category === 'armor',
    description: (tier) => `+${tier} defense.`
  },
  featherstep: {
    id: 'featherstep', displayName: 'Featherstep', maxTier: 2,
    appliesTo: (item) => item.armor?.slot === 'boots',
    description: (tier) => `Reduces fall damage by ${tier * 50}%.`
  },
  windward: {
    id: 'windward', displayName: 'Windward', maxTier: 2,
    appliesTo: (item) => item.armor?.slot === 'boots',
    description: (tier) => `+${tier * 8}% movement speed.`
  },
  aqua_ease: {
    id: 'aqua_ease', displayName: 'Aqua Ease', maxTier: 2,
    appliesTo: (item) => item.armor?.slot === 'chest' || item.armor?.slot === 'amulet',
    description: (tier) => `Breathe underwater ${tier === 2 ? 'indefinitely' : 'much longer'} and swim faster.`
  },
  thornedward: {
    id: 'thornedward', displayName: 'Thorned Ward', maxTier: 2,
    appliesTo: (item) => item.category === 'armor',
    description: (tier) => `Reflects ${tier * 15}% of melee damage taken back at the attacker.`
  },
  emberlight: {
    id: 'emberlight', displayName: 'Emberlight', maxTier: 1,
    appliesTo: () => true,
    description: () => 'The item glows, lighting the area around you.'
  }
};

export function availableInfusions(item) {
  return Object.values(INFUSIONS).filter((inf) => inf.appliesTo(item));
}

export function infusionCost(infusionId, tier) {
  const base = 2 + tier * 2;
  return { levels: base, runeShards: tier, infusionDust: tier * 2 };
}

export function getInfusionLevel(stack, infusionId) {
  return stack?.infusions?.find((i) => i.id === infusionId)?.tier ?? 0;
}

export function applyInfusion(stack, infusionId, tier) {
  if (!stack.infusions) stack.infusions = [];
  const existing = stack.infusions.find((i) => i.id === infusionId);
  if (existing) existing.tier = tier;
  else stack.infusions.push({ id: infusionId, tier });
}

export function infusionDescriptions(stack) {
  if (!stack?.infusions?.length) return [];
  return stack.infusions.map(({ id, tier }) => {
    const def = INFUSIONS[id];
    return def ? `${def.displayName} ${'I'.repeat(tier)} — ${def.description(tier)}` : null;
  }).filter(Boolean);
}
