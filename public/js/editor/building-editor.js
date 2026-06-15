/**
 * 建筑编辑器主程序
 * 支持导入贴图、缩放大小、设置障碍物属性
 */

import imageLoader from '../assets/image-loader.js';
import { appendTextElement, clearElement } from '../app/dom-utils.js';

// ========== 配置 ==========
const CONFIG = {
  CELL_SIZE: 16,
  WORLD_WIDTH: 50,
  WORLD_HEIGHT: 50,
  MIN_ZOOM: 0.5,
  MAX_ZOOM: 3,
  ZOOM_STEP: 0.25
};

// ========== 状态 ==========
const state = {
  buildings: [], // { id, name, image, width, height, x, y, obstacle, description }
  selectedBuilding: null,
  zoom: 1,
  offsetX: 0,
  offsetY: 0,
  isDragging: false,
  dragStartX: 0,
  dragStartY: 0,
  showGrid: true,
  tempImageData: null // 用于存储上传的图片数据
};

// ========== DOM 元素 ==========
const elements = {};

// ========== 初始化 ==========
function init() {
  console.log('🏗️ 建筑编辑器初始化中...');

  cacheElements();
  setupEventListeners();
  initCanvas();
  loadBuildingsFromStorage();
  renderBuildingList();
  startRenderLoop();

  console.log('✅ 建筑编辑器初始化完成');
}

function cacheElements() {
  // 画布
  elements.canvas = document.getElementById('editor-canvas');
  elements.ctx = elements.canvas?.getContext('2d');
  elements.tooltip = document.getElementById('editor-tooltip');

  // 按钮
  elements.btnAddBuilding = document.getElementById('btn-add-building');
  elements.btnExport = document.getElementById('btn-export');
  elements.btnImport = document.getElementById('btn-import');
  elements.importFile = document.getElementById('import-file');
  elements.btnGrid = document.getElementById('btn-grid');
  elements.btnZoomIn = document.getElementById('btn-zoom-in');
  elements.btnZoomOut = document.getElementById('btn-zoom-out');
  elements.btnResetView = document.getElementById('btn-reset-view');

  // 列表和面板
  elements.buildingList = document.getElementById('building-list');
  elements.propertiesContent = document.getElementById('properties-content');

  // 新建建筑弹窗
  elements.newBuildingModal = document.getElementById('new-building-modal');
  elements.newBuildingForm = document.getElementById('new-building-form');
  elements.btnCloseNewBuilding = document.getElementById('btn-close-new-building');
  elements.btnCancelNewBuilding = document.getElementById('btn-cancel-new-building');
  elements.imageUploadArea = document.getElementById('image-upload-area');
  elements.buildingImage = document.getElementById('building-image');
  elements.imagePreview = document.getElementById('image-preview');

  // 编辑建筑弹窗
  elements.editBuildingModal = document.getElementById('edit-building-modal');
  elements.editBuildingForm = document.getElementById('edit-building-form');
  elements.btnCloseEditBuilding = document.getElementById('btn-close-edit-building');
  elements.btnCancelEditBuilding = document.getElementById('btn-cancel-edit-building');
  elements.btnDeleteBuilding = document.getElementById('btn-delete-building');
  elements.editImageUploadArea = document.getElementById('edit-image-upload-area');
  elements.editBuildingImage = document.getElementById('edit-building-image');
  elements.editImagePreview = document.getElementById('edit-image-preview');
  elements.btnChangeImage = document.querySelector('.btn-change-image');
}

function setupEventListeners() {
  // 新建建筑
  elements.btnAddBuilding?.addEventListener('click', showNewBuildingModal);
  elements.btnCloseNewBuilding?.addEventListener('click', hideNewBuildingModal);
  elements.btnCancelNewBuilding?.addEventListener('click', hideNewBuildingModal);
  elements.newBuildingForm?.addEventListener('submit', handleCreateBuilding);

  // 图片上传
  elements.imageUploadArea?.addEventListener('click', () => elements.buildingImage?.click());
  elements.imageUploadArea?.addEventListener('dragover', handleDragOver);
  elements.imageUploadArea?.addEventListener('dragleave', handleDragLeave);
  elements.imageUploadArea?.addEventListener('drop', handleDrop);
  elements.buildingImage?.addEventListener('change', handleImageSelect);

  // 编辑建筑
  elements.btnCloseEditBuilding?.addEventListener('click', hideEditBuildingModal);
  elements.btnCancelEditBuilding?.addEventListener('click', hideEditBuildingModal);
  elements.editBuildingForm?.addEventListener('submit', handleUpdateBuilding);
  elements.btnDeleteBuilding?.addEventListener('click', handleDeleteBuilding);
  elements.editImageUploadArea?.addEventListener('click', (e) => {
    if (e.target !== elements.editImagePreview) {
      elements.editBuildingImage?.click();
    }
  });
  elements.editBuildingImage?.addEventListener('change', handleEditImageSelect);
  elements.btnChangeImage?.addEventListener('click', () => elements.editBuildingImage?.click());

  // 导入/导出
  elements.btnExport?.addEventListener('click', exportBuildings);
  elements.btnImport?.addEventListener('click', () => elements.importFile?.click());
  elements.importFile?.addEventListener('change', importBuildings);

  // 画布控制
  elements.btnGrid?.addEventListener('click', toggleGrid);
  elements.btnZoomIn?.addEventListener('click', () => zoom(CONFIG.ZOOM_STEP));
  elements.btnZoomOut?.addEventListener('click', () => zoom(-CONFIG.ZOOM_STEP));
  elements.btnResetView?.addEventListener('click', resetView);

  // 画布交互
  elements.canvas?.addEventListener('mousedown', handleMouseDown);
  elements.canvas?.addEventListener('mousemove', handleMouseMove);
  elements.canvas?.addEventListener('mouseup', handleMouseUp);
  elements.canvas?.addEventListener('wheel', handleWheel);
  elements.canvas?.addEventListener('contextmenu', (e) => e.preventDefault());
}

// ========== 画布初始化 ==========
function initCanvas() {
  if (!elements.canvas || !elements.ctx) return;

  const width = CONFIG.WORLD_WIDTH * CONFIG.CELL_SIZE;
  const height = CONFIG.WORLD_HEIGHT * CONFIG.CELL_SIZE;

  elements.canvas.width = width;
  elements.canvas.height = height;

  // 初始居中
  centerCanvas();
}

function centerCanvas() {
  const container = elements.canvas?.parentElement;
  if (!container) return;

  state.offsetX = (container.clientWidth - elements.canvas.width) / 2;
  state.offsetY = (container.clientHeight - elements.canvas.height) / 2;
}

// ========== 渲染循环 ==========
function startRenderLoop() {
  render();
  requestAnimationFrame(startRenderLoop);
}

function render() {
  if (!elements.ctx) return;

  const ctx = elements.ctx;
  const canvas = elements.canvas;

  // 清空画布
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  // 绘制背景
  drawBackground(ctx);

  // 绘制网格
  if (state.showGrid) {
    drawGrid(ctx);
  }

  // 绘制路径
  drawPaths(ctx);

  // 绘制建筑
  drawBuildings(ctx);

  // 绘制选中框
  if (state.selectedBuilding) {
    drawSelection(ctx, state.selectedBuilding);
  }
}

function drawBackground(ctx) {
  // 深色背景
  ctx.fillStyle = '#0d1b2a';
  ctx.fillRect(0, 0, elements.canvas.width, elements.canvas.height);

  // 草地纹理（简化版）
  const grassColor = '#1a2f3d';
  ctx.fillStyle = grassColor;
  for (let y = 0; y < CONFIG.WORLD_HEIGHT; y += 2) {
    for (let x = 0; x < CONFIG.WORLD_WIDTH; x += 2) {
      if ((x + y) % 4 === 0) {
        ctx.fillRect(
          x * CONFIG.CELL_SIZE,
          y * CONFIG.CELL_SIZE,
          CONFIG.CELL_SIZE,
          CONFIG.CELL_SIZE
        );
      }
    }
  }
}

function drawGrid(ctx) {
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.1)';
  ctx.lineWidth = 1;

  // 竖线
  for (let x = 0; x <= CONFIG.WORLD_WIDTH; x++) {
    ctx.beginPath();
    ctx.moveTo(x * CONFIG.CELL_SIZE, 0);
    ctx.lineTo(x * CONFIG.CELL_SIZE, CONFIG.WORLD_HEIGHT * CONFIG.CELL_SIZE);
    ctx.stroke();
  }

  // 横线
  for (let y = 0; y <= CONFIG.WORLD_HEIGHT; y++) {
    ctx.beginPath();
    ctx.moveTo(0, y * CONFIG.CELL_SIZE);
    ctx.lineTo(CONFIG.WORLD_WIDTH * CONFIG.CELL_SIZE, y * CONFIG.CELL_SIZE);
    ctx.stroke();
  }
}

function drawPaths(ctx) {
  // 绘制默认路径连接主要区域
  const pathPoints = [
    // 中心十字路
    { x: 10, y: 10 }, { x: 11, y: 10 }, { x: 12, y: 10 }, { x: 13, y: 10 }, { x: 14, y: 10 },
    { x: 15, y: 10 }, { x: 16, y: 10 }, { x: 17, y: 10 }, { x: 18, y: 10 }, { x: 19, y: 10 },
    { x: 20, y: 10 }, { x: 21, y: 10 }, { x: 22, y: 10 }, { x: 23, y: 10 }, { x: 24, y: 10 },
    { x: 25, y: 10 }, { x: 26, y: 10 }, { x: 27, y: 10 }, { x: 28, y: 10 }, { x: 29, y: 10 },
    { x: 30, y: 10 },
    { x: 20, y: 5 }, { x: 20, y: 6 }, { x: 20, y: 7 }, { x: 20, y: 8 }, { x: 20, y: 9 },
    { x: 20, y: 10 }, { x: 20, y: 11 }, { x: 20, y: 12 }, { x: 20, y: 13 }, { x: 20, y: 14 },
    { x: 20, y: 15 }, { x: 20, y: 16 }, { x: 20, y: 17 }, { x: 20, y: 18 }, { x: 20, y: 19 },
    { x: 20, y: 20 },
  ];

  ctx.fillStyle = '#c9b896';
  for (const point of pathPoints) {
    ctx.fillRect(
      point.x * CONFIG.CELL_SIZE,
      point.y * CONFIG.CELL_SIZE,
      CONFIG.CELL_SIZE,
      CONFIG.CELL_SIZE
    );
  }
}

function drawBuildings(ctx) {
  for (const building of state.buildings) {
    drawBuilding(ctx, building);
  }
}

function drawBuilding(ctx, building) {
  const x = building.x * CONFIG.CELL_SIZE;
  const y = building.y * CONFIG.CELL_SIZE;
  const width = building.width * CONFIG.CELL_SIZE;
  const height = building.height * CONFIG.CELL_SIZE;

  // 如果有图片则绘制图片
  if (building.image) {
    const img = imageLoader.getImage(building.image);
    if (img) {
      ctx.drawImage(img, x, y, width, height);
    } else {
      // 图片加载中或未找到，绘制占位符
      drawBuildingPlaceholder(ctx, building, x, y, width, height);
    }
  } else {
    // 无图片，绘制占位符
    drawBuildingPlaceholder(ctx, building, x, y, width, height);
  }

  // 绘制名称标签
  ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
  const nameWidth = ctx.measureText(building.name).width + 10;
  ctx.fillRect(x + (width - nameWidth) / 2, y - 20, nameWidth, 18);

  ctx.fillStyle = '#fff';
  ctx.font = '10px sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText(building.name, x + width / 2, y - 7);

  // 绘制障碍物指示
  if (building.obstacle) {
    ctx.fillStyle = '#e74c3c';
    ctx.beginPath();
    ctx.arc(x + width - 8, y + 8, 5, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#fff';
    ctx.lineWidth = 1;
    ctx.stroke();
  }
}

function drawBuildingPlaceholder(ctx, building, x, y, width, height) {
  // 主体
  ctx.fillStyle = building.obstacle ? 'rgba(231, 76, 60, 0.3)' : 'rgba(46, 204, 113, 0.3)';
  ctx.fillRect(x, y, width, height);

  // 边框
  ctx.strokeStyle = building.obstacle ? '#e74c3c' : '#2ecc71';
  ctx.lineWidth = 2;
  ctx.strokeRect(x, y, width, height);

  // ID 标签
  ctx.fillStyle = 'rgba(255, 255, 255, 0.9)';
  ctx.font = 'bold 12px sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(building.id, x + width / 2, y + height / 2);
}

function drawSelection(ctx, building) {
  const x = building.x * CONFIG.CELL_SIZE;
  const y = building.y * CONFIG.CELL_SIZE;
  const width = building.width * CONFIG.CELL_SIZE;
  const height = building.height * CONFIG.CELL_SIZE;

  // 选中框
  ctx.strokeStyle = '#667eea';
  ctx.lineWidth = 3;
  ctx.strokeRect(x - 2, y - 2, width + 4, height + 4);

  // 四个角的控制点
  const corners = [
    { x: x - 4, y: y - 4 },
    { x: x + width, y: y - 4 },
    { x: x - 4, y: y + height },
    { x: x + width, y: y + height }
  ];

  ctx.fillStyle = '#667eea';
  for (const corner of corners) {
    ctx.fillRect(corner.x, corner.y, 8, 8);
  }
}

// ========== 交互处理 ==========
function handleMouseDown(e) {
  const rect = elements.canvas.getBoundingClientRect();
  const x = (e.clientX - rect.left - state.offsetX) / state.zoom;
  const y = (e.clientY - rect.top - state.offsetY) / state.zoom;

  const gridX = Math.floor(x / CONFIG.CELL_SIZE);
  const gridY = Math.floor(y / CONFIG.CELL_SIZE);

  // 查找点击的建筑
  const clickedBuilding = state.buildings.find(b =>
    gridX >= b.x && gridX < b.x + b.width &&
    gridY >= b.y && gridY < b.y + b.height
  );

  if (clickedBuilding) {
    state.selectedBuilding = clickedBuilding;
    state.isDragging = true;
    state.dragStartX = gridX - clickedBuilding.x;
    state.dragStartY = gridY - clickedBuilding.y;
    renderBuildingList();
    renderProperties();
  } else {
    state.selectedBuilding = null;
    state.isDragging = true;
    state.dragStartX = x;
    state.dragStartY = y;
    renderBuildingList();
    renderProperties();
  }
}

function handleMouseMove(e) {
  const rect = elements.canvas.getBoundingClientRect();
  const x = (e.clientX - rect.left - state.offsetX) / state.zoom;
  const y = (e.clientY - rect.top - state.offsetY) / state.zoom;

  const gridX = Math.floor(x / CONFIG.CELL_SIZE);
  const gridY = Math.floor(y / CONFIG.CELL_SIZE);

  // 更新提示
  const hoveredBuilding = state.buildings.find(b =>
    gridX >= b.x && gridX < b.x + b.width &&
    gridY >= b.y && gridY < b.y + b.height
  );

  if (hoveredBuilding) {
    elements.tooltip.classList.remove('hidden');
    clearElement(elements.tooltip);
    appendTextElement(elements.tooltip, 'strong', hoveredBuilding.name);
    elements.tooltip.appendChild(document.createElement('br'));
    appendTooltipLine(elements.tooltip, `ID: ${hoveredBuilding.id}`);
    appendTooltipLine(elements.tooltip, `尺寸: ${hoveredBuilding.width}×${hoveredBuilding.height}`);
    elements.tooltip.appendChild(document.createTextNode(
      hoveredBuilding.obstacle ? '🔒 障碍物' : '✓ 可通过',
    ));
    elements.tooltip.style.left = (e.clientX + 10) + 'px';
    elements.tooltip.style.top = (e.clientY + 10) + 'px';
  } else {
    elements.tooltip.classList.add('hidden');
  }

  // 拖拽移动
  if (state.isDragging && state.selectedBuilding) {
    const newX = Math.max(0, Math.min(CONFIG.WORLD_WIDTH - state.selectedBuilding.width, gridX - state.dragStartX));
    const newY = Math.max(0, Math.min(CONFIG.WORLD_HEIGHT - state.selectedBuilding.height, gridY - state.dragStartY));

    state.selectedBuilding.x = newX;
    state.selectedBuilding.y = newY;

    renderProperties();
    saveBuildingsToStorage();
  } else if (state.isDragging) {
    // 平移画布
    state.offsetX += e.movementX;
    state.offsetY += e.movementY;
    applyTransform();
  }
}

function handleMouseUp() {
  state.isDragging = false;
}

function handleWheel(e) {
  e.preventDefault();
  const delta = e.deltaY > 0 ? -CONFIG.ZOOM_STEP : CONFIG.ZOOM_STEP;
  zoom(delta);
}

// ========== 建筑操作 ==========
function showNewBuildingModal() {
  elements.newBuildingModal?.classList.remove('hidden');
  state.tempImageData = null;
  elements.imagePreview?.classList.add('hidden');
  elements.newBuildingForm?.reset();
}

function hideNewBuildingModal() {
  elements.newBuildingModal?.classList.add('hidden');
  state.tempImageData = null;
}

function handleCreateBuilding(e) {
  e.preventDefault();

  const id = document.getElementById('building-id').value.trim();
  const name = document.getElementById('building-name').value.trim();
  const width = parseInt(document.getElementById('building-width').value) || 3;
  const height = parseInt(document.getElementById('building-height').value) || 3;
  const obstacle = document.getElementById('building-obstacle').checked;
  const description = document.getElementById('building-description').value.trim();

  // 检查ID是否重复
  if (state.buildings.some(b => b.id === id)) {
    alert('建筑 ID 已存在，请使用其他 ID');
    return;
  }

  // 找到空位放置建筑
  const position = findEmptySpace(width, height);

  const building = {
    id,
    name,
    image: state.tempImageData,
    width,
    height,
    x: position.x,
    y: position.y,
    obstacle,
    description
  };

  state.buildings.push(building);
  state.selectedBuilding = building;

  hideNewBuildingModal();
  renderBuildingList();
  renderProperties();
  saveBuildingsToStorage();

  showHint(`建筑 "${name}" 创建成功`);
}

function findEmptySpace(width, height) {
  // 简单算法：从中心向外找空位
  const centerX = Math.floor(CONFIG.WORLD_WIDTH / 2);
  const centerY = Math.floor(CONFIG.WORLD_HEIGHT / 2);

  for (let radius = 5; radius < Math.max(CONFIG.WORLD_WIDTH, CONFIG.WORLD_HEIGHT); radius += 2) {
    for (let x = centerX - radius; x <= centerX + radius; x += 2) {
      for (let y = centerY - radius; y <= centerY + radius; y += 2) {
        if (isSpaceEmpty(x, y, width, height)) {
          return { x: Math.max(0, x), y: Math.max(0, y) };
        }
      }
    }
  }

  return { x: 0, y: 0 };
}

function isSpaceEmpty(x, y, width, height) {
  // 检查边界
  if (x < 0 || y < 0 || x + width > CONFIG.WORLD_WIDTH || y + height > CONFIG.WORLD_HEIGHT) {
    return false;
  }

  // 检查与其他建筑重叠
  for (const building of state.buildings) {
    if (
      x < building.x + building.width &&
      x + width > building.x &&
      y < building.y + building.height &&
      y + height > building.y
    ) {
      return false;
    }
  }

  return true;
}

function showEditBuildingModal(building) {
  if (!building) return;

  document.getElementById('edit-building-original-id').value = building.id;
  document.getElementById('edit-building-id').value = building.id;
  document.getElementById('edit-building-name').value = building.name;
  document.getElementById('edit-building-width').value = building.width;
  document.getElementById('edit-building-height').value = building.height;
  document.getElementById('edit-building-obstacle').checked = building.obstacle;
  document.getElementById('edit-building-description').value = building.description || '';

  // 显示图片预览
  if (building.image) {
    elements.editImagePreview.src = building.image;
    elements.editImagePreview.classList.remove('hidden');
  } else {
    elements.editImagePreview.classList.add('hidden');
  }

  elements.editBuildingModal?.classList.remove('hidden');
}

function hideEditBuildingModal() {
  elements.editBuildingModal?.classList.add('hidden');
}

function handleUpdateBuilding(e) {
  e.preventDefault();

  const originalId = document.getElementById('edit-building-original-id').value;
  const building = state.buildings.find(b => b.id === originalId);

  if (!building) return;

  const newId = document.getElementById('edit-building-id').value.trim();

  // 检查ID是否与其他建筑重复
  if (newId !== originalId && state.buildings.some(b => b.id === newId)) {
    alert('建筑 ID 已存在，请使用其他 ID');
    return;
  }

  building.id = newId;
  building.name = document.getElementById('edit-building-name').value.trim();
  building.width = parseInt(document.getElementById('edit-building-width').value) || 3;
  building.height = parseInt(document.getElementById('edit-building-height').value) || 3;
  building.obstacle = document.getElementById('edit-building-obstacle').checked;
  building.description = document.getElementById('edit-building-description').value.trim();

  // 确保新尺寸不会导致重叠
  if (!isSpaceEmptyForUpdate(building)) {
    alert('新尺寸会导致与其他建筑重叠，请调整位置或尺寸');
    return;
  }

  hideEditBuildingModal();
  renderBuildingList();
  renderProperties();
  saveBuildingsToStorage();

  showHint(`建筑 "${building.name}" 更新成功`);
}

function isSpaceEmptyForUpdate(building) {
  for (const other of state.buildings) {
    if (other.id === building.id) continue;

    if (
      building.x < other.x + other.width &&
      building.x + building.width > other.x &&
      building.y < other.y + other.height &&
      building.y + building.height > other.y
    ) {
      return false;
    }
  }
  return true;
}

function handleDeleteBuilding() {
  const originalId = document.getElementById('edit-building-original-id').value;
  const building = state.buildings.find(b => b.id === originalId);

  if (!building) return;

  if (confirm(`确定要删除建筑 "${building.name}" 吗？`)) {
    state.buildings = state.buildings.filter(b => b.id !== originalId);
    state.selectedBuilding = null;

    hideEditBuildingModal();
    renderBuildingList();
    renderProperties();
    saveBuildingsToStorage();

    showHint('建筑已删除');
  }
}

// ========== 图片处理 ==========
function handleDragOver(e) {
  e.preventDefault();
  elements.imageUploadArea?.classList.add('dragover');
}

function handleDragLeave(e) {
  e.preventDefault();
  elements.imageUploadArea?.classList.remove('dragover');
}

function handleDrop(e) {
  e.preventDefault();
  elements.imageUploadArea?.classList.remove('dragover');

  const files = e.dataTransfer.files;
  if (files.length > 0) {
    processImageFile(files[0]);
  }
}

function handleImageSelect(e) {
  const file = e.target.files[0];
  if (file) {
    processImageFile(file);
  }
}

function handleEditImageSelect(e) {
  const file = e.target.files[0];
  if (file) {
    processEditImageFile(file);
  }
}

function processImageFile(file) {
  if (!file.type.startsWith('image/')) {
    alert('请选择图片文件');
    return;
  }

  const reader = new FileReader();
  reader.onload = (e) => {
    state.tempImageData = e.target.result;
    elements.imagePreview.src = e.target.result;
    elements.imagePreview.classList.remove('hidden');
  };
  reader.readAsDataURL(file);
}

function processEditImageFile(file) {
  if (!file.type.startsWith('image/')) {
    alert('请选择图片文件');
    return;
  }

  const reader = new FileReader();
  reader.onload = (e) => {
    const originalId = document.getElementById('edit-building-original-id').value;
    const building = state.buildings.find(b => b.id === originalId);
    if (building) {
      building.image = e.target.result;
      elements.editImagePreview.src = e.target.result;
      elements.editImagePreview.classList.remove('hidden');
    }
  };
  reader.readAsDataURL(file);
}

// ========== 导入/导出 ==========
function exportBuildings() {
  const data = {
    version: '1.0',
    exportTime: new Date().toISOString(),
    buildings: state.buildings
  };

  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);

  const a = document.createElement('a');
  a.href = url;
  a.download = `ai-town-buildings-${Date.now()}.json`;
  a.click();

  URL.revokeObjectURL(url);
  showHint('建筑配置已导出');
}

function importBuildings(e) {
  const file = e.target.files[0];
  if (!file) return;

  const reader = new FileReader();
  reader.onload = (e) => {
    try {
      const data = JSON.parse(e.target.result);

      if (data.buildings && Array.isArray(data.buildings)) {
        if (confirm(`导入将替换当前所有建筑 (${state.buildings.length}个 → ${data.buildings.length}个)，确定继续？`)) {
          state.buildings = data.buildings;
          state.selectedBuilding = null;
          renderBuildingList();
          renderProperties();
          saveBuildingsToStorage();
          showHint(`成功导入 ${data.buildings.length} 个建筑`);
        }
      } else {
        alert('无效的配置文件格式');
      }
    } catch (err) {
      alert('导入失败：' + err.message);
    }
  };
  reader.readAsText(file);

  // 重置 input
  e.target.value = '';
}

// ========== 视图控制 ==========
function toggleGrid() {
  state.showGrid = !state.showGrid;
  elements.btnGrid?.classList.toggle('active', state.showGrid);
}

function zoom(delta) {
  const newZoom = Math.max(CONFIG.MIN_ZOOM, Math.min(CONFIG.MAX_ZOOM, state.zoom + delta));
  state.zoom = newZoom;
  applyTransform();
}

function resetView() {
  state.zoom = 1;
  centerCanvas();
  applyTransform();
}

function applyTransform() {
  if (elements.canvas) {
    elements.canvas.style.transform = `translate(${state.offsetX}px, ${state.offsetY}px) scale(${state.zoom})`;
  }
}

// ========== UI 渲染 ==========
function createFallbackBuildingIcon(id) {
  const firstChar = String(id ?? '').trim().charAt(0).toUpperCase();
  const label = /^[A-Z0-9]$/.test(firstChar) ? firstChar : '?';
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32"><rect fill="#667eea" width="32" height="32"/><text x="16" y="20" text-anchor="middle" fill="white" font-size="12">${label}</text></svg>`;
  return `data:image/svg+xml,${encodeURIComponent(svg)}`;
}

function appendTooltipLine(container, text) {
  container.appendChild(document.createTextNode(text));
  container.appendChild(document.createElement('br'));
}

function renderBuildingList() {
  if (!elements.buildingList) return;
  clearElement(elements.buildingList);

  if (state.buildings.length === 0) {
    appendTextElement(elements.buildingList, 'div', '暂无建筑，点击新建添加', 'empty-state');
    return;
  }

  for (const building of state.buildings) {
    const item = document.createElement('div');
    item.className = 'building-item';
    if (state.selectedBuilding?.id === building.id) {
      item.classList.add('selected');
    }
    item.dataset.id = String(building.id ?? '');

    const status = document.createElement('div');
    status.className = `building-item-${building.obstacle ? 'obstacle' : 'passable'}`;
    item.appendChild(status);

    const image = document.createElement('img');
    image.className = 'building-item-icon';
    image.src = building.image || createFallbackBuildingIcon(building.id);
    image.alt = '';
    item.appendChild(image);

    const info = document.createElement('div');
    info.className = 'building-item-info';
    appendTextElement(info, 'div', building.name, 'building-item-name');
    appendTextElement(info, 'div', building.id, 'building-item-id');
    appendTextElement(info, 'div', `${building.width}×${building.height}`, 'building-item-size');
    item.appendChild(info);

    item.addEventListener('click', () => {
      if (building) {
        state.selectedBuilding = building;
        renderBuildingList();
        renderProperties();
      }
    });

    item.addEventListener('dblclick', () => {
      showEditBuildingModal(building);
    });
    elements.buildingList.appendChild(item);
  }
}

function appendPropertyGroup(label, value, renderValue) {
  const group = document.createElement('div');
  group.className = 'property-group';
  appendTextElement(group, 'label', label);

  if (renderValue) {
    const valueEl = document.createElement('div');
    valueEl.className = 'property-value';
    renderValue(valueEl);
    group.appendChild(valueEl);
  } else {
    appendTextElement(group, 'div', value, 'property-value');
  }

  elements.propertiesContent.appendChild(group);
  return group;
}

function renderProperties() {
  if (!elements.propertiesContent) return;
  clearElement(elements.propertiesContent);

  if (!state.selectedBuilding) {
    appendTextElement(elements.propertiesContent, 'div', '在画布上选择建筑进行编辑', 'empty-state');
    return;
  }

  const b = state.selectedBuilding;
  appendPropertyGroup('ID', b.id);
  appendPropertyGroup('名称', b.name);
  appendPropertyGroup('位置', `X: ${b.x}, Y: ${b.y}`);
  appendPropertyGroup('尺寸', `${b.width} × ${b.height} 格`);
  appendPropertyGroup('障碍物', null, (valueEl) => {
    const indicator = document.createElement('span');
    indicator.className = `color-indicator ${b.obstacle ? 'color-obstacle' : 'color-passable'}`;
    valueEl.appendChild(indicator);
    valueEl.appendChild(document.createTextNode(
      b.obstacle ? '是（人物无法通过）' : '否（人物可以通过）',
    ));
  });
  if (b.description) {
    appendPropertyGroup('描述', b.description);
  }

  const actionGroup = document.createElement('div');
  actionGroup.className = 'property-group';
  const editButton = document.createElement('button');
  editButton.className = 'btn btn-block';
  editButton.id = 'btn-edit-selected';
  editButton.textContent = '✏️ 编辑详情';
  actionGroup.appendChild(editButton);
  elements.propertiesContent.appendChild(actionGroup);

  editButton.addEventListener('click', () => {
    showEditBuildingModal(state.selectedBuilding);
  });
}

function showHint(message) {
  // 移除旧提示
  const oldHint = document.querySelector('.editor-hint');
  if (oldHint) oldHint.remove();

  // 创建新提示
  const hint = document.createElement('div');
  hint.className = 'editor-hint';
  hint.textContent = message;
  document.body.appendChild(hint);

  // 3秒后自动消失
  setTimeout(() => {
    hint.style.opacity = '0';
    hint.style.transition = 'opacity 0.3s';
    setTimeout(() => hint.remove(), 300);
  }, 3000);
}

// ========== 存储 ==========
function saveBuildingsToStorage() {
  localStorage.setItem('ai-town-buildings', JSON.stringify(state.buildings));
}

function loadBuildingsFromStorage() {
  try {
    const data = localStorage.getItem('ai-town-buildings');
    if (data) {
      state.buildings = JSON.parse(data);
    }
  } catch (err) {
    console.error('加载建筑配置失败:', err);
    state.buildings = [];
  }
}

// ========== 启动 ==========
init();
