/**
 * 图片预加载器
 * 负责加载所有素材图片并提供统一的访问接口
 */

import { ASSET_CONFIG } from "./asset-config.js";

class ImageLoader {
  constructor() {
    this.images = new Map();
    this.loading = false;
    this.progress = 0;
    this.total = 0;
    this.loaded = 0;
  }

  /**
   * 加载单个图片
   * @param {string} path - 图片路径（相对于 basePath）
   * @returns {Promise<HTMLImageElement|null>}
   */
  loadImage(path) {
    return new Promise((resolve) => {
      const fullPath = `${ASSET_CONFIG.basePath}/${path}`;
      const img = new Image();

      img.onload = () => {
        this.images.set(fullPath, img);
        this.loaded++;
        this.updateProgress();
        resolve(img);
      };

      img.onerror = () => {
        console.warn(`图片加载失败：${fullPath}`);
        this.images.set(fullPath, null);
        this.loaded++;
        this.updateProgress();
        resolve(null);
      };

      img.src = fullPath;
    });
  }

  /**
   * 更新加载进度
   */
  updateProgress() {
    this.progress = this.total > 0 ? (this.loaded / this.total) * 100 : 0;
  }

  /**
   * 预加载所有配置的图片
   * @param {function(number)} onProgress - 进度回调函数 (0-100)
   * @returns {Promise<void>}
   */
  async preloadAll(onProgress) {
    this.loading = true;
    this.loaded = 0;

    // 收集所有需要加载的图片路径
    const imagePaths = [];

    // 角色图片（含动画帧）
    for (const key of Object.keys(ASSET_CONFIG.characters)) {
      const char = ASSET_CONFIG.characters[key];
      if (char?.sprite) imagePaths.push(char.sprite);
      if (char?.portrait) imagePaths.push(char.portrait);
      // 预加载动画帧
      if (char?.animation) {
        const { basePath, walkFrames, idleFrames } = char.animation;
        const directions = ["down", "up", "left", "right"];
        for (const dir of directions) {
          for (let i = 0; i < walkFrames; i++) {
            imagePaths.push(`${basePath}${key}-${dir}-walk-${i}.png`);
          }
          for (let i = 0; i < idleFrames; i++) {
            imagePaths.push(`${basePath}${key}-${dir}-idle-${i}.png`);
          }
        }
      }
    }

    // 地图背景图片
    if (ASSET_CONFIG.map?.image) {
      imagePaths.push(ASSET_CONFIG.map.image);
    }
    if (Array.isArray(ASSET_CONFIG.map?.pollutionStages)) {
      imagePaths.push(...ASSET_CONFIG.map.pollutionStages);
    }

    this.total = imagePaths.length;
    console.log(`开始加载 ${this.total} 张图片...`);

    // 并发加载所有图片
    const promises = imagePaths.map((path) => this.loadImage(path));
    await Promise.all(promises);

    this.loading = false;
    console.log(`图片加载完成，成功加载 ${this.loaded}/${this.total} 张`);

    if (onProgress) {
      onProgress(100);
    }
  }

  /**
   * 获取已加载的图片
   * @param {string} path - 图片路径
   * @returns {HTMLImageElement|null}
   */
  getImage(path) {
    const fullPath = path.startsWith("/")
      ? path
      : `${ASSET_CONFIG.basePath}/${path}`;
    return this.images.get(fullPath) || null;
  }

  /**
   * 检查图片是否已加载
   * @param {string} path - 图片路径
   * @returns {boolean}
   */
  isLoaded(path) {
    const fullPath = path.startsWith("/")
      ? path
      : `${ASSET_CONFIG.basePath}/${path}`;
    return this.images.has(fullPath) && this.images.get(fullPath) !== null;
  }

  /**
   * 获取加载进度
   * @returns {number} 0-100
   */
  getProgress() {
    return this.progress;
  }

  /**
   * 是否正在加载
   * @returns {boolean}
   */
  isLoading() {
    return this.loading;
  }
}

// 导出单例
export default new ImageLoader();
