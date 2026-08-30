// MineBlock entry point: loads settings, wires the InputManager to the
// canvas, and shows the main menu. The menu hands off to a fresh Game
// instance once the player chooses to create or load a world.
import { settings } from './core/Settings.js';
import { InputManager } from './core/InputManager.js';
import { MainMenu } from './ui/MainMenu.js';
import { Game } from './core/Game.js';
import { BlockRegistry } from './blocks/BlockRegistry.js';
import { ItemRegistry } from './items/ItemRegistry.js';

async function main() {
  await settings.load();

  const canvas = document.getElementById('game-canvas');
  const uiRoot = document.getElementById('ui-root');
  const input = new InputManager(canvas);

  let game = null;

  const menu = new MainMenu(uiRoot, {
    onPlay: async (choice) => {
      menu.destroy();
      if (settings.get('fullscreen')) document.documentElement.requestFullscreen?.().catch(() => {});
      game = new Game(canvas, uiRoot, input);
      await game.start(choice);
    }
  });

  // Debug handle: the in-game overlays (P/L/O) cover the common cases, but
  // exposing the live game and the registries makes it possible to inspect
  // world state from the console or an automated check.
  window.__mineblock = {
    get game() { return game; },
    blocks: BlockRegistry,
    items: ItemRegistry
  };
}

main();
