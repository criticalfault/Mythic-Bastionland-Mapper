// Eagerly import all tile images so Vite bundles and hashes them correctly
const regularGlob = import.meta.glob('./assets/regular_tiles/*.jpg', { eager: true });
const specialGlob = import.meta.glob('./assets/special_tiles/*.jpg', { eager: true });

export const regularTileUrls = {};
for (const [path, mod] of Object.entries(regularGlob)) {
  const name = path.split('/').pop().replace(/\.jpg$/i, '').toLowerCase();
  regularTileUrls[name] = mod.default;
}

export const specialTileUrls = {};
for (const [path, mod] of Object.entries(specialGlob)) {
  const name = path.split('/').pop().replace(/\.jpg$/i, '').toLowerCase();
  specialTileUrls[name] = mod.default;
}

export const REGULAR_TILE_NAMES = Object.keys(regularTileUrls).sort();
export const SPECIAL_TILE_NAMES = Object.keys(specialTileUrls).sort();
