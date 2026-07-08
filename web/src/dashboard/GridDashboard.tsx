import {
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from "react";
import { GripVertical } from "lucide-react";
import {
  containerHeightFromPixels,
  gridSteps,
  itemRect,
  snapItemFromPixels,
  snapItemSizeFromPixels,
  type GridItem,
  type GridMetrics,
} from "./grid-utils";
import { useT } from "@/i18n";

interface GridDashboardProps {
  layout: GridItem[];
  cols?: number;
  rowHeight?: number;
  margin?: [number, number];
  onLayoutChange: (layout: GridItem[]) => void;
  getItemTitle: (item: GridItem) => string;
  renderHandleActions?: (item: GridItem) => ReactNode;
  renderItem: (item: GridItem) => ReactNode;
}

type Interaction =
  | { kind: "idle" }
  | {
      kind: "drag";
      id: string;
      startX: number;
      startY: number;
      originLeft: number;
      originTop: number;
      pointerId: number;
    }
  | {
      kind: "resize";
      id: string;
      startX: number;
      startY: number;
      originWidth: number;
      originHeight: number;
      pointerId: number;
    };

interface PixelDrag {
  id: string;
  left: number;
  top: number;
}

interface PixelResize {
  id: string;
  width: number;
  height: number;
}

export function GridDashboard({
  layout,
  cols = 12,
  rowHeight = 40,
  margin = [12, 12],
  onLayoutChange,
  getItemTitle,
  renderHandleActions,
  renderItem,
}: GridDashboardProps) {
  const t = useT();
  const containerRef = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(0);
  const [interaction, setInteraction] = useState<Interaction>({ kind: "idle" });
  const [pixelDrag, setPixelDrag] = useState<PixelDrag | null>(null);
  const [pixelResize, setPixelResize] = useState<PixelResize | null>(null);
  const [previewLayout, setPreviewLayout] = useState<GridItem[] | null>(null);
  const layoutRef = useRef(layout);
  const interactionRef = useRef(interaction);
  const pixelDragRef = useRef(pixelDrag);
  const pixelResizeRef = useRef(pixelResize);
  const metricsRef = useRef<GridMetrics>({
    cols,
    rowHeight,
    margin,
    containerWidth: 0,
  });

  layoutRef.current = layout;
  interactionRef.current = interaction;
  pixelDragRef.current = pixelDrag;
  pixelResizeRef.current = pixelResize;
  metricsRef.current = { cols, rowHeight, margin, containerWidth: width };

  useEffect(() => {
    const node = containerRef.current;
    if (!node) return;

    const update = () => setWidth(node.clientWidth);
    update();

    const observer = new ResizeObserver(update);
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (interaction.kind === "idle") return;

    const onMove = (event: PointerEvent) => {
      const currentInteraction = interactionRef.current;
      if (currentInteraction.kind === "idle") return;
      if (event.pointerId !== currentInteraction.pointerId) return;

      const metrics = metricsRef.current;
      if (metrics.containerWidth <= 0) return;

      const dx = event.clientX - currentInteraction.startX;
      const dy = event.clientY - currentInteraction.startY;

      if (currentInteraction.kind === "drag") {
        const dragLeft = currentInteraction.originLeft + dx;
        const dragTop = Math.max(0, currentInteraction.originTop + dy);
        setPixelDrag({
          id: currentInteraction.id,
          left: dragLeft,
          top: dragTop,
        });
        setPreviewLayout(
          snapItemFromPixels(
            layoutRef.current,
            currentInteraction.id,
            dragLeft,
            dragTop,
            metrics,
          ),
        );
        return;
      }

      const { colWidth: cw } = gridSteps(metrics);
      setPixelResize({
        id: currentInteraction.id,
        width: Math.max(cw, currentInteraction.originWidth + dx),
        height: Math.max(
          rowHeight,
          currentInteraction.originHeight + dy,
        ),
      });
    };

    const onUp = (event: PointerEvent) => {
      const currentInteraction = interactionRef.current;
      if (currentInteraction.kind === "idle") return;
      if (event.pointerId !== currentInteraction.pointerId) return;

      const metrics = metricsRef.current;
      const current = layoutRef.current;
      let next = current;

      if (currentInteraction.kind === "drag") {
        const drag = pixelDragRef.current;
        if (drag) {
          next = snapItemFromPixels(
            current,
            currentInteraction.id,
            drag.left,
            drag.top,
            metrics,
          );
        }
      }

      if (currentInteraction.kind === "resize") {
        const resize = pixelResizeRef.current;
        if (resize) {
          next = snapItemSizeFromPixels(
            current,
            currentInteraction.id,
            resize.width,
            resize.height,
            metrics,
          );
        }
      }

      onLayoutChange(next);
      setPixelDrag(null);
      setPixelResize(null);
      setPreviewLayout(null);
      setInteraction({ kind: "idle" });
      interactionRef.current = { kind: "idle" };
    };

    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onUp);
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onUp);
    };
  }, [interaction.kind, onLayoutChange, rowHeight]);

  const startDrag = (item: GridItem, event: ReactPointerEvent<HTMLElement>) => {
    if (event.button !== 0) return;
    event.preventDefault();
    event.stopPropagation();

    const metrics = metricsRef.current;
    const rect = itemRect(metrics, item);
    const next: Interaction = {
      kind: "drag",
      id: item.i,
      startX: event.clientX,
      startY: event.clientY,
      originLeft: rect.left,
      originTop: rect.top,
      pointerId: event.pointerId,
    };
    setPixelDrag({ id: item.i, left: rect.left, top: rect.top });
    setPreviewLayout(null);
    setInteraction(next);
    interactionRef.current = next;
  };

  const startResize = (item: GridItem, event: ReactPointerEvent<HTMLElement>) => {
    if (event.button !== 0) return;
    event.preventDefault();
    event.stopPropagation();

    const metrics = metricsRef.current;
    const rect = itemRect(metrics, item);
    const next: Interaction = {
      kind: "resize",
      id: item.i,
      startX: event.clientX,
      startY: event.clientY,
      originWidth: rect.width,
      originHeight: rect.height,
      pointerId: event.pointerId,
    };
    setPixelResize({ id: item.i, width: rect.width, height: rect.height });
    setInteraction(next);
    interactionRef.current = next;
  };

  const metrics: GridMetrics = { cols, rowHeight, margin, containerWidth: width };

  if (width <= 0) {
    return <div ref={containerRef} className="grid-dashboard-host" />;
  }

  const activeLayout = previewLayout ?? layout;
  const { colWidth: cw, stepX, stepY, marginX, marginY } = gridSteps(metrics);
  const dragItem = pixelDrag
    ? activeLayout.find((item) => item.i === pixelDrag.id)
    : null;
  const dragHeight =
    dragItem && pixelDrag ? itemRect(metrics, dragItem).height : null;
  const contentHeight = containerHeightFromPixels(
    metrics,
    activeLayout,
    pixelDrag?.top ?? null,
    dragHeight,
    pixelResize?.height ?? null,
  );

  const hostStyle: CSSProperties = {
    minHeight: "100%",
    height: contentHeight,
    ["--grid-step-x" as string]: `${stepX}px`,
    ["--grid-step-y" as string]: `${stepY}px`,
    ["--grid-col-width" as string]: `${cw}px`,
    ["--grid-row-height" as string]: `${rowHeight}px`,
    ["--grid-margin-x" as string]: `${marginX}px`,
    ["--grid-margin-y" as string]: `${marginY}px`,
  };

  return (
    <div ref={containerRef} className="grid-dashboard-host" style={hostStyle}>
      <div className="grid-dashboard-dots" aria-hidden />
      {layout.map((item) => {
        const gridItem =
          activeLayout.find((entry) => entry.i === item.i) ?? item;
        const rect = itemRect(metrics, gridItem);
        const isDragging = pixelDrag?.id === item.i;
        const isResizing = pixelResize?.id === item.i;
        const isDodging = previewLayout !== null && !isDragging && !isResizing;

        const left = isDragging ? pixelDrag.left : rect.left;
        const top = isDragging ? pixelDrag.top : rect.top;
        const widthPx = isResizing ? pixelResize.width : rect.width;
        const heightPx = isResizing ? pixelResize.height : rect.height;

        return (
          <div
            key={item.i}
            className="grid-dashboard-item"
            style={{
              width: widthPx,
              height: heightPx,
              transform: `translate(${left}px, ${top}px)`,
            }}
            data-dragging={isDragging || undefined}
            data-resizing={isResizing || undefined}
            data-dodging={isDodging || undefined}
          >
            <div className="widget-drag-handle">
              <button
                type="button"
                className="widget-drag-grip"
                onPointerDown={(event) => startDrag(item, event)}
                aria-label={t("grid.dragMove")}
              >
                <GripVertical className="h-3.5 w-3.5 text-[var(--color-muted-foreground)]" />
              </button>
              <span className="widget-drag-label">{getItemTitle(item)}</span>
              {renderHandleActions && (
                <div
                  className="widget-drag-actions widget-no-drag"
                  onPointerDown={(event) => event.stopPropagation()}
                >
                  {renderHandleActions(item)}
                </div>
              )}
            </div>
            <div className="widget-body">{renderItem(item)}</div>
            <div
              className="widget-resize-handle widget-no-drag"
              title={t("grid.dragResize")}
              onPointerDown={(event) => startResize(item, event)}
            />
          </div>
        );
      })}
    </div>
  );
}
