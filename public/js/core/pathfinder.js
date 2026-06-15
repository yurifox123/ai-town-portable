/**
 * A* 寻路算法实现
 * 用于Agent在2D网格世界中寻找最短路径
 */

class PathFinder {
  /**
   * 使用A*算法寻找路径
   * @param {Object} start - 起始位置 {x, y}
   * @param {Object} goal - 目标位置 {x, y}
   * @param {Function} isPassable - 检查位置是否可通行的函数 (x, y) => boolean
   * @param {number} maxIterations - 最大迭代次数（防止无限循环）
   * @returns {Array<{x, y}> | null} - 路径点数组，如果无法到达则返回null
   */
  static findPath(start, goal, isPassable, maxIterations = 1000) {
    // 如果起点就是终点
    if (start.x === goal.x && start.y === goal.y) {
      return [];
    }

    // 检查目标是否可通行
    if (!isPassable(goal.x, goal.y)) {
      // 尝试找到目标附近最近的可通行点
      const nearest = this.findNearestPassable(goal, isPassable, 5);
      if (nearest) {
        return this.findPath(start, nearest, isPassable, maxIterations);
      }
      return null;
    }

    // 开放列表（待探索的节点）
    const openSet = [];
    // 关闭列表（已探索的节点）
    const closedSet = new Set();
    // 节点信息映射
    const nodeMap = new Map();

    // 创建起始节点
    const startNode = {
      x: start.x,
      y: start.y,
      g: 0, // 从起点到该节点的实际代价
      h: this.heuristic(start, goal), // 估计代价（曼哈顿距离）
      f: 0, // 总代价 = g + h
      parent: null
    };
    startNode.f = startNode.g + startNode.h;

    openSet.push(startNode);
    nodeMap.set(`${start.x},${start.y}`, startNode);

    let iterations = 0;

    while (openSet.length > 0 && iterations < maxIterations) {
      iterations++;

      // 找到f值最小的节点
      let currentIndex = 0;
      for (let i = 1; i < openSet.length; i++) {
        if (openSet[i].f < openSet[currentIndex].f) {
          currentIndex = i;
        }
      }

      const current = openSet[currentIndex];

      // 到达目标
      if (current.x === goal.x && current.y === goal.y) {
        return this.reconstructPath(current);
      }

      // 移到关闭列表
      openSet.splice(currentIndex, 1);
      closedSet.add(`${current.x},${current.y}`);

      // 探索邻居（4方向：上、下、左、右）
      const neighbors = [
        { x: current.x + 1, y: current.y },
        { x: current.x - 1, y: current.y },
        { x: current.x, y: current.y + 1 },
        { x: current.x, y: current.y - 1 }
      ];

      for (const neighbor of neighbors) {
        const key = `${neighbor.x},${neighbor.y}`;

        // 已在关闭列表，跳过
        if (closedSet.has(key)) continue;

        // 不可通行，跳过
        if (!isPassable(neighbor.x, neighbor.y)) continue;

        // 计算从当前节点到邻居的代价
        const tentativeG = current.g + 1;

        let neighborNode = nodeMap.get(key);

        if (!neighborNode) {
          // 新节点
          neighborNode = {
            x: neighbor.x,
            y: neighbor.y,
            g: tentativeG,
            h: this.heuristic(neighbor, goal),
            f: 0,
            parent: current
          };
          neighborNode.f = neighborNode.g + neighborNode.h;
          nodeMap.set(key, neighborNode);
          openSet.push(neighborNode);
        } else if (tentativeG < neighborNode.g) {
          // 找到更好的路径
          neighborNode.g = tentativeG;
          neighborNode.f = neighborNode.g + neighborNode.h;
          neighborNode.parent = current;
        }
      }
    }

    // 超出最大迭代次数，未找到路径
    if (iterations >= maxIterations) {
      console.warn('A*寻路超出最大迭代次数，可能无法到达目标');
    }

    return null;
  }

  /**
   * 启发函数：曼哈顿距离
   */
  static heuristic(a, b) {
    return Math.abs(a.x - b.x) + Math.abs(a.y - b.y);
  }

  /**
   * 重建路径
   */
  static reconstructPath(node) {
    const path = [];
    let current = node;

    while (current.parent !== null) {
      path.unshift({ x: current.x, y: current.y });
      current = current.parent;
    }

    return path;
  }

  /**
   * 找到目标附近最近的可通行点
   */
  static findNearestPassable(target, isPassable, maxRadius = 5) {
    // 从半径1开始向外扩展搜索
    for (let r = 1; r <= maxRadius; r++) {
      const candidates = [];

      // 搜索该半径上的所有点
      for (let dx = -r; dx <= r; dx++) {
        for (let dy = -r; dy <= r; dy++) {
          // 只搜索边界（避免重复搜索内部）
          if (Math.abs(dx) === r || Math.abs(dy) === r) {
            const x = target.x + dx;
            const y = target.y + dy;
            if (isPassable(x, y)) {
              const distance = Math.abs(dx) + Math.abs(dy);
              candidates.push({ x, y, distance });
            }
          }
        }
      }

      // 按距离排序，返回最近的
      if (candidates.length > 0) {
        candidates.sort((a, b) => a.distance - b.distance);
        return { x: candidates[0].x, y: candidates[0].y };
      }
    }

    return null;
  }

  /**
   * 平滑路径（去除不必要的拐弯）
   */
  static smoothPath(path, isPassable) {
    if (path.length < 3) return path;

    const smoothed = [path[0]];
    let i = 0;

    while (i < path.length - 1) {
      // 尝试找到可以直接到达的最远点
      let furthest = i + 1;
      for (let j = path.length - 1; j > i + 1; j--) {
        if (this.hasLineOfSight(path[i], path[j], isPassable)) {
          furthest = j;
          break;
        }
      }
      smoothed.push(path[furthest]);
      i = furthest;
    }

    return smoothed;
  }

  /**
   * 检查两点之间是否有视线（直线可达）
   */
  static hasLineOfSight(from, to, isPassable) {
    // 使用Bresenham直线算法检查
    let x0 = from.x;
    let y0 = from.y;
    const x1 = to.x;
    const y1 = to.y;

    const dx = Math.abs(x1 - x0);
    const dy = Math.abs(y1 - y0);
    const sx = x0 < x1 ? 1 : -1;
    const sy = y0 < y1 ? 1 : -1;
    let err = dx - dy;

    while (true) {
      if (!isPassable(x0, y0)) {
        return false;
      }

      if (x0 === x1 && y0 === y1) {
        break;
      }

      const e2 = 2 * err;
      if (e2 > -dy) {
        err -= dy;
        x0 += sx;
      }
      if (e2 < dx) {
        err += dx;
        y0 += sy;
      }
    }

    return true;
  }
}

export default PathFinder;
