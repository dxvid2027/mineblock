// MineBlock entry point: loads settings, wires the InputManager to the
// canvas, and shows the main menu. The menu hands off to a fresh Game
// instance once the player chooses to create or load a world.
import { settings } from './core/Settings.js';
import { InputManager } from './core/InputManager.js';
import { MainMenu } from './ui/MainMenu.js';
import { Game } from './core/Game.js';

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

  window.__mineblock = { get game() { return game; } };
}

main();
