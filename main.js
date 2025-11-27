'use strict';

// Core constants
const WORLD_WIDTH = 64;
const WORLD_DEPTH = 64;
const WORLD_HEIGHT = 24;
const CHUNK_SIZE = 16;
const SEA_LEVEL = 10;
const TILE_WIDTH = 72;
const TILE_HEIGHT = 36;
const BLOCK_HEIGHT = 26;
const TICK_RATE = 1 / 60;
const DAY_LENGTH_SECONDS = 120;

// Player tuning
const MOVE_SPEED = 7.5;
const AIR_CONTROL = 0.35;
const JUMP_FORCE = 9;
const GRAVITY = 24;
const PLAYER_RADIUS = 0.35;
const PLAYER_HEIGHT = 1.8;
const PLAYER_EYE = 1.62;

// Block enums and metadata
const BLOCK = {
  AIR: 0,
  GRASS: 1,
  DIRT: 2,
  STONE: 3,
  WATER: 4,
  SAND: 5,
  WOOD: 6,
  LEAF: 7,
  PLANK: 8,
  GLASS: 9,
  TORCH: 10,
  ORE: 11
};

const BLOCK_INFO = {
  [BLOCK.AIR]: { name: 'Air', solid: false, transparent: true },
  [BLOCK.GRASS]: { name: 'Grass', top: 0x9bd75c, side: 0x6ba942, solid: true },
  [BLOCK.DIRT]: { name: 'Dirt', top: 0x9b7b4a, side: 0x7c5e35, solid: true },
  [BLOCK.STONE]: { name: 'Stone', top: 0x9aa3ad, side: 0x6f7882, solid: true },
  [BLOCK.WATER]: { name: 'Water', top: 0x2c86d3, side: 0x2367a8, solid: false, transparent: true },
  [BLOCK.SAND]: { name: 'Sand', top: 0xe6d3a5, side: 0xcab07d, solid: true },
  [BLOCK.WOOD]: { name: 'Log', top: 0xb08a5c, side: 0x8c5f2e, solid: true },
  [BLOCK.LEAF]: { name: 'Leaves', top: 0x3d7d41, side: 0x2f6233, solid: false, transparent: true },
  [BLOCK.PLANK]: { name: 'Plank', top: 0xc79c62, side: 0xa57942, solid: true },
  [BLOCK.GLASS]: { name: 'Glass', top: 0xb7e2ff, side: 0x8dbcd8, solid: false, transparent: true },
  [BLOCK.TORCH]: { name: 'Torch', top: 0xfff2a1, side: 0xd6b759, solid: false, transparent: true, glow: true },
  [BLOCK.ORE]: { name: 'Ore', top: 0xd9d9d9, side: 0xb0b0b0, solid: true, accent: 0x6cd0ff }
};

const HOTBAR_SLOTS = [
  BLOCK.GRASS,
  BLOCK.DIRT,
  BLOCK.STONE,
  BLOCK.SAND,
  BLOCK.WOOD,
  BLOCK.PLANK,
  BLOCK.GLASS,
  BLOCK.TORCH
];

const uiNodes = {
  hotbar: document.getElementById('hotbar'),
  debug: document.getElementById('debug')
};

// Utility helpers
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const lerp = (a, b, t) => a + (b - a) * t;
const fade = t => t * t * (3 - 2 * t);

class RNG {
  constructor(seed) {
    this.seed = seed >>> 0;
  }
  next() {
    // Mulberry32
    let t = (this.seed += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }
}

const hash3 = (x, y, z, seed) => {
  let h = x * 374761393 + y * 668265263 ^ z * 982451653 ^ seed * 2654435761;
  h = (h ^ (h >> 13)) * 1274126177;
  return ((h ^ (h >> 16)) >>> 0) / 4294967295;
};

const noise2d = (x, z, seed) => {
  const x0 = Math.floor(x);
  const z0 = Math.floor(z);
  const xf = x - x0;
  const zf = z - z0;
  const tl = hash3(x0, 0, z0, seed);
  const tr = hash3(x0 + 1, 0, z0, seed);
  const bl = hash3(x0, 0, z0 + 1, seed);
  const br = hash3(x0 + 1, 0, z0 + 1, seed);
  const u = fade(xf);
  const v = fade(zf);
  return lerp(lerp(tl, tr, u), lerp(bl, br, u), v);
};

const noise3d = (x, y, z, seed) => {
  const x0 = Math.floor(x), y0i = Math.floor(y), z0 = Math.floor(z);
  const xf = x - x0, yf = y - y0i, zf = z - z0;
  const c000 = hash3(x0, y0i, z0, seed);
  const c100 = hash3(x0 + 1, y0i, z0, seed);
  const c010 = hash3(x0, y0i + 1, z0, seed);
  const c110 = hash3(x0 + 1, y0i + 1, z0, seed);
  const c001 = hash3(x0, y0i, z0 + 1, seed);
  const c101 = hash3(x0 + 1, y0i, z0 + 1, seed);
  const c011 = hash3(x0, y0i + 1, z0 + 1, seed);
  const c111 = hash3(x0 + 1, y0i + 1, z0 + 1, seed);
  const u = fade(xf), v = fade(yf), w = fade(zf);
  const x00 = lerp(c000, c100, u);
  const x10 = lerp(c010, c110, u);
  const x01 = lerp(c001, c101, u);
  const x11 = lerp(c011, c111, u);
  const y0 = lerp(x00, x10, v);
  const y1 = lerp(x01, x11, v);
  return lerp(y0, y1, w);
};

const fbm2d = (x, z, seed, octaves = 4, falloff = 0.5, lacunarity = 2) => {
  let amp = 0.5;
  let freq = 1;
  let sum = 0;
  for (let i = 0; i < octaves; i++) {
    sum += noise2d(x * freq, z * freq, seed + i * 19) * amp;
    amp *= falloff;
    freq *= lacunarity;
  }
  return sum;
};

const fbm3d = (x, y, z, seed, octaves = 3, falloff = 0.5, lacunarity = 2) => {
  let amp = 0.5;
  let freq = 1;
  let sum = 0;
  for (let i = 0; i < octaves; i++) {
    sum += noise3d(x * freq, y * freq, z * freq, seed + i * 11) * amp;
    amp *= falloff;
    freq *= lacunarity;
  }
  return sum;
};

class VoxelWorld {
  constructor(width, height, depth, chunkSize) {
    this.w = width;
    this.h = height;
    this.d = depth;
    this.chunkSize = chunkSize;
    this.data = new Uint8Array(width * height * depth);
    this.dirtyChunks = new Set();
  }

  index(x, y, z) {
    return y * this.w * this.d + z * this.w + x;
  }

  inBounds(x, y, z) {
    return x >= 0 && x < this.w && y >= 0 && y < this.h && z >= 0 && z < this.d;
  }

  get(x, y, z) {
    if (!this.inBounds(x, y, z)) return BLOCK.AIR;
    return this.data[this.index(x, y, z)];
  }

  set(x, y, z, id) {
    if (!this.inBounds(x, y, z)) return;
    this.data[this.index(x, y, z)] = id;
    this.markChunk(x, z);
  }

  markChunk(x, z) {
    const cx = Math.floor(x / this.chunkSize);
    const cz = Math.floor(z / this.chunkSize);
    this.dirtyChunks.add(`${cx},${cz}`);
  }
}

class TerrainGenerator {
  constructor(world) {
    this.world = world;
  }

  generate(seed) {
    const rng = new RNG(seed);
    const biomeSeed = Math.floor(rng.next() * 1e6);
    const caveSeed = Math.floor(rng.next() * 1e6);
    const oreSeed = Math.floor(rng.next() * 1e6);

    for (let x = 0; x < this.world.w; x++) {
      for (let z = 0; z < this.world.d; z++) {
        const heightNoise = fbm2d(x * 0.06, z * 0.06, biomeSeed, 5, 0.5, 2);
        const hill = fbm2d((x + 50) * 0.15, (z + 50) * 0.15, biomeSeed + 99, 3, 0.5, 2.2);
        const surfaceHeight = Math.min(Math.floor(SEA_LEVEL + 4 + heightNoise * 8 + hill * 4), this.world.h - 2);
        const moisture = fbm2d(x * 0.08 + 200, z * 0.08 - 120, biomeSeed + 777, 4);
        const isShore = surfaceHeight <= SEA_LEVEL + 1 && moisture > 0.35;

        for (let y = 0; y < this.world.h; y++) {
          let block = BLOCK.AIR;
          const depthFromTop = surfaceHeight - y;
          if (y === 0) {
            block = BLOCK.STONE; // bedrock stand-in
          } else if (y <= surfaceHeight) {
            if (y < surfaceHeight - 3) block = BLOCK.STONE;
            else if (y < surfaceHeight - 1) block = BLOCK.DIRT;
            else block = isShore ? BLOCK.SAND : BLOCK.GRASS;
          }

          const cave = fbm3d((x + 20) * 0.1, (y + 60) * 0.1, (z - 20) * 0.1, caveSeed, 4, 0.5, 2);
          if (y > 3 && y < surfaceHeight - 1 && cave > 0.63) {
            block = BLOCK.AIR;
          }

          // Ore speckles
          if (block === BLOCK.STONE) {
            const oreNoise = noise3d(x * 0.4, y * 0.4, z * 0.4, oreSeed);
            if (oreNoise > 0.77 && y < surfaceHeight - 3 && y > 3) {
              block = BLOCK.ORE;
            }
          }

          this.world.set(x, y, z, block);
        }

        // Fill oceans
        for (let y = surfaceHeight + 1; y <= SEA_LEVEL && y < this.world.h; y++) {
          this.world.set(x, y, z, BLOCK.WATER);
        }

        // Trees
        if (surfaceHeight > SEA_LEVEL && this.world.get(x, surfaceHeight, z) === BLOCK.GRASS) {
          const treeChance = noise2d(x * 0.35, z * 0.35, biomeSeed + 444);
          if (treeChance > 0.72) {
            this.placeTree(x, surfaceHeight + 1, z, rng);
          }
        }
      }
    }
  }

  placeTree(x, y, z, rng) {
    const height = 3 + Math.floor(rng.next() * 3);
    for (let i = 0; i < height; i++) {
      if (y + i < this.world.h) this.world.set(x, y + i, z, BLOCK.WOOD);
    }
    const leafRadius = 2;
    const top = y + height;
    for (let dx = -leafRadius; dx <= leafRadius; dx++) {
      for (let dz = -leafRadius; dz <= leafRadius; dz++) {
        for (let dy = -1; dy <= 2; dy++) {
          if (Math.abs(dx) + Math.abs(dz) + Math.abs(dy) <= leafRadius + 1) {
            const lx = x + dx, ly = top + dy, lz = z + dz;
            if (ly < this.world.h && this.world.get(lx, ly, lz) === BLOCK.AIR) {
              this.world.set(lx, ly, lz, BLOCK.LEAF);
            }
          }
        }
      }
    }
  }
}

// Isometric math helpers
const isoProject = (x, y, z) => ({
  x: (x - z) * (TILE_WIDTH / 2),
  y: (x + z) * (TILE_HEIGHT / 2) - y * BLOCK_HEIGHT
});

// Rendering
class WorldRenderer {
  constructor(app, world) {
    this.app = app;
    this.world = world;
    this.container = new PIXI.Container();
    this.container.sortableChildren = true;
    this.chunkContainers = new Map();
    this.chunkGlows = new Map();
    this.textures = this.createBlockTextures();
    this.selector = this.buildSelector();
    this.container.addChild(this.selector);
    this.ambientOverlay = new PIXI.Graphics();
    this.ambientOverlay.eventMode = 'none';
    this.container.addChild(this.ambientOverlay);
    this.glowLayer = new PIXI.Container();
    this.glowLayer.sortableChildren = true;
    this.container.addChild(this.glowLayer);
    this.app.stage.addChild(this.container);
  }

  createBlockTextures() {
    const textures = {};
    const renderer = this.app.renderer;
    const types = Object.keys(BLOCK_INFO).map(Number);

    for (const id of types) {
      if (id === BLOCK.AIR) continue;
      const info = BLOCK_INFO[id];
      const g = new PIXI.Graphics();
      const w = TILE_WIDTH;
      const h = TILE_HEIGHT + BLOCK_HEIGHT;
      const topColor = info.top ?? info.side ?? 0xffffff;
      const sideColor = info.side ?? info.top ?? 0xffffff;
      const darker = (c, f) => {
        const r = ((c >> 16) & 255) * f;
        const gCh = ((c >> 8) & 255) * f;
        const b = (c & 255) * f;
        return (r << 16) | (gCh << 8) | b;
      };
      const rightColor = darker(sideColor, 0.9);
      const leftColor = darker(sideColor, 0.8);

      g.lineStyle(1, 0x000000, 0.12);

      // Left face
      g.beginFill(leftColor);
      g.moveTo(w / 2, h);
      g.lineTo(0, h - h / 2);
      g.lineTo(0, h - h / 2 - BLOCK_HEIGHT);
      g.lineTo(w / 2, h - BLOCK_HEIGHT * 2);
      g.endFill();

      // Right face
      g.beginFill(rightColor);
      g.moveTo(w / 2, h);
      g.lineTo(w, h - h / 2);
      g.lineTo(w, h - h / 2 - BLOCK_HEIGHT);
      g.lineTo(w / 2, h - BLOCK_HEIGHT * 2);
      g.endFill();

      // Top
      g.beginFill(topColor);
      g.moveTo(w / 2, h - BLOCK_HEIGHT * 2);
      g.lineTo(0, h - h / 2 - BLOCK_HEIGHT);
      g.lineTo(w / 2, h - TILE_HEIGHT - BLOCK_HEIGHT);
      g.lineTo(w, h - h / 2 - BLOCK_HEIGHT);
      g.endFill();

      // Accent (for ore)
      if (info.accent) {
        g.beginFill(info.accent);
        g.drawCircle(w / 2, h - BLOCK_HEIGHT * 1.4, 4);
        g.drawCircle(w / 2 - 10, h - BLOCK_HEIGHT * 1.1, 3);
        g.drawCircle(w / 2 + 12, h - BLOCK_HEIGHT * 1.2, 2);
        g.endFill();
      }

      const texture = renderer.generateTexture(g, { resolution: devicePixelRatio });
      textures[id] = texture;
    }
    return textures;
  }

  buildSelector() {
    const g = new PIXI.Graphics();
    g.lineStyle(2, 0xffff66, 0.9);
    g.visible = false;
    g.zIndex = 99999;
    g.eventMode = 'none';
    return g;
  }

  rebuildAll() {
    for (let cx = 0; cx < Math.ceil(this.world.w / this.world.chunkSize); cx++) {
      for (let cz = 0; cz < Math.ceil(this.world.d / this.world.chunkSize); cz++) {
        this.buildChunk(cx, cz);
      }
    }
    this.world.dirtyChunks.clear();
  }

  rebuildDirty() {
    if (this.world.dirtyChunks.size === 0) return;
    const keys = Array.from(this.world.dirtyChunks);
    this.world.dirtyChunks.clear();
    for (const key of keys) {
      const [cx, cz] = key.split(',').map(Number);
      this.buildChunk(cx, cz);
    }
  }

  buildChunk(cx, cz) {
    const key = `${cx},${cz}`;
    const existing = this.chunkContainers.get(key);
    if (existing) {
      existing.destroy({ children: true });
      this.chunkContainers.delete(key);
    }
    const oldGlows = this.chunkGlows.get(key);
    if (oldGlows) {
      oldGlows.forEach(g => g.destroy());
      this.chunkGlows.delete(key);
    }

    const cont = new PIXI.Container();
    cont.sortableChildren = true;
    this.chunkContainers.set(key, cont);
    this.container.addChild(cont);

    const startX = cx * this.world.chunkSize;
    const startZ = cz * this.world.chunkSize;
    const endX = Math.min(startX + this.world.chunkSize, this.world.w);
    const endZ = Math.min(startZ + this.world.chunkSize, this.world.d);

    const glowList = [];
    for (let y = 0; y < this.world.h; y++) {
      for (let z = startZ; z < endZ; z++) {
        for (let x = startX; x < endX; x++) {
          const id = this.world.get(x, y, z);
          if (id === BLOCK.AIR) continue;
          const texture = this.textures[id];
          if (!texture) continue;
          const sprite = new PIXI.Sprite(texture);
          sprite.anchor.set(0.5, 1);
          const p = isoProject(x + 0.5, y, z + 0.5);
          sprite.x = p.x;
          sprite.y = p.y;
          sprite.zIndex = (x + z) * 20 + y;
          sprite.alpha = BLOCK_INFO[id].transparent ? 0.9 : 1;
          cont.addChild(sprite);

          if (BLOCK_INFO[id].glow) {
            const glow = new PIXI.Graphics();
            glow.beginFill(0xffd966, 0.55);
            glow.drawCircle(0, -BLOCK_HEIGHT * 1.2, 18);
            glow.endFill();
            glow.blendMode = 'add';
            glow.x = p.x;
            glow.y = p.y;
            glow.zIndex = sprite.zIndex + 1;
            glow.eventMode = 'none';
            glowList.push(glow);
          }
        }
      }
    }
    for (const glow of glowList) {
      this.glowLayer.addChild(glow);
    }
    this.chunkGlows.set(key, glowList);
    this.glowLayer.sortChildren();
    this.container.sortChildren();
  }

  updateCamera(player) {
    const playerIso = isoProject(player.pos.x, player.pos.y, player.pos.z);
    this.container.x = this.app.renderer.width / 2 - playerIso.x;
    this.container.y = this.app.renderer.height * 0.58 - playerIso.y;
  }

  updateSelector(target) {
    if (!target) {
      this.selector.visible = false;
      return;
    }
    const { x, y, z } = target;
    const g = this.selector;
    g.clear();
    g.lineStyle(2, 0xffff66, 0.9);

    const p000 = isoProject(x, y, z);
    const p100 = isoProject(x + 1, y, z);
    const p010 = isoProject(x, y, z + 1);
    const p110 = isoProject(x + 1, y, z + 1);
    const p001 = isoProject(x, y + 1, z);
    const p101 = isoProject(x + 1, y + 1, z);
    const p011 = isoProject(x, y + 1, z + 1);
    const p111 = isoProject(x + 1, y + 1, z + 1);

    // Top loop
    g.moveTo(p001.x, p001.y);
    g.lineTo(p101.x, p101.y);
    g.lineTo(p111.x, p111.y);
    g.lineTo(p011.x, p011.y);
    g.lineTo(p001.x, p001.y);

    // Vertical edges
    g.moveTo(p001.x, p001.y);
    g.lineTo(p000.x, p000.y);
    g.moveTo(p101.x, p101.y);
    g.lineTo(p100.x, p100.y);
    g.moveTo(p111.x, p111.y);
    g.lineTo(p110.x, p110.y);
    g.moveTo(p011.x, p011.y);
    g.lineTo(p010.x, p010.y);

    this.selector.visible = true;
  }

  updateAmbient(dayPercent) {
    const night = 0x0b1020;
    const day = 0x7cc4ff;
    const dusk = 0x28446f;
    const cycle = Math.sin(dayPercent * Math.PI * 2) * 0.5 + 0.5;
    const skyColor = dayPercent < 0.2 || dayPercent > 0.8
      ? dusk
      : lerpColor(night, day, cycle);
    this.app.renderer.background.color = skyColor;
    const dim = dayPercent < 0.2 || dayPercent > 0.8 ? 0.55 : 0.15 + (1 - cycle) * 0.35;
    this.ambientOverlay.clear();
    this.ambientOverlay.beginFill(0x000000, dim);
    this.ambientOverlay.drawRect(-2000, -2000, 4000, 4000);
    this.ambientOverlay.endFill();
    this.ambientOverlay.zIndex = 80000;
  }
}

const lerpColor = (a, b, t) => {
  const ar = (a >> 16) & 255, ag = (a >> 8) & 255, ab = a & 255;
  const br = (b >> 16) & 255, bg = (b >> 8) & 255, bb = b & 255;
  const r = Math.round(lerp(ar, br, t));
  const g = Math.round(lerp(ag, bg, t));
  const bl = Math.round(lerp(ab, bb, t));
  return (r << 16) | (g << 8) | bl;
};

// Player logic
class Player {
  constructor(world) {
    this.world = world;
    this.pos = { x: WORLD_WIDTH / 2, y: SEA_LEVEL + 4, z: WORLD_DEPTH / 2 };
    this.vel = { x: 0, y: 0, z: 0 };
    this.yaw = Math.PI * 0.25;
    this.pitch = -0.25;
    this.onGround = false;
    this.inventory = new Map();
    HOTBAR_SLOTS.forEach(id => this.inventory.set(id, 64));
    this.hotbarIndex = 0;
  }

  get dirVec() {
    return {
      x: Math.cos(this.yaw) * Math.cos(this.pitch),
      y: Math.sin(this.pitch),
      z: Math.sin(this.yaw) * Math.cos(this.pitch)
    };
  }
}

class Input {
  constructor() {
    this.keys = new Set();
    this.mouseButtons = new Set();
    window.addEventListener('keydown', e => this.keys.add(e.code));
    window.addEventListener('keyup', e => this.keys.delete(e.code));
    window.addEventListener('mousedown', e => this.mouseButtons.add(e.button));
    window.addEventListener('mouseup', e => this.mouseButtons.delete(e.button));
    window.addEventListener('contextmenu', e => e.preventDefault());
  }
}

// Physics helpers
const isSolid = id => {
  const info = BLOCK_INFO[id];
  return info ? info.solid !== false : true;
};

const canStandIn = id => {
  const info = BLOCK_INFO[id];
  if (!info) return false;
  return info.solid === false || info.transparent === true;
};

const bboxCollides = (world, pos) => {
  const minX = Math.floor(pos.x - PLAYER_RADIUS);
  const maxX = Math.floor(pos.x + PLAYER_RADIUS);
  const minY = Math.floor(pos.y);
  const maxY = Math.floor(pos.y + PLAYER_HEIGHT);
  const minZ = Math.floor(pos.z - PLAYER_RADIUS);
  const maxZ = Math.floor(pos.z + PLAYER_RADIUS);
  for (let x = minX; x <= maxX; x++) {
    for (let y = minY; y <= maxY; y++) {
      for (let z = minZ; z <= maxZ; z++) {
        const id = world.get(x, y, z);
        if (isSolid(id) && id !== BLOCK.WATER) {
          return true;
        }
      }
    }
  }
  return false;
};

const tryMoveAxis = (world, pos, vel, axis, dt, player) => {
  const delta = vel[axis] * dt;
  pos[axis] += delta;
  if (bboxCollides(world, pos)) {
    pos[axis] -= delta;
    if (axis === 'y' && player && delta < 0) player.onGround = true;
    vel[axis] = 0;
  }
};

// Ray casting into voxel grid
const raycast = (world, origin, dir, maxDistance = 8) => {
  const step = 0.1;
  let traveled = 0;
  let lastFree = null;
  while (traveled < maxDistance) {
    const x = origin.x + dir.x * traveled;
    const y = origin.y + dir.y * traveled;
    const z = origin.z + dir.z * traveled;
    const bx = Math.floor(x);
    const by = Math.floor(y);
    const bz = Math.floor(z);
    const id = world.get(bx, by, bz);
    if (id !== BLOCK.AIR) {
      return { hit: true, x: bx, y: by, z: bz, place: lastFree };
    }
    lastFree = { x: bx, y: by, z: bz };
    traveled += step;
  }
  return { hit: false, place: lastFree };
};

// UI helpers
const formatHotbar = (player) => {
  uiNodes.hotbar.innerHTML = '';
  HOTBAR_SLOTS.forEach((id, idx) => {
    const slot = document.createElement('div');
    slot.className = 'slot' + (idx === player.hotbarIndex ? ' active' : '');
    const name = document.createElement('div');
    name.className = 'name';
    name.textContent = BLOCK_INFO[id].name;
    const count = document.createElement('div');
    count.className = 'count';
    count.textContent = player.inventory.get(id) ?? 0;
    slot.appendChild(name);
    slot.appendChild(count);
    uiNodes.hotbar.appendChild(slot);
  });
};

const updateDebug = (player, dayPercent, fps, target) => {
  const p = player.pos;
  uiNodes.debug.textContent =
    `XYZ: ${p.x.toFixed(2)}, ${p.y.toFixed(2)}, ${p.z.toFixed(2)} | ` +
    `Yaw: ${(player.yaw * 57.3).toFixed(1)}° Pitch: ${(player.pitch * 57.3).toFixed(1)}° | ` +
    `Day ${Math.floor(dayPercent * 24)}h | FPS ${fps.toFixed(0)} | ` +
    (target ? `Target: ${target.x},${target.y},${target.z}` : 'Target: none');
};

const findSurfaceY = (world, x, z) => {
  for (let y = world.h - 1; y >= 0; y--) {
    if (world.get(x, y, z) !== BLOCK.AIR) return y;
  }
  return 0;
};

// Main game bootstrap
const app = new PIXI.Application({
  background: '#80b8ff',
  antialias: true,
  resolution: devicePixelRatio,
  autoDensity: true,
  resizeTo: window
});

document.getElementById('game').appendChild(app.view);

const world = new VoxelWorld(WORLD_WIDTH, WORLD_HEIGHT, WORLD_DEPTH, CHUNK_SIZE);
const generator = new TerrainGenerator(world);
let seed = Math.floor(Math.random() * 1e6);
generator.generate(seed);

const renderer = new WorldRenderer(app, world);
renderer.rebuildAll();

const player = new Player(world);
const spawnY = Math.min(findSurfaceY(world, Math.floor(WORLD_WIDTH / 2), Math.floor(WORLD_DEPTH / 2)) + 3, WORLD_HEIGHT - 2);
player.pos = { x: WORLD_WIDTH / 2, y: spawnY, z: WORLD_DEPTH / 2 };
const input = new Input();
formatHotbar(player);

// Player sprite
const playerShape = new PIXI.Graphics();
playerShape.beginFill(0xfff7d6);
playerShape.drawEllipse(0, -PLAYER_HEIGHT * BLOCK_HEIGHT * 0.35, 12, 18);
playerShape.endFill();
playerShape.lineStyle(2, 0x1f2a44, 0.9);
playerShape.moveTo(-8, -PLAYER_HEIGHT * BLOCK_HEIGHT * 0.55);
playerShape.lineTo(8, -PLAYER_HEIGHT * BLOCK_HEIGHT * 0.55);
playerShape.zIndex = 75000;
renderer.container.addChild(playerShape);

// Time keeping
let timeOfDay = 0; // 0..1
let accumulator = 0;
let last = performance.now();
let targetBlock = null;

const handleScroll = (e) => {
  const dir = e.deltaY > 0 ? 1 : -1;
  player.hotbarIndex = (player.hotbarIndex + dir + HOTBAR_SLOTS.length) % HOTBAR_SLOTS.length;
  formatHotbar(player);
};
window.addEventListener('wheel', handleScroll, { passive: true });

const resetWorld = () => {
  seed = Math.floor(Math.random() * 1e6);
  world.data.fill(BLOCK.AIR);
  world.dirtyChunks.clear();
  generator.generate(seed);
  renderer.rebuildAll();
  const spawn = Math.min(findSurfaceY(world, Math.floor(WORLD_WIDTH / 2), Math.floor(WORLD_DEPTH / 2)) + 3, WORLD_HEIGHT - 2);
  player.pos = { x: WORLD_WIDTH / 2, y: spawn, z: WORLD_DEPTH / 2 };
  player.vel = { x: 0, y: 0, z: 0 };
};

window.addEventListener('keydown', e => {
  if (e.code === 'KeyR') {
    resetWorld();
  }
  if (e.code === 'KeyQ') player.yaw -= Math.PI / 12;
  if (e.code === 'KeyE') player.yaw += Math.PI / 12;
  if (e.code === 'BracketLeft') player.pitch = clamp(player.pitch - 0.05, -0.9, 0.3);
  if (e.code === 'BracketRight') player.pitch = clamp(player.pitch + 0.05, -0.9, 0.3);
});

const performMining = () => {
  if (!targetBlock) return;
  const id = world.get(targetBlock.x, targetBlock.y, targetBlock.z);
  if (id === BLOCK.AIR || id === BLOCK.WATER) return;
  world.set(targetBlock.x, targetBlock.y, targetBlock.z, BLOCK.AIR);
  if (HOTBAR_SLOTS.includes(id)) {
    const count = player.inventory.get(id) ?? 0;
    player.inventory.set(id, count + 1);
    formatHotbar(player);
  }
};

const performPlace = () => {
  if (!targetBlock || !targetBlock.place) return;
  const blockId = HOTBAR_SLOTS[player.hotbarIndex];
  const count = player.inventory.get(blockId) ?? 0;
  if (count <= 0) return;
  const { x, y, z } = targetBlock.place;
  const pos = { x: x + 0.5, y: y, z: z + 0.5 };
  if (bboxWouldCollideWith(pos, player.pos)) return;
  world.set(x, y, z, blockId);
  player.inventory.set(blockId, count - 1);
  formatHotbar(player);
};

const bboxWouldCollideWith = (cellPos, playerPos) => {
  const px = playerPos.x;
  const py = playerPos.y;
  const pz = playerPos.z;
  const minX = px - PLAYER_RADIUS;
  const maxX = px + PLAYER_RADIUS;
  const minY = py;
  const maxY = py + PLAYER_HEIGHT;
  const minZ = pz - PLAYER_RADIUS;
  const maxZ = pz + PLAYER_RADIUS;
  const blockMinX = cellPos.x - 0.5;
  const blockMaxX = cellPos.x + 0.5;
  const blockMinY = cellPos.y;
  const blockMaxY = cellPos.y + 1;
  const blockMinZ = cellPos.z - 0.5;
  const blockMaxZ = cellPos.z + 0.5;
  return (
    blockMaxX > minX && blockMinX < maxX &&
    blockMaxY > minY && blockMinY < maxY &&
    blockMaxZ > minZ && blockMinZ < maxZ
  );
};

app.view.addEventListener('mousedown', e => {
  if (e.button === 0) performMining();
  if (e.button === 2) performPlace();
});

// Main loop
const tick = () => {
  const now = performance.now();
  const dtMs = now - last;
  last = now;
  accumulator += dtMs;

  while (accumulator >= TICK_RATE * 1000) {
    step(TICK_RATE);
    accumulator -= TICK_RATE * 1000;
  }

  const fps = 1000 / dtMs;
  updateDebug(player, timeOfDay, fps, targetBlock);
  requestAnimationFrame(tick);
};

const step = (dt) => {
  // Input forces
  const forward = (input.keys.has('KeyW') ? 1 : 0) + (input.keys.has('KeyS') ? -1 : 0);
  const strafe = (input.keys.has('KeyD') ? 1 : 0) + (input.keys.has('KeyA') ? -1 : 0);
  const dir = player.dirVec;
  const right = { x: Math.cos(player.yaw + Math.PI / 2), z: Math.sin(player.yaw + Math.PI / 2) };
  const wasOnGround = player.onGround;
  const accelScale = wasOnGround ? 1 : AIR_CONTROL;
  player.vel.x += ((dir.x * forward + right.x * strafe) * MOVE_SPEED) * accelScale * dt;
  player.vel.z += ((dir.z * forward + right.z * strafe) * MOVE_SPEED) * accelScale * dt;

  player.vel.x *= wasOnGround ? 0.82 : 0.98;
  player.vel.z *= wasOnGround ? 0.82 : 0.98;

  // Gravity
  player.vel.y -= GRAVITY * dt;
  player.onGround = false;

  // Jump
  if (input.keys.has('Space') && wasOnGround) {
    player.vel.y = JUMP_FORCE;
    player.onGround = false;
  }

  // Integrate with axis separation
  tryMoveAxis(world, player.pos, player.vel, 'x', dt, player);
  tryMoveAxis(world, player.pos, player.vel, 'z', dt, player);
  tryMoveAxis(world, player.pos, player.vel, 'y', dt, player);

  const groundProbe = { x: player.pos.x, y: player.pos.y - 0.05, z: player.pos.z };
  player.onGround = player.vel.y <= 0.1 && bboxCollides(world, groundProbe);

  if (player.pos.y < 1) {
    player.pos.y = SEA_LEVEL + 5;
    player.vel = { x: 0, y: 0, z: 0 };
  }

  // Time
  timeOfDay += dt / DAY_LENGTH_SECONDS;
  if (timeOfDay > 1) timeOfDay -= 1;
  renderer.updateAmbient(timeOfDay);

  // Raycast from eye
  const origin = {
    x: player.pos.x,
    y: player.pos.y + PLAYER_EYE,
    z: player.pos.z
  };
  targetBlock = raycast(world, origin, player.dirVec, 10);
  renderer.updateSelector(targetBlock && targetBlock.hit ? targetBlock : null);

  renderer.rebuildDirty();
  renderer.updateCamera(player);

  const iso = isoProject(player.pos.x, player.pos.y, player.pos.z);
  playerShape.x = iso.x;
  playerShape.y = iso.y;
};

requestAnimationFrame(tick);
