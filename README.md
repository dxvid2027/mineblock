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
- **Save/load**: worlds persist as a diff from their deterministic seed
  (block edits, block-entity state, player/inventory data) across both
  dimensions, so save files stay small regardless of how much of the
  infinite world has been explored.

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
