/**
 * 精灵图裁剪工具 v2
 * 支持：上传精灵表、中心对齐网格、鼠标拖拽调整网格宽高、帧分配、批量导出
 */

// ========== 状态 ==========
const state = {
  image: null,
  imageWidth: 0,
  imageHeight: 0,
  rows: 3,
  cols: 8,
  frameW: 48,
  frameH: 48,
  hGap: 0,
  vGap: 0,
  alignMode: 'center', // 'center' | 'top-center'
  selectedCell: null,
  assignments: {},
  cellFrameCounts: {},
  frameImages: {},       // slotKey:idx → canvas (分配那一刻的截图)
  // 拖拽状态
  dragType: null,
  dragLineIndex: -1,
  dragStartX: 0,
  dragStartY: 0,
  dragStartFrameW: 0,
  dragStartFrameH: 0,
  // 悬停检测
  hoverType: null,
  hoverLineIndex: -1,
};

// 拖拽热区宽度（像素）
const DRAG_ZONE = 6;

// 槽位配置
const SLOT_CONFIG = {
  'down-walk': 6, 'down-idle': 1,
  'up-walk': 6, 'up-idle': 1,
  'left-walk': 6, 'left-idle': 1,
  'right-walk': 6, 'right-idle': 1,
};

// 右方向由左方向自动翻转，不可手动分配
const AUTO_FLIP_SLOTS = {
  'right-walk': 'left-walk',
  'right-idle': 'left-idle',
};

// ========== DOM ==========
const uploadArea = document.getElementById('upload-area');
const fileInput = document.getElementById('file-input');
const uploadPreview = document.getElementById('upload-preview');
const uploadPlaceholder = document.getElementById('upload-placeholder');
const settingsSection = document.getElementById('settings-section');
const canvasSection = document.getElementById('canvas-section');
const previewSection = document.getElementById('preview-section');
const exportSection = document.getElementById('export-section');

const inputRows = document.getElementById('input-rows');
const inputCols = document.getElementById('input-cols');
const inputFrameW = document.getElementById('input-frame-w');
const inputFrameH = document.getElementById('input-frame-h');
const inputHGap = document.getElementById('input-h-gap');
const inputVGap = document.getElementById('input-v-gap');
const imageInfo = document.getElementById('image-info');

const spriteCanvas = document.getElementById('sprite-canvas');
const ctx = spriteCanvas.getContext('2d');

const previewCanvas = document.getElementById('preview-canvas');
const previewCtx = previewCanvas.getContext('2d');
const previewInfo = document.getElementById('preview-info');

const inputCharName = document.getElementById('input-char-name');
const btnExportAll = document.getElementById('btn-export-all');
const btnClearAssignments = document.getElementById('btn-clear-assignments');
const exportStatus = document.getElementById('export-status');

// ========== 网格几何计算 ==========
function getGridBounds() {
  const totalW = state.cols * state.frameW + Math.max(0, state.cols - 1) * state.hGap;
  const totalH = state.rows * state.frameH + Math.max(0, state.rows - 1) * state.vGap;
  const offsetX = (state.imageWidth - totalW) / 2;
  const offsetY = state.alignMode === 'center'
    ? (state.imageHeight - totalH) / 2
    : 0;
  return { totalW, totalH, offsetX, offsetY };
}

function getCellPos(row, col) {
  const { offsetX, offsetY } = getGridBounds();
  const x = offsetX + col * (state.frameW + state.hGap);
  const y = offsetY + row * (state.frameH + state.vGap);
  return { x, y };
}

// ========== 上传处理 ==========
uploadArea.addEventListener('click', () => fileInput.click());

uploadArea.addEventListener('dragover', (e) => {
  e.preventDefault();
  uploadArea.classList.add('dragover');
});

uploadArea.addEventListener('dragleave', () => {
  uploadArea.classList.remove('dragover');
});

uploadArea.addEventListener('drop', (e) => {
  e.preventDefault();
  uploadArea.classList.remove('dragover');
  const file = e.dataTransfer.files[0];
  if (file && file.type.startsWith('image/')) loadImage(file);
});

fileInput.addEventListener('change', (e) => {
  const file = e.target.files[0];
  if (file) loadImage(file);
});

function loadImage(file) {
  const reader = new FileReader();
  reader.onload = (e) => {
    const img = new Image();
    img.onload = () => {
      state.image = img;
      state.imageWidth = img.width;
      state.imageHeight = img.height;
      uploadPreview.src = e.target.result;
      uploadPreview.classList.remove('hidden');
      uploadPlaceholder.classList.add('hidden');

      // 自动建议
      state.rows = Math.round(img.height / 48);
      state.cols = Math.round(img.width / 48);
      inputRows.value = state.rows;
      inputCols.value = state.cols;

      settingsSection.classList.remove('hidden');
      canvasSection.classList.remove('hidden');
      previewSection.classList.remove('hidden');
      exportSection.classList.remove('hidden');

      updateImageInfo();
      drawGrid();
    };
    img.src = e.target.result;
  };
  reader.readAsDataURL(file);
}

function updateImageInfo() {
  const { totalW, totalH, offsetX, offsetY } = getGridBounds();
  imageInfo.textContent = `图片: ${state.imageWidth}×${state.imageHeight} | 网格: ${totalW}×${totalH} | 偏移: (${Math.round(offsetX)}, ${Math.round(offsetY)}) | 帧: ${state.frameW}×${state.frameH}`;
}

// ========== 输入框变更 ==========
[inputRows, inputCols, inputFrameW, inputFrameH, inputHGap, inputVGap].forEach(input => {
  input.addEventListener('input', () => {
    state.rows = parseInt(inputRows.value) || 1;
    state.cols = parseInt(inputCols.value) || 1;
    state.frameW = parseInt(inputFrameW.value) || 48;
    state.frameH = parseInt(inputFrameH.value) || 48;
    state.hGap = parseInt(inputHGap.value) || 0;
    state.vGap = parseInt(inputVGap.value) || 0;
    state.selectedCell = null;
    updateImageInfo();
    drawGrid();
  });
});

// 对齐模式切换
document.querySelectorAll('input[name="align-mode"]').forEach(radio => {
  radio.addEventListener('change', (e) => {
    state.alignMode = e.target.value;
    state.selectedCell = null;
    updateImageInfo();
    drawGrid();
  });
});

// ========== 画布绘制 ==========
function drawGrid() {
  if (!state.image) return;

  spriteCanvas.width = state.imageWidth;
  spriteCanvas.height = state.imageHeight;

  ctx.drawImage(state.image, 0, 0);

  const { offsetX, offsetY } = getGridBounds();

  // 绘制网格线
  ctx.strokeStyle = 'rgba(102, 126, 234, 0.5)';
  ctx.lineWidth = 1;

  for (let row = 0; row < state.rows; row++) {
    for (let col = 0; col < state.cols; col++) {
      const pos = getCellPos(row, col);
      ctx.strokeRect(pos.x, pos.y, state.frameW, state.frameH);

      // 格子序号
      const cellIdx = row * state.cols + col;
      ctx.fillStyle = 'rgba(0, 0, 0, 0.6)';
      ctx.fillRect(pos.x + 2, pos.y + 2, 22, 14);
      ctx.fillStyle = '#fff';
      ctx.font = '10px sans-serif';
      ctx.fillText(cellIdx, pos.x + 5, pos.y + 12);
    }
  }

  // 已分配格子
  for (const [cellIdx, info] of Object.entries(state.cellFrameCounts)) {
    const row = Math.floor(cellIdx / state.cols);
    const col = cellIdx % state.cols;
    const pos = getCellPos(row, col);
    ctx.fillStyle = 'rgba(40, 167, 69, 0.3)';
    ctx.fillRect(pos.x, pos.y, state.frameW, state.frameH);
    ctx.strokeStyle = '#28a745';
    ctx.lineWidth = 2;
    ctx.strokeRect(pos.x, pos.y, state.frameW, state.frameH);
    ctx.fillStyle = 'rgba(40, 167, 69, 0.8)';
    ctx.fillRect(pos.x + state.frameW - 42, pos.y + 2, 40, 14);
    ctx.fillStyle = '#fff';
    ctx.font = 'bold 9px sans-serif';
    ctx.fillText(info.slotKey, pos.x + state.frameW - 40, pos.y + 12);
  }

  // 选中格子
  if (state.selectedCell) {
    const pos = getCellPos(state.selectedCell.row, state.selectedCell.col);
    ctx.fillStyle = 'rgba(102, 126, 234, 0.3)';
    ctx.fillRect(pos.x, pos.y, state.frameW, state.frameH);
    ctx.strokeStyle = '#667eea';
    ctx.lineWidth = 2;
    ctx.strokeRect(pos.x, pos.y, state.frameW, state.frameH);
  }

  // 拖拽手柄高亮
  drawDragHandles();
}

function drawDragHandles() {
  const { offsetX, offsetY, totalW, totalH } = getGridBounds();

  // 绘制可拖拽区域（半透明指示）
  if (state.hoverType === 'v-line') {
    const lineX = offsetX + (state.hoverLineIndex + 1) * (state.frameW + state.hGap) - state.hGap / 2;
    ctx.fillStyle = 'rgba(255, 165, 0, 0.3)';
    ctx.fillRect(lineX - 3, offsetY, 6, totalH);
    // 双向箭头
    ctx.fillStyle = '#ffa500';
    ctx.font = 'bold 12px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('↔', lineX, offsetY - 5);
  }

  if (state.hoverType === 'h-line') {
    const lineY = offsetY + (state.hoverLineIndex + 1) * (state.frameH + state.vGap) - state.vGap / 2;
    ctx.fillStyle = 'rgba(255, 165, 0, 0.3)';
    ctx.fillRect(offsetX, lineY - 3, totalW, 6);
    ctx.fillStyle = '#ffa500';
    ctx.font = 'bold 12px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('↕', offsetX - 8, lineY + 4);
  }
}

// ========== 鼠标事件（拖拽 + 点击） ==========
spriteCanvas.addEventListener('mousemove', (e) => {
  if (!state.image) return;

  const rect = spriteCanvas.getBoundingClientRect();
  const scaleX = spriteCanvas.width / rect.width;
  const scaleY = spriteCanvas.height / rect.height;
  const mx = (e.clientX - rect.left) * scaleX;
  const my = (e.clientY - rect.top) * scaleY;

  if (state.dragType) {
    handleDrag(mx, my);
    return;
  }

  // 检测是否在拖拽热区
  state.hoverType = null;
  state.hoverLineIndex = -1;

  // 检测竖线热区
  const { offsetX, offsetY, totalW, totalH } = getGridBounds();
  for (let i = 0; i < state.cols - 1; i++) {
    const lineX = offsetX + (i + 1) * state.frameW + i * state.hGap;
    if (Math.abs(mx - lineX) < DRAG_ZONE && my >= offsetY && my <= offsetY + totalH) {
      state.hoverType = 'v-line';
      state.hoverLineIndex = i;
      break;
    }
  }

  // 检测横线热区
  if (!state.hoverType) {
    for (let i = 0; i < state.rows - 1; i++) {
      const lineY = offsetY + (i + 1) * state.frameH + i * state.vGap;
      if (Math.abs(my - lineY) < DRAG_ZONE && mx >= offsetX && mx <= offsetX + totalW) {
        state.hoverType = 'h-line';
        state.hoverLineIndex = i;
        break;
      }
    }
  }

  spriteCanvas.style.cursor = state.hoverType === 'v-line' ? 'col-resize' :
                               state.hoverType === 'h-line' ? 'row-resize' : 'crosshair';
  drawGrid();
});

spriteCanvas.addEventListener('mousedown', (e) => {
  if (!state.image) return;

  if (state.hoverType) {
    state.dragType = state.hoverType;
    state.dragLineIndex = state.hoverLineIndex;

    const rect = spriteCanvas.getBoundingClientRect();
    const scaleX = spriteCanvas.width / rect.width;
    const scaleY = spriteCanvas.height / rect.height;
    state.dragStartX = (e.clientX - rect.left) * scaleX;
    state.dragStartY = (e.clientY - rect.top) * scaleY;
    state.dragStartFrameW = state.frameW;
    state.dragStartFrameH = state.frameH;
    e.preventDefault();
    return;
  }

  // 普通点击：选中格子
  const rect = spriteCanvas.getBoundingClientRect();
  const scaleX = spriteCanvas.width / rect.width;
  const scaleY = spriteCanvas.height / rect.height;
  const mx = (e.clientX - rect.left) * scaleX;
  const my = (e.clientY - rect.top) * scaleY;

  const { offsetX, offsetY } = getGridBounds();
  const stepX = state.frameW + state.hGap;
  const stepY = state.frameH + state.vGap;

  const col = Math.floor((mx - offsetX) / stepX);
  const row = Math.floor((my - offsetY) / stepY);

  if (row >= 0 && row < state.rows && col >= 0 && col < state.cols) {
    state.selectedCell = { row, col };
    drawGrid();
    showPreview(row, col);
  }
});

spriteCanvas.addEventListener('mouseup', () => {
  if (state.dragType) {
    state.dragType = null;
    state.dragLineIndex = -1;
    updateImageInfo();
    drawGrid();
  }
});

spriteCanvas.addEventListener('mouseleave', () => {
  if (state.dragType) {
    state.dragType = null;
    state.dragLineIndex = -1;
    updateImageInfo();
    drawGrid();
  }
  state.hoverType = null;
});

function handleDrag(mx, my) {
  const dx = mx - state.dragStartX;
  const dy = my - state.dragStartY;

  if (state.dragType === 'v-line') {
    const newFrameW = Math.max(8, Math.round(state.dragStartFrameW + dx));
    state.frameW = newFrameW;
    inputFrameW.value = newFrameW;
  } else if (state.dragType === 'h-line') {
    const newFrameH = Math.max(8, Math.round(state.dragStartFrameH + dy));
    state.frameH = newFrameH;
    inputFrameH.value = newFrameH;
  }

  drawGrid();
}

// ========== 预览 ==========
function showPreview(row, col) {
  const cellIdx = row * state.cols + col;

  previewCanvas.width = state.frameW * 2;
  previewCanvas.height = state.frameH * 2;
  previewCanvas.style.width = state.frameW * 2 + 'px';
  previewCanvas.style.height = state.frameH * 2 + 'px';

  previewCtx.clearRect(0, 0, previewCanvas.width, previewCanvas.height);
  previewCtx.imageSmoothingEnabled = false;

  const pos = getCellPos(row, col);
  previewCtx.drawImage(
    state.image,
    pos.x, pos.y, state.frameW, state.frameH,
    0, 0, previewCanvas.width, previewCanvas.height
  );

  previewInfo.textContent = `格子 #${cellIdx} (${row}, ${col})`;
  if (state.cellFrameCounts[cellIdx]) {
    previewInfo.textContent += ` → ${state.cellFrameCounts[cellIdx].slotKey}`;
  }
}

// ========== 槽位分配 ==========
document.querySelectorAll('.slot').forEach(slot => {
  slot.addEventListener('click', () => {
    if (!state.selectedCell) {
      alert('请先点击精灵图上的格子！');
      return;
    }

    const slotKey = slot.dataset.slot;

    // 右方向由左方向自动翻转，不可手动分配
    if (AUTO_FLIP_SLOTS[slotKey]) {
      return;
    }

    const maxFrames = SLOT_CONFIG[slotKey];
    const cellIdx = state.selectedCell.row * state.cols + state.selectedCell.col;

    if (!state.assignments[slotKey]) state.assignments[slotKey] = [];
    const frames = state.assignments[slotKey];

    if (frames.length >= maxFrames) {
      alert(`此槽位已满 (${maxFrames}帧)`);
      return;
    }

    // 从旧槽位移除
    if (state.cellFrameCounts[cellIdx]) {
      const oldSlot = state.cellFrameCounts[cellIdx].slotKey;
      const oldFrames = state.assignments[oldSlot];
      const oldIdx = oldFrames.indexOf(cellIdx);
      if (oldIdx > -1) oldFrames.splice(oldIdx, 1);
      delete state.cellFrameCounts[cellIdx];
    }

    frames.push(cellIdx);
    state.cellFrameCounts[cellIdx] = { slotKey, index: frames.length - 1 };

    // 截取分配那一刻的帧画面
    captureFrame(slotKey, frames.length - 1, false);

    // 自动同步右方向
    syncRightDirection();

    drawGrid();
    updateSlotDisplay();
    showPreview(state.selectedCell.row, state.selectedCell.col);
  });
});

function syncRightDirection() {
  for (const [rightSlot, leftSlot] of Object.entries(AUTO_FLIP_SLOTS)) {
    const leftFrames = state.assignments[leftSlot] || [];
    state.assignments[rightSlot] = [...leftFrames];
    // 截取右方向的翻转帧
    leftFrames.forEach((cellIdx, i) => {
      captureFrame(rightSlot, i, true);
    });
  }
}

// 截取当前网格位置下的帧画面
function captureFrame(slotKey, index, flipH) {
  const cellIdx = state.assignments[slotKey]?.[index];
  if (cellIdx === undefined) return;
  const row = Math.floor(cellIdx / state.cols);
  const col = cellIdx % state.cols;
  const pos = getCellPos(row, col);

  const canvas = document.createElement('canvas');
  canvas.width = state.frameW;
  canvas.height = state.frameH;
  const fCtx = canvas.getContext('2d');
  fCtx.imageSmoothingEnabled = false;

  if (flipH) {
    fCtx.translate(state.frameW, 0);
    fCtx.scale(-1, 1);
    fCtx.drawImage(state.image, pos.x, pos.y, state.frameW, state.frameH, 0, 0, state.frameW, state.frameH);
    fCtx.setTransform(1, 0, 0, 1, 0, 0);
  } else {
    fCtx.drawImage(state.image, pos.x, pos.y, state.frameW, state.frameH, 0, 0, state.frameW, state.frameH);
  }

  state.frameImages[`${slotKey}:${index}`] = canvas;
}

function updateSlotDisplay() {
  document.querySelectorAll('.slot').forEach(slot => {
    const slotKey = slot.dataset.slot;
    const framesContainer = slot.querySelector('.slot-frames');
    framesContainer.innerHTML = '';

    const frames = state.assignments[slotKey] || [];
    const isAutoFlip = !!AUTO_FLIP_SLOTS[slotKey];

    frames.forEach((cellIdx, frameIdx) => {
      const row = Math.floor(cellIdx / state.cols);
      const col = cellIdx % state.cols;
      const pos = getCellPos(row, col);

      // 缩略图容器
      const wrapper = document.createElement('div');
      wrapper.className = 'slot-frame-wrapper';

      const thumb = document.createElement('canvas');
      thumb.className = 'slot-frame-thumb';
      thumb.width = 32;
      thumb.height = 32;
      const tCtx = thumb.getContext('2d');
      tCtx.imageSmoothingEnabled = false;

      if (isAutoFlip) {
        // 右方向：水平翻转左方向图片
        tCtx.translate(32, 0);
        tCtx.scale(-1, 1);
        tCtx.drawImage(state.image, pos.x, pos.y, state.frameW, state.frameH, 0, 0, 32, 32);
        tCtx.setTransform(1, 0, 0, 1, 0, 0);
        wrapper.title = `由左方向翻转 → 格子 #${cellIdx}`;
      } else {
        tCtx.drawImage(state.image, pos.x, pos.y, state.frameW, state.frameH, 0, 0, 32, 32);
        thumb.title = `格子 #${cellIdx}`;

        // 取消按钮（仅非自动生成的槽位）
        const removeBtn = document.createElement('button');
        removeBtn.className = 'slot-frame-remove';
        removeBtn.textContent = '×';
        removeBtn.title = '取消此帧';
        removeBtn.addEventListener('click', (e) => {
          e.stopPropagation();
          frames.splice(frameIdx, 1);
          frames.forEach((c, i) => {
            state.cellFrameCounts[c] = { slotKey, index: i };
          });
          delete state.cellFrameCounts[cellIdx];
          delete state.frameImages[`${slotKey}:${frameIdx}`];
          if (frames.length === 0) delete state.assignments[slotKey];
          // 同步右方向
          syncRightDirection();
          drawGrid();
          updateSlotDisplay();
        });

        wrapper.appendChild(thumb);
        wrapper.appendChild(removeBtn);
        framesContainer.appendChild(wrapper);
        return;
      }

      wrapper.appendChild(thumb);
      framesContainer.appendChild(wrapper);
    });
  });
}

// ========== 导出 ==========
btnExportAll.addEventListener('click', async () => {
  const charName = inputCharName.value.trim() || 'xiaoming';

  // 先同步右方向
  syncRightDirection();

  let total = 0;
  for (const frames of Object.values(state.assignments)) total += frames.length;

  if (total === 0) {
    exportStatus.textContent = '没有已分配的帧';
    return;
  }

  exportStatus.textContent = `正在打包 ${total} 帧到 ZIP...`;
  btnExportAll.disabled = true;

  const zip = new JSZip();

  let exported = 0;
  for (const [slotKey, frames] of Object.entries(state.assignments)) {
    for (let i = 0; i < frames.length; i++) {
      const frameKey = `${slotKey}:${i}`;
      const frameCanvas = state.frameImages[frameKey];

      if (!frameCanvas) {
        exportStatus.textContent = `帧 ${frameKey} 不存在，跳过`;
        continue;
      }

      const blob = await new Promise(resolve => frameCanvas.toBlob(resolve, 'image/png'));
      zip.file(`${charName}-${slotKey}-${i}.png`, blob);

      exported++;
      exportStatus.textContent = `打包中... ${exported}/${total}`;
    }
  }

  // 导出元数据
  zip.file('meta.json', JSON.stringify({
    character: charName,
    frameSize: [state.frameW, state.frameH],
    walkFrames: 6,
    idleFrames: 1,
    totalFrames: total,
    slots: Object.keys(state.assignments),
    generatedAt: new Date().toISOString()
  }, null, 2));

  // 生成并下载 ZIP
  const content = await zip.generateAsync({ type: 'blob' });
  const url = URL.createObjectURL(content);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${charName}-sprite-frames.zip`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);

  exportStatus.textContent = `导出完成！共 ${exported} 帧，已打包为 ZIP`;
  btnExportAll.disabled = false;
});

btnClearAssignments.addEventListener('click', () => {
  if (!confirm('确定清空所有分配？')) return;
  state.assignments = {};
  state.cellFrameCounts = {};
  state.frameImages = {};
  state.selectedCell = null;
  drawGrid();
  updateSlotDisplay();
  previewInfo.textContent = '点击格子查看预览';
  exportStatus.textContent = '';
});
