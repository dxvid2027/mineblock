# MineBlock

MineBlock is a complete, original single-player voxel sandbox survival game.
It runs as a desktop app (Windows, macOS, Linux) via
[Electron](https://www.electronjs.org/), and as a website playable by touch on
an iPad — the same build, deployed to Cloudflare. It is rendered with
[three.js](https://threejs.org/). Every block, item, creature, dimension,
texture and system in this project is original content — no assets, names, or
code were copied from any existing game.

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

```bash
npm run build          # the web build -> dist/   (also aliased as build:web)
npm run preview:web    # serve dist/ at http://localhost:4173
npm test               # data-integrity and progression checks
```

`npm run build` is deliberately the *web* build: hosting platforms auto-detect
and run that script, and packaging a desktop installer there both fails and
makes no sense. Desktop packaging is explicit:

```bash
npm run build:desktop  # electron-builder output lands in release/
```

`npm start` builds once and launches Electron against the static build, for a
quick production-mode check without packaging an installer.

## Playing on an iPad (or any tablet/phone)

The web build is fully playable by touch. iOS Safari implements no Pointer
Lock API, so touch devices get their own control scheme rather than the
desktop one:

- **Left stick** — analog movement; push it all the way to sprint.
- **Drag anywhere else** — look around.
- **⛏ / ▣** — break (hold) and place.
- **⤒ / ⤓** — jump and crouch.
- **🎒 / ☰** — inventory and pause.
- Tap a hotbar slot to select it.

Touch hardware also gets a shorter default render distance and a capped pixel
ratio, since an iPad reports a 2× display and rendering the whole voxel scene
at 2× roughly halves the frame rate.

**Add it to the Home Screen** (Share → Add to Home Screen) to get the app
icon, a fullscreen window with no browser chrome, and offline play: a service
worker pre-caches the whole bundle at install, so after the first visit the
game runs with no network at all. Worlds are saved in the browser, on device.

## Publishing to Cloudflare

The game is completely static — terrain is generated from a seed in the
browser and saves live in local storage — so nothing runs server-side.
`wrangler.jsonc` deploys it as a **Worker serving static assets**: there is no
Worker script, just `assets.directory` pointing at `dist/`. That matches what
Cloudflare's dashboard creates today, which is a Worker rather than a Pages
project.

> **`name` in `wrangler.jsonc` must match your Worker's name**, otherwise the
> deploy targets or creates a different one.

**Option A — connect the repository** (auto-deploys on every push):
in the Cloudflare dashboard, *Workers & Pages → Create → Import a repository*,
pick this repo and set

| Setting | Value |
| --- | --- |
| Build command | `npm run build` |
| Deploy command | `npx wrangler deploy` |

**Option B — deploy from your machine:**

```bash
npx wrangler login
npm run deploy          # builds, then deploys dist/
```

**Option C — GitHub Actions:** `.github/workflows/deploy.yml` builds, runs the
tests and deploys on every push. Add two repository secrets and it takes over:
`CLOUDFLARE_API_TOKEN` (a token with *Workers Scripts: Edit*) and
`CLOUDFLARE_ACCOUNT_ID`.

Validate the deploy configuration without deploying anything:

```bash
npm run build && npx wrangler deploy --dry-run
```

Using **Cloudflare Pages** instead? Pages ignores `wrangler.jsonc` and needs a
`wrangler.toml` with `pages_build_output_dir = "dist"` (whose `name` must
likewise match the Pages project), or just the dashboard's build settings with
output directory `dist`.

`.node-version` pins Node 22 (Cloudflare's default is older than Vite 5
supports), and `src/public/_headers` sets long-lived caching for the
fingerprinted assets while keeping `index.html` and `sw.js` uncached, so a
deploy reaches players immediately.



### If the Cloudflare build fails

**Failure during "Installing dependencies".** Cloudflare runs `npm ci`, which
refuses to run when `package.json` and `package-lock.json` disagree. Any time
a dependency changes, commit the regenerated lockfile alongside it:

```bash
npm install            # or: npm install --package-lock-only
git add package.json package-lock.json
```

Reproduce a Pages build locally before pushing — this is exactly what
Cloudflare runs, and run it from a fresh `git clone` rather than your working
copy, so untracked files cannot mask a missing commit:

```bash
npm ci && npm run build
```

**Failure during "Building".** Check which command Pages is running. It
auto-detects `npm run build`, which builds the website; `npm run build:desktop`
would try to package an Electron installer and cannot work on a web host.

**Failure during "Deploying", with `Missing entry-point to Worker script or to
assets directory`.** The deploy step ran `wrangler deploy` without knowing what
to serve — either `wrangler.jsonc` is missing, or its `assets.directory` does
not point at the build output. Reproduce it locally with
`npx wrangler deploy --dry-run`, which validates the configuration and reports
how many files it found without deploying.

The build output is well inside every limit (13 files, largest ~620 KB), so a
failure here is configuration rather than content.

**Slow installs.** `electron` and `electron-builder` are development
dependencies for the desktop app, and Electron's postinstall downloads a
~266 MB binary the web build never uses. Adding the environment variable
`ELECTRON_SKIP_BINARY_DOWNLOAD` = `1` in the Pages project settings roughly
halves install time. (It has to be a real environment variable: putting it in
`.npmrc` does not work, because npm exposes those settings as `npm_config_*`
and Electron reads the plain name.) The GitHub Actions workflow already sets
it.

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
| Chunk borders | `P` |
| Mob hitboxes | `L` |
| Debug info (coordinates, biome, light) | `O` |

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
                     screens, settings, pause/death/victory/loading screens,
                     on-screen touch controls
  public/           Static web assets: icons, PWA manifest, service worker,
                     Cloudflare asset headers
tools/              Icon generation and the service-worker build stamp
tests/              Node test suite (progression, structures, world data,
                     chunk mesher)
```

Every system file carries a short header comment explaining its role;
start at `src/core/Game.js` to see how they're wired together.
