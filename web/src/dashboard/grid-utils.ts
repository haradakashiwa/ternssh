export interface GridItem {
  i: string;
  x: number;
  y: number;
  w: number;
  h: number;
  minW?: number;
  minH?: number;
  maxW?: number;
  maxH?: number;
}

export interface GridMetrics {
  cols: number;
  rowHeight: number;
  margin: [number, number];
  containerWidth: number;
}

export interface ItemRect {
  left: number;
  top: number;
  width: number;
  height: number;
}

export interface GridSteps {
  colWidth: number;
  stepX: number;
  stepY: number;
  marginX: number;
  marginY: number;
}

export function gridSteps(metrics: GridMetrics): GridSteps {
  const [marginX, marginY] = metrics.margin;
  const colWidth =
    (metrics.containerWidth - marginX * (metrics.cols - 1)) / metrics.cols;
  return {
    colWidth,
    stepX: colWidth + marginX,
    stepY: metrics.rowHeight + marginY,
    marginX,
    marginY,
  };
}

export function colWidth(metrics: GridMetrics): number {
  return gridSteps(metrics).colWidth;
}

export function itemRect(metrics: GridMetrics, item: GridItem): ItemRect {
  const { colWidth: cw, stepX, stepY, marginX, marginY } = gridSteps(metrics);
  return {
    left: item.x * stepX,
    top: item.y * stepY,
    width: item.w * cw + Math.max(0, item.w - 1) * marginX,
    height: item.h * metrics.rowHeight + Math.max(0, item.h - 1) * marginY,
  };
}

export function snapItemFromPixels(
  layout: GridItem[],
  itemId: string,
  left: number,
  top: number,
  metrics: GridMetrics,
): GridItem[] {
  const item = layout.find((entry) => entry.i === itemId);
  if (!item) return layout;

  const { x, y } = pixelPositionToGrid(left, top, item, metrics);
  return resolveLayoutWithDodge(layout, itemId, x, y, metrics.cols);
}

export function pixelPositionToGrid(
  left: number,
  top: number,
  item: GridItem,
  metrics: GridMetrics,
): { x: number; y: number } {
  const { stepX, stepY } = gridSteps(metrics);
  let x = Math.round(left / stepX);
  let y = Math.round(top / stepY);
  x = clamp(x, 0, Math.max(0, metrics.cols - item.w));
  y = Math.max(0, y);
  return { x, y };
}

export function resolveLayoutWithDodge(
  layout: GridItem[],
  movedId: string,
  targetX: number,
  targetY: number,
  cols: number,
): GridItem[] {
  const moved = layout.find((entry) => entry.i === movedId);
  if (!moved) return layout;

  const items = layout.map((entry) =>
    entry.i === movedId
      ? clampItem({ ...entry, x: targetX, y: targetY }, cols)
      : { ...entry },
  );

  return pushCollidingItems(items, movedId, cols);
}

function pushCollidingItems(
  layout: GridItem[],
  pinnedId: string,
  cols: number,
): GridItem[] {
  const maxIterations = layout.length * layout.length * 8;
  let items = layout.map((entry) => ({ ...entry }));

  for (let iter = 0; iter < maxIterations; iter++) {
    let changed = false;
    const pinned = items.find((entry) => entry.i === pinnedId);
    if (!pinned) break;

    const order = items
      .filter((entry) => entry.i !== pinnedId)
      .sort((a, b) => {
        const aPinned = collides(a, pinned);
        const bPinned = collides(b, pinned);
        if (aPinned !== bPinned) return aPinned ? -1 : 1;
        return a.y - b.y || a.x - b.x;
      });

    for (const item of order) {
      const index = items.findIndex((entry) => entry.i === item.i);
      const current = items[index];
      const colliders = items.filter(
        (other) => other.i !== current.i && collides(current, other),
      );
      if (colliders.length === 0) continue;

      const blocker =
        colliders.find((other) => other.i === pinnedId) ?? colliders[0];
      const dodged = findDodgePosition(current, blocker, items, cols);
      if (dodged.x !== current.x || dodged.y !== current.y) {
        items[index] = dodged;
        changed = true;
      }
    }

    if (!changed) break;
  }

  return items.map((entry) => clampItem(entry, cols));
}

function findDodgePosition(
  item: GridItem,
  blocker: GridItem,
  allItems: GridItem[],
  cols: number,
): GridItem {
  const others = allItems.filter((other) => other.i !== item.i);

  for (const { x, y } of dodgeCandidates(item, blocker)) {
    const candidate = clampItem({ ...item, x, y }, cols);
    if (!collidesAny(candidate, others)) {
      return candidate;
    }
  }

  let y = item.y;
  for (let step = 0; step < 200; step++) {
    const candidate = clampItem({ ...item, y }, cols);
    if (!collidesAny(candidate, others)) {
      return candidate;
    }
    y += 1;
  }

  return clampItem(item, cols);
}

function dodgeCandidates(
  item: GridItem,
  blocker: GridItem,
): Array<{ x: number; y: number }> {
  const down = { x: item.x, y: blocker.y + blocker.h };
  const up = { x: item.x, y: blocker.y - item.h };
  const right = { x: blocker.x + blocker.w, y: item.y };
  const left = { x: blocker.x - item.w, y: item.y };

  const itemCx = item.x + item.w / 2;
  const itemCy = item.y + item.h / 2;
  const blockerCx = blocker.x + blocker.w / 2;
  const blockerCy = blocker.y + blocker.h / 2;
  const dx = itemCx - blockerCx;
  const dy = itemCy - blockerCy;

  if (Math.abs(dx) >= Math.abs(dy)) {
    return dx >= 0 ? [right, down, up, left] : [left, down, up, right];
  }

  return dy >= 0 ? [down, right, left, up] : [up, right, left, down];
}

export function snapItemSizeFromPixels(
  layout: GridItem[],
  itemId: string,
  width: number,
  height: number,
  metrics: GridMetrics,
): GridItem[] {
  const item = layout.find((entry) => entry.i === itemId);
  if (!item) return layout;

  const { stepX, stepY, marginX, marginY } = gridSteps(metrics);
  const w = clamp(
    Math.round((width + marginX) / stepX),
    item.minW ?? 1,
    item.maxW ?? metrics.cols,
  );
  const h = clamp(
    Math.round((height + marginY) / stepY),
    item.minH ?? 1,
    item.maxH ?? 9999,
  );

  return layout.map((entry) =>
    entry.i === itemId
      ? clampItem({ ...entry, w, h }, metrics.cols)
      : entry,
  );
}

export function clampItem(item: GridItem, cols: number): GridItem {
  const minW = item.minW ?? 1;
  const minH = item.minH ?? 1;
  const maxW = item.maxW ?? cols;
  const maxH = item.maxH ?? 9999;
  const w = clamp(item.w, minW, maxW);
  const h = clamp(item.h, minH, maxH);
  const x = clamp(item.x, 0, Math.max(0, cols - w));
  const y = clamp(item.y, 0, 9999);
  return { ...item, x, y, w, h };
}

function collidesAny(item: GridItem, others: GridItem[]): boolean {
  return others.some((other) => collides(item, other));
}

function collides(a: GridItem, b: GridItem): boolean {
  if (a.i === b.i) return false;
  return !(
    a.x + a.w <= b.x ||
    b.x + b.w <= a.x ||
    a.y + a.h <= b.y ||
    b.y + b.h <= a.y
  );
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

export function layoutsEqual(a: GridItem[], b: GridItem[]): boolean {
  if (a.length !== b.length) return false;
  const byId = new Map(b.map((item) => [item.i, item]));
  return a.every((item) => {
    const other = byId.get(item.i);
    if (!other) return false;
    return (
      item.x === other.x &&
      item.y === other.y &&
      item.w === other.w &&
      item.h === other.h
    );
  });
}

export function containerHeight(metrics: GridMetrics, layout: GridItem[]): number {
  if (layout.length === 0) return metrics.rowHeight * 4;
  const { stepY } = gridSteps(metrics);
  const maxRow = Math.max(...layout.map((item) => item.y + item.h));
  return maxRow * stepY + metrics.margin[1];
}

export function containerHeightFromPixels(
  metrics: GridMetrics,
  layout: GridItem[],
  dragTop: number | null,
  dragHeight: number | null,
  resizeHeight: number | null,
): number {
  const base = containerHeight(metrics, layout);
  const pixelBottom = Math.max(
    base,
    dragTop !== null && dragHeight !== null ? dragTop + dragHeight + metrics.margin[1] : 0,
    resizeHeight !== null ? resizeHeight + metrics.margin[1] : 0,
  );
  return pixelBottom;
}

export function findWidgetPlacement(
  layout: GridItem[],
  size: { w: number; h: number },
  cols = 12,
): { x: number; y: number } {
  for (let y = 0; y < 200; y++) {
    for (let x = 0; x <= cols - size.w; x++) {
      const candidate: GridItem = {
        i: "__candidate__",
        x,
        y,
        w: size.w,
        h: size.h,
      };
      if (!collidesAny(candidate, layout)) {
        return { x, y };
      }
    }
  }

  const maxY = layout.reduce((max, item) => Math.max(max, item.y + item.h), 0);
  return { x: 0, y: maxY };
}
