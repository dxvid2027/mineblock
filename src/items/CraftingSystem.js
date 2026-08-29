// Matches the player's 3x3 crafting grid against RECIPES and performs the
// craft (consuming grid contents, granting the result). Shaped recipes are
// matched against the grid trimmed to its occupied bounding box, tried both
// as-is and horizontally mirrored so left/right-handed tool shapes both work.
import { RECIPES, matchesIngredient } from './CraftingRecipes.js';
import { ItemRegistry } from './ItemRegistry.js';

function gridToRows(grid) {
  // grid is a flat 9-length array (row-major 3x3) of {id,count}|null
  const rows = [[grid[0], grid[1], grid[2]], [grid[3], grid[4], grid[5]], [grid[6], grid[7], grid[8]]];
  let top = 0, bottom = 2, left = 0, right = 2;
  const rowEmpty = (r) => rows[r].every((c) => !c);
  const colEmpty = (c) => rows.every((r) => !r[c]);
  while (top <= bottom && rowEmpty(top)) top++;
  while (bottom >= top && rowEmpty(bottom)) bottom--;
  while (left <= right && colEmpty(left)) left++;
  while (right >= left && colEmpty(right)) right--;
  if (top > bottom) return null; // grid entirely empty
  const trimmed = [];
  for (let r = top; r <= bottom; r++) {
    trimmed.push(rows[r].slice(left, right + 1));
  }
  return trimmed;
}

function patternToRows(pattern, key) {
  return pattern.map((row) => [...row].map((ch) => (ch === ' ' ? null : key[ch])));
}

function rowsEqual(a, b, mirror) {
  if (a.length !== b.length) return false;
  for (let r = 0; r < a.length; r++) {
    const rowA = a[r];
    const rowB = mirror ? [...b[r]].reverse() : b[r];
    if (rowA.length !== rowB.length) return false;
    for (let c = 0; c < rowA.length; c++) {
      const cell = rowA[c];
      const ingredient = rowB[c];
      if (!cell && !ingredient) continue;
      if (!cell || !ingredient) return false;
      if (!matchesIngredient(cell.id, ingredient)) return false;
    }
  }
  return true;
}

/** Returns { recipe, mirrored } for the first matching recipe, or null. */
export function matchRecipe(grid) {
  const trimmedGrid = gridToRows(grid);
  if (!trimmedGrid) return null;

  for (const recipe of RECIPES) {
    if (recipe.type === 'shaped') {
      const patternRows = patternToRows(recipe.pattern, recipe.key);
      // Trim the pattern's own bounding box too, so authoring stays simple.
      let top = 0, bottom = patternRows.length - 1, left = 0, right = patternRows[0].length - 1;
      const rEmpty = (r) => patternRows[r].every((c) => !c);
      const cEmpty = (c) => patternRows.every((r) => !r[c]);
      while (top <= bottom && rEmpty(top)) top++;
      while (bottom >= top && rEmpty(bottom)) bottom--;
      while (left <= right && cEmpty(left)) left++;
      while (right >= left && cEmpty(right)) right--;
      const trimmedPattern = [];
      for (let r = top; r <= bottom; r++) trimmedPattern.push(patternRows[r].slice(left, right + 1));

      if (rowsEqual(trimmedGrid, trimmedPattern, false)) return { recipe, mirrored: false };
      if (rowsEqual(trimmedGrid, trimmedPattern, true)) return { recipe, mirrored: true };
    } else {
      // Shapeless: every occupied grid cell must be consumed by exactly the ingredient list.
      const cells = trimmedGrid.flat().filter(Boolean);
      const need = recipe.ingredients.map((ing) => ({ ...ing, remaining: ing.count ?? 1 }));
      const used = new Array(cells.length).fill(false);
      let ok = true;
      for (const ing of need) {
        let toMatch = ing.remaining;
        for (let i = 0; i < cells.length && toMatch > 0; i++) {
          if (used[i]) continue;
          if (matchesIngredient(cells[i].id, ing)) { used[i] = true; toMatch--; }
        }
        if (toMatch > 0) { ok = false; break; }
      }
      if (ok && used.every(Boolean)) return { recipe, mirrored: false };
    }
  }
  return null;
}

/** Consumes one craft's worth of ingredients from the grid (flat 9 array, mutated in place). */
export function consumeGridForCraft(grid, recipe) {
  if (recipe.type === 'shapeless') {
    const need = recipe.ingredients.map((ing) => ({ ...ing, remaining: ing.count ?? 1 }));
    for (const ing of need) {
      let toConsume = ing.remaining;
      for (let i = 0; i < grid.length && toConsume > 0; i++) {
        const cell = grid[i];
        if (cell && matchesIngredient(cell.id, ing)) {
          cell.count -= 1;
          if (cell.count <= 0) grid[i] = null;
          toConsume--;
        }
      }
    }
  } else {
    for (let i = 0; i < grid.length; i++) {
      if (grid[i]) {
        grid[i].count -= 1;
        if (grid[i].count <= 0) grid[i] = null;
      }
    }
  }
}

export function resultItem(recipe) {
  return ItemRegistry.get(recipe.result.id);
}
