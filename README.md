# MineBlock

MineBlock is a complete, original single-player voxel sandbox survival game
for desktop (Windows, macOS, Linux), built with [three.js](https://threejs.org/)
and packaged as a desktop app with [Electron](https://www.electronjs.org/).
Every block, item, creature, dimension, texture and system in this project
is original content — no assets, names, or code were copied from any
existing game.

## Highlights

- **Infinite procedurally generated world** with six overworld biomes
  (Sunlit Plains, Duskwood Forest, Sunbaked Desert, Craggy Peaks, Frostbound
  Tundra, Murkroot Swamp), caves, ore veins, underground "Buried Cache"
  structures, and a day/night cycle with dynamic weather (rain/snow).
- **A second dimension**, the Ember Expanse, reached through a crafted
  Riftstone portal — its own terrain, ores, and hostile creatures, guarded
  by an original boss: **The Cinder Warden**.
- **First-person survival**: block placing/breaking, a hand-crafted
  tool-tier progression (Wood → Ruddle → Ferrite → Aurum → Glimmer →
  Voidshard), health/hunger/breath, fall damage, farming, and eight
  original creatures.
- **Full crafting economy**: a Workbench, a Smelter (smelting + cooking),
  a Storage Crate, and a **Runeforge** — MineBlock's original
  enchantment-like "Infusion" system (Keenedge, Swiftmine, Vitality Ward,
  Featherstep, Windward, Aqua Ease, Thorned Ward, Emberlight).
- **All original graphics**: every block face and item icon is generated
  procedurally at startup by algorithmic pixel-art routines
  (`src/render/PatternDraw.js`) — nothing is loaded from an image file.
- **Random world spawn**: every new world starts at a different, seed-derived
  location, vetted to be dry land above sea level on reasonably even ground.
- **Ten generated structures with loot**, spread across both dimensions and
  both surface and underground: Wayside Shrine, Collapsed Watchtower, Desert
  Cistern, Bog Hut and Frostwatch Camp above ground; Buried Cache, Miner's
  Rest and Crystal Hollow below it; Ember Shrine and Cinder Vault in the
  Ember Expanse. Each has its own loot table, rolled the first time you open
  its Storage Crate.
- **Save/load**: worlds persist as a diff from their deterministic seed
  (block edits, block-entity state, player/inventory data) across both
  dimensions, so save files stay small regardless of how much of the
  infinite world has been explored.

## How to finish the game

MineBlock has a defined end: defeating **The Cinder Warden** in the Ember
Expanse. The intended route, in order:

1. **Wood** — punch a tree, make Planks → Sticks → a Workbench, then a full
   set of Wood tools.
2. **Stone** — mine Stone with the wood pickaxe for Cobbled Stone; build a
   Smelter (8 Cobbled Stone) and Torches (Char Lump + Stick).
3. **Ruddle** (wood pickaxe) → smelt Ruddle Chunks into ingots. First armor
   tier, and the pickaxe that unlocks the next step.
4. **Ferrite** and **Glint** (ruddle pickaxe). Glint Ingots feed the
   Runeforge and the portal.
5. **Aurum** and **Glimmerstone** (ferrite pickaxe). Glimmer Shards are
   MineBlock's top gem — the "diamond" of this game — found below y≈20.
   Glimmer gear is the strongest craftable set before the Ember Expanse.
6. **Voidshard** (glimmer pickaxe), below y≈12 — the final tier.
7. Build a **Runeforge** and apply Infusions to your gear (Rune Shards +
   Infusion Dust cost XP levels).
8. Craft a **Riftstone** (4 Voidshard + 4 Glimmer Shards + 2 Glint Ingots),
   place it, right-click to open the portal to the **Ember Expanse**.
9. Survive the Expanse and defeat **The Cinder Warden** (220 HP). It drops
   the **Warden Core**, and the game shows its ending — after which the world
   stays open to keep building in.

`tests/progression.test.js` walks this whole chain against the real block,
item and recipe tables, so a tier gate or recipe change that makes any step
unreachable fails the test suite rather than stranding a player mid-game.

### Equipment

Armor comes in five tiers (Ruddle, Ferrite, Aurum, Glimmer, Voidshard), each
with helmet / chest / legs / boots, plus an amulet slot (Warding or Vigor
Amulet) and an offhand slot. Tools and weapons cover the same tiers across
pickaxe, axe, shovel, sword and hoe.

## Running it

```bash
npm install
npm run dev        # Vite dev server + Electron, with hot reload
```

To build a distributable desktop app:

```bash
npm run build       # electron-builder output lands in release/
```

`npm start` builds the renderer once and launches Electron against the
static build (useful for a quick production-mode smoke test without
packaging an installer).

## Controls

| Action | Key |
| --- | --- |
| Move | `W` `A` `S` `D` |
| Jump | `Space` |
| Sprint | `Shift` |
| Crouch | `Ctrl` |
| Break block | Hold Left Click |
| Place block / interact | Right Click |
| Inventory | `E` |
| Hotbar select | `1`–`9` or scroll |
| Pause | `Esc` |

All keybinds, render distance, FOV, mouse sensitivity and audio levels are
configurable from Settings (available from both the main menu and the
in-game pause menu).

## Project layout

```
electron/          Electron main process + preload (window, save-file IPC)
src/
  core/             Game orchestrator, settings, save manager, input, events
  blocks/           Block registry + every block definition
  items/            Item registry, crafting/smelting recipes, inventory
  world/            Noise, chunks, mesher, terrain/biome/cave generation,
                     day-night cycle, weather
  dimensions/       Overworld / Ember Expanse dimension configs
  entities/         Entity/Player/Mob base classes, creature roster, spawner
  player/           First-person controller, block interaction, survival
  magic/            The Infusion (enchantment-like) system
  render/           Procedural texture atlas, item icons, mob models, sky
  ui/               Main menu, HUD, inventory/crafting/smelter/runeforge
                     screens, settings, pause/death/loading screens
```

Every system file carries a short header comment explaining its role;
start at `src/core/Game.js` to see how they're wired together.
