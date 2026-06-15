/**
 * 精灵动画测试页面
 * 测试各角色、各方向、各动作的动画效果
 */

import { ASSET_CONFIG, getCharacterAnimation, getCharacterSprite, getCharacterKey } from '../assets/asset-config.js';

// ========== 状态 ==========
let currentChar = '';
let fps = 4;
let animState = {}; // direction:action → { frameIndex, lastFrameTime }
let loadedFrames = {}; // direction:action:idx → Image|null
let loadStatus = {}; // direction:action:idx → 'loaded'|'error'|'loading'
let rafId = null;

// ========== DOM ==========
const charSelect = document.getElementById('char-select');
const fpsSelect = document.getElementById('fps-select');
const testGrid = document.getElementById('test-grid');

const directions = ['down', 'up', 'left', 'right'];
const actions = ['walk', 'idle'];

// ========== 初始化 ==========
function init() {
  // 填充角色选择
  const charKeys = Object.keys(ASSET_CONFIG.characters);
  charKeys.forEach(key => {
    const opt = document.createElement('option');
    opt.value = key;
    opt.textContent = ASSET_CONFIG.characters[key].name || key;
    charSelect.appendChild(opt);
  });

  charSelect.addEventListener('change', () => {
    currentChar = charSelect.value;
    loadCharacterFrames();
    renderGrid();
  });

  fpsSelect.addEventListener('change', () => {
    fps = parseInt(fpsSelect.value);
    animState = {};
  });

  // 默认选第一个
  currentChar = charKeys[0];
  loadCharacterFrames();
  renderGrid();
}

// ========== 加载帧图片 ==========
function loadCharacterFrames() {
  const animConfig = getCharacterAnimation(currentChar);
  const staticSprite = getCharacterSprite(currentChar);
  loadedFrames = {};
  loadStatus = {};
  animState = {};

  if (!animConfig && !staticSprite) return;

  // 检查是否有独立帧动画
  if (animConfig) {
    const walkCount = animConfig.walkFrames;
    const idleCount = animConfig.idleFrames;

    for (const dir of directions) {
      for (const act of actions) {
        const count = act === 'walk' ? walkCount : idleCount;
        const actualDir = dir === 'right' ? 'left' : dir; // 右方向复用左方向帧
        for (let i = 0; i < count; i++) {
          const key = `${dir}:${act}:${i}`;
          loadFrame(key, animConfig.basePath, actualDir, act, i, animConfig.frameSize, getCharacterKey(currentChar));
        }
      }
    }
  } else if (staticSprite) {
    // 静态模式：所有方向/动作用同一张图
    const img = new Image();
    img.onload = () => {
      for (const dir of directions) {
        for (const act of actions) {
          const key = `${dir}:${act}:0`;
          loadedFrames[key] = img;
          loadStatus[key] = 'loaded';
        }
      }
    };
    img.src = ASSET_CONFIG.basePath + '/' + staticSprite;
  }
}

function loadFrame(key, basePath, dir, act, idx, frameSize, charKey) {
  loadStatus[key] = 'loading';
  const img = new Image();
  img.onload = () => {
    loadedFrames[key] = img;
    loadStatus[key] = 'loaded';
    if (rafId) return;
    startAnimation();
  };
  img.onerror = () => {
    loadStatus[key] = 'error';
  };
  img.src = `${ASSET_CONFIG.basePath}/${basePath}${charKey}-${dir}-${act}-${idx}.png`;
}

// ========== 渲染测试网格 ==========
function renderGrid() {
  const animConfig = getCharacterAnimation(currentChar);
  const frameSize = animConfig ? animConfig.frameSize : [48, 48];

  testGrid.innerHTML = '';

  for (const dir of directions) {
    for (const act of actions) {
      const card = document.createElement('div');
      card.className = 'test-card';

      const label = dir === 'down' ? '↓ 下' : dir === 'up' ? '↑ 上' : dir === 'left' ? '← 左' : '→ 右';
      const actLabel = act === 'walk' ? '走路' : '静止';
      const count = animConfig ? (act === 'walk' ? animConfig.walkFrames : animConfig.idleFrames) : 1;

      card.innerHTML = `
        <h3>${label} · ${actLabel}</h3>
        <div class="test-canvas-wrap">
          <canvas width="${frameSize[0]}" height="${frameSize[1]}"
                  style="width:${frameSize[0]}px;height:${frameSize[1]}px"></canvas>
        </div>
        <div class="test-controls">
          <div style="display:flex;gap:4px">
            <button class="test-btn dir-btn" data-dir="${dir}" data-act="walk">${act === 'walk' ? '●' : '○'}</button>
            <button class="test-btn dir-btn" data-dir="${dir}" data-act="idle">${act === 'idle' ? '●' : '○'}</button>
          </div>
        </div>
        <div class="test-status" id="status-${dir}-${act}">加载中...</div>
      `;
      testGrid.appendChild(card);
    }
  }

  // 启动动画循环
  startAnimation();
}

// ========== 动画循环 ==========
function startAnimation() {
  if (rafId) cancelAnimationFrame(rafId);
  animState = {};
  rafId = requestAnimationFrame(tick);
}

function tick() {
  const animConfig = getCharacterAnimation(currentChar);
  const frameSize = animConfig ? animConfig.frameSize : [48, 48];
  const now = performance.now();

  for (const dir of directions) {
    for (const act of actions) {
      const key = `${dir}:${act}`;
      const count = act === 'walk'
        ? (animConfig ? animConfig.walkFrames : 1)
        : (animConfig ? animConfig.idleFrames : 1);

      // 初始化状态
      if (!animState[key]) {
        animState[key] = { frameIndex: 0, lastFrameTime: now };
      }

      // 帧循环（仅走路）
      if (act === 'walk' && count > 1) {
        const interval = 1000 / fps;
        if (now - animState[key].lastFrameTime > interval) {
          animState[key].frameIndex = (animState[key].frameIndex + 1) % count;
          animState[key].lastFrameTime = now;
        }
      } else if (count <= 1) {
        animState[key].frameIndex = 0;
      }

      // 绘制
      const frameIdx = animState[key].frameIndex;
      const statusEl = document.getElementById(`status-${dir}-${act}`);

      // 找到对应 canvas
      const cards = testGrid.querySelectorAll('.test-card');
      let targetCanvas = null;
      let cardIndex = 0;
      for (const d of directions) {
        for (const a of actions) {
          if (d === dir && a === act) {
            targetCanvas = cards[cardIndex]?.querySelector('canvas');
            break;
          }
          cardIndex++;
        }
        if (targetCanvas) break;
      }

      if (targetCanvas) {
        const ctx = targetCanvas.getContext('2d');
        ctx.clearRect(0, 0, targetCanvas.width, targetCanvas.height);
        ctx.imageSmoothingEnabled = false;

        // 右方向使用左方向帧翻转
        const actualDir = dir === 'right' ? 'left' : dir;
        const frameKey = `${actualDir}:${act}:${frameIdx}`;
        const img = loadedFrames[frameKey];

        if (img) {
          if (dir === 'right') {
            ctx.save();
            ctx.translate(frameSize[0], 0);
            ctx.scale(-1, 1);
            ctx.drawImage(img, 0, 0, frameSize[0], frameSize[1]);
            ctx.restore();
          } else {
            ctx.drawImage(img, 0, 0, frameSize[0], frameSize[1]);
          }
          if (statusEl) {
            statusEl.textContent = `帧 ${frameIdx}/${count - 1}`;
            statusEl.className = 'test-status';
          }
        } else {
          const status = loadStatus[frameKey];
          if (status === 'error') {
            if (statusEl) {
              statusEl.textContent = '未找到帧文件';
              statusEl.className = 'test-status test-error';
            }
          } else if (status === 'loading') {
            if (statusEl) statusEl.textContent = '加载中...';
          }
        }
      }
    }
  }

  rafId = requestAnimationFrame(tick);
}

// ========== 启动 ==========
init();
