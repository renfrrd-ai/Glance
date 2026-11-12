"use client";

/*
 * The board surface: an infinite sheet you can pan, zoom and tap around on.
 *
 * The camera deliberately lives outside React. Panning writes a transform
 * straight onto the world element every frame, because re-rendering the whole
 * board on each pointer move would drop frames on a board of any size. React
 * owns what is on the board; `useCanvasCamera` owns where it is being seen
 * from, and the only thing they share is a ref.
 */

import {
  memo,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from "react";

import {
  cssTransform,
  DEFAULT_CAMERA,
  fitTo,
  FLIGHT_MS,
  frameRect,
  lerpCamera,
  panBy,
  wheelIntent,
  zoomAt,
  easeInOut,
  type Camera,
  type Viewport,
} from "@/lib/board/camera";
import type { Point, Rect } from "@/lib/board/events";

export type Tool = "pointer" | "pen" | "note" | "eraser" | "lasso";

export type FlightOptions = {
  duration?: number;
  padding?: number;
  fill?: number;
  maxZoom?: number;
  minZoom?: number;
  reduced?: boolean;
  onArrive?: () => void;
};

export type CameraHandle = ReturnType<typeof useCanvasCamera>;

export function useCanvasCamera(initial: Camera = DEFAULT_CAMERA) {
  const camera = useRef(initial);
  const moved = useRef(false);
  const world = useRef<HTMLDivElement | null>(null);
  const flight = useRef<{
    raf: number;
    from: Camera;
    to: Camera;
    start: number;
    duration: number;
    viewport: Viewport;
    onArrive?: () => void;
  } | null>(null);
  const far = useRef(false);

  const paint = useCallback(() => {
    const element = world.current;
    if (!element) return;
    element.style.transform = cssTransform(camera.current);

    /* Zoomed far out, blocks swap to their titles. The two thresholds keep
     * that from flickering while zooming across the boundary. */
    const z = camera.current.z;
    const nowFar = far.current ? z < 0.4 : z < 0.34;
    if (nowFar !== far.current) {
      far.current = nowFar;
      element.toggleAttribute("data-far", nowFar);
    }
  }, []);

  const attachWorld = useCallback(
    (element: HTMLDivElement | null) => {
      world.current = element;
      paint();
    },
    [paint],
  );

  const write = useCallback(
    (next: Camera) => {
      camera.current = next;
      paint();
    },
    [paint],
  );

  const cancelFlight = useCallback(() => {
    const running = flight.current;
    if (!running) return;
    flight.current = null;
    cancelAnimationFrame(running.raf);
  }, []);

  const set = useCallback(
    (next: Camera) => {
      cancelFlight();
      write(next);
    },
    [cancelFlight, write],
  );

  const flyTo = useCallback(
    (rect: Rect, viewport: Viewport, options: FlightOptions = {}) => {
      const to = frameRect(rect, viewport, options);
      const duration = Math.max(0, options.duration ?? FLIGHT_MS);
      cancelFlight();
      const from = camera.current;

      const reduced =
        options.reduced ??
        (typeof window.matchMedia === "function" &&
          window.matchMedia("(prefers-reduced-motion: reduce)").matches);

      if (duration === 0 || reduced) {
        write(to);
        options.onArrive?.();
        return;
      }

      const step = (now: number) => {
        const running = flight.current;
        if (!running) return;
        const t = Math.min(1, (now - running.start) / running.duration);
        write(lerpCamera(running.from, running.to, easeInOut(t), running.viewport));
        if (t >= 1) {
          flight.current = null;
          running.onArrive?.();
          return;
        }
        running.raf = requestAnimationFrame(step);
      };

      const running = {
        raf: 0,
        from,
        to,
        start: performance.now(),
        duration,
        viewport,
        onArrive: options.onArrive,
      };
      flight.current = running;
      running.raf = requestAnimationFrame(step);
    },
    [cancelFlight, write],
  );

  useEffect(() => cancelFlight, [cancelFlight]);

  return useMemo(
    () => ({
      attachWorld,
      initialTransform: cssTransform(initial),
      read: () => camera.current,
      /** Whether the person has moved the camera themselves. */
      userMoved: () => moved.current,
      release: () => {
        moved.current = false;
      },
      set,
      panBy: (dx: number, dy: number) => {
        moved.current = true;
        set(panBy(camera.current, dx, dy));
      },
      zoomAt: (at: Point, by: number) => {
        moved.current = true;
        set(zoomAt(camera.current, at, by));
      },
      fit: (rect: Rect, viewport: Viewport, padding?: number) =>
        set(fitTo(rect, viewport, padding)),
      flyTo,
      cancelFlight,
      isFlying: () => flight.current !== null,
      screenToWorld: (at: Point) => ({
        x: at.x / camera.current.z + camera.current.x,
        y: at.y / camera.current.z + camera.current.y,
      }),
      onWheel: (event: WheelEvent) => {
        moved.current = true;
        const intent = wheelIntent(event);
        if (intent.kind === "zoom") set(zoomAt(camera.current, intent.at, intent.factor));
        else set(panBy(camera.current, intent.dx, intent.dy));
        return true;
      },
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [attachWorld, set, flyTo, cancelFlight],
  );
}

/** One block's box on the board. Its height is a minimum; content may exceed it. */
export const BlockFrame = memo(function BlockFrame({
  id,
  x,
  y,
  w,
  h,
  measure,
  children,
  dim,
  held,
}: {
  id: string;
  x: number;
  y: number;
  w: number;
  h: number;
  measure?: (element: HTMLDivElement | null) => void;
  children?: ReactNode;
  /** Pushed back, because something else is being looked at. */
  dim?: boolean;
  /** The one being looked at. */
  held?: boolean;
}) {
  return (
    <div
      className="ck-block"
      data-block={id}
      data-dim={dim || undefined}
      data-focus={held || undefined}
      ref={measure}
      /*
       * `h` is a floor, not a height, and it is the one the *event* asked for —
       * never the measured one. Feeding a measured height back in as a minimum
       * is a ratchet: a block that renders shorter than its guess can never
       * shrink to fit, and everything that reads its box (the stacking, the
       * spotlight) stays wrong with it.
       */
      style={{ transform: `translate(${x}px, ${y}px)`, width: w, minHeight: h || undefined }}
    >
      {children}
    </div>
  );
});

const noStore = () => () => {};

export function Surface({
  camera,
  children,
  overlay,
  tool = "pointer",
  toolHandlers,
  onTap,
}: {
  camera: CameraHandle;
  children?: ReactNode;
  /** Fixed to the viewport, above the board: the cursor, the tour, the tools. */
  overlay?: ReactNode;
  tool?: Tool;
  toolHandlers?: {
    onPointerDown?: (event: React.PointerEvent) => void;
    onPointerMove?: (event: React.PointerEvent) => void;
    onPointerUp?: (event: React.PointerEvent) => void;
  };
  onTap?: (what: { block?: string; sheet?: string }) => void;
}) {
  const surface = useRef<HTMLDivElement | null>(null);
  const tap = useRef(onTap);
  useEffect(() => {
    tap.current = onTap;
  }, [onTap]);

  const { attachWorld, initialTransform } = camera;

  /* The listeners below are native and non-passive; on the server there is
   * nothing to attach them to, so the surface renders empty until mounted. */
  const mounted = useSyncExternalStore(
    noStore,
    () => true,
    () => false,
  );

  useEffect(() => {
    const element = surface.current;
    if (!element) return;

    /* Non-passive: a wheel over the board must not scroll the page behind it. */
    const onWheel = (event: WheelEvent) => {
      event.preventDefault();
      camera.onWheel(event);
    };
    element.addEventListener("wheel", onWheel, { passive: false });
    return () => element.removeEventListener("wheel", onWheel);
  }, [camera, mounted]);

  useEffect(() => {
    const element = surface.current;
    if (!element) return;

    let panning = false;
    let last = { x: 0, y: 0 };
    const touches = new Map<number, Point>();
    let pinch: { dist: number; mid: Point } | null = null;

    const spread = () => {
      const [a, b] = [...touches.values()];
      return {
        dist: Math.max(1, Math.hypot(a.x - b.x, a.y - b.y)),
        mid: { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 },
      };
    };

    const down = (event: PointerEvent) => {
      if (event.pointerType === "touch") {
        touches.set(event.pointerId, { x: event.clientX, y: event.clientY });
        if (touches.size >= 2) {
          /* A second finger turns a drag into a pinch. */
          if (panning) {
            panning = false;
            element.classList.remove("ck-panning");
          }
          if (touches.size === 2) {
            camera.cancelFlight();
            pinch = spread();
          }
          return;
        }
      }

      if (tool !== "pointer") return;

      const target = event.target as Element;
      if (event.button !== 0) return;
      /* Dragging a block, a gesture target or the overlay is not panning. */
      if (target.closest("[data-block], [data-gesture]") || target.closest(".ck-overlay")) return;

      panning = true;
      last = { x: event.clientX, y: event.clientY };
      element.setPointerCapture(event.pointerId);
      element.classList.add("ck-panning");
    };

    const move = (event: PointerEvent) => {
      if (event.pointerType === "touch" && touches.has(event.pointerId)) {
        touches.set(event.pointerId, { x: event.clientX, y: event.clientY });
        if (pinch && touches.size === 2) {
          const now = spread();
          camera.panBy(now.mid.x - pinch.mid.x, now.mid.y - pinch.mid.y);
          camera.zoomAt(now.mid, now.dist / pinch.dist);
          pinch = now;
          return;
        }
      }

      if (!panning) return;
      camera.panBy(event.clientX - last.x, event.clientY - last.y);
      last = { x: event.clientX, y: event.clientY };
    };

    const up = (event: PointerEvent) => {
      if (event.pointerType === "touch") {
        touches.delete(event.pointerId);
        if (touches.size < 2) pinch = null;
      }
      if (!panning) return;
      panning = false;
      if (element.hasPointerCapture(event.pointerId))
        element.releasePointerCapture(event.pointerId);
      element.classList.remove("ck-panning");
    };

    /* A tap is a press and release in the same place, soon enough, on the same
     * thing — not a drag that happened to start on a block. */
    let pressed: { x: number; y: number; t: number; id: number; block?: string; sheet?: string } | null =
      null;

    const pressStart = (event: PointerEvent) => {
      pressed = null;
      if (event.button !== 0 || !event.isPrimary || tool !== "pointer") return;

      const target = event.target as Element | null;
      if (!target || target.closest(".ck-overlay")) return;

      const block = target.closest("[data-block]")?.getAttribute("data-block") ?? undefined;
      const sheet = block
        ? undefined
        : (target.closest("[data-sheet]")?.getAttribute("data-sheet") ?? undefined);

      if (block || sheet)
        pressed = {
          x: event.clientX,
          y: event.clientY,
          t: performance.now(),
          id: event.pointerId,
          block,
          sheet,
        };
    };

    const pressEnd = (event: PointerEvent) => {
      const press = pressed;
      pressed = null;
      if (!press || press.id !== event.pointerId) return;
      if (Math.hypot(event.clientX - press.x, event.clientY - press.y) > 6) return;
      if (performance.now() - press.t > 650) return;
      tap.current?.({ block: press.block, sheet: press.sheet });
    };

    const pressCancel = () => {
      pressed = null;
    };

    /* Captured, so a tap is seen before a block's own handlers stop it. */
    element.addEventListener("pointerdown", pressStart, true);
    element.addEventListener("pointerup", pressEnd, true);
    element.addEventListener("pointercancel", pressCancel, true);

    element.addEventListener("pointerdown", down);
    element.addEventListener("pointermove", move);
    element.addEventListener("pointerup", up);
    element.addEventListener("pointercancel", up);

    return () => {
      element.removeEventListener("pointerdown", pressStart, true);
      element.removeEventListener("pointerup", pressEnd, true);
      element.removeEventListener("pointercancel", pressCancel, true);
      element.removeEventListener("pointerdown", down);
      element.removeEventListener("pointermove", move);
      element.removeEventListener("pointerup", up);
      element.removeEventListener("pointercancel", up);
    };
  }, [camera, tool, mounted]);

  if (!mounted) return <div className="ck-surface" />;

  return (
    <div
      className="ck-surface"
      ref={surface}
      data-tool={tool}
      onPointerDown={toolHandlers?.onPointerDown}
      onPointerMove={toolHandlers?.onPointerMove}
      onPointerUp={toolHandlers?.onPointerUp}
    >
      <div className="ck-world" ref={attachWorld} style={{ transform: initialTransform }}>
        {children}
      </div>
      {overlay ? <div className="ck-overlay">{overlay}</div> : null}
    </div>
  );
}

/**
 * Stack blocks so none overlaps the one above it.
 *
 * chalk places blocks as it draws them, before it knows how tall each one will
 * turn out; this pushes each one down past anything it shares a column with.
 */
export function restack(
  blocks: (Rect & { id: string })[],
  heights: Record<string, number>,
  fallback: (block: Rect & { id: string }) => number,
  gap = 24,
  extra?: (above: Rect & { id: string }, below: Rect & { id: string }) => number,
) {
  const measured = blocks.map((block) => ({ ...block, h: heights[block.id] ?? fallback(block) }));
  const placed: (Rect & { id: string })[] = [];

  for (const block of [...measured].sort((a, b) => a.y - b.y || a.x - b.x)) {
    let floor: number | null = null;

    for (const above of placed) {
      /* Only blocks that share a column can push this one down. */
      const overlap = Math.min(block.x + block.w, above.x + above.w) - Math.max(block.x, above.x);
      if (overlap <= 8) continue;

      const under = above.y + above.h + gap + (extra ? extra(above, block) : 0);
      floor = floor === null ? under : Math.max(floor, under);
    }

    placed.push({ ...block, y: floor ?? block.y });
  }

  return placed;
}

/**
 * Measure what blocks actually render as.
 *
 * Each block registers a ResizeObserver and heights are published through an
 * external store, so a block growing re-runs the stacking without every block
 * re-rendering on every observation.
 */
export function useMeasuredHeights() {
  const heights = useRef<Record<string, number>>({});
  const listeners = useRef(new Set<() => void>());
  const observers = useRef(new Map<string, ResizeObserver>());
  const published = useRef<Record<string, number>>({});
  const frame = useRef(0);
  const refs = useRef(new Map<string, (element: HTMLDivElement | null) => void>());

  const publish = useCallback(() => {
    if (frame.current) return;
    frame.current = requestAnimationFrame(() => {
      frame.current = 0;
      published.current = heights.current;
      for (const listener of listeners.current) listener();
    });
  }, []);

  const subscribe = useCallback((listener: () => void) => {
    listeners.current.add(listener);
    return () => listeners.current.delete(listener);
  }, []);

  const observe = useCallback(
    (id: string) => {
      const existing = refs.current.get(id);
      if (existing) return existing;

      const ref = (element: HTMLDivElement | null) => {
        observers.current.get(id)?.disconnect();
        if (!element) {
          observers.current.delete(id);
          return;
        }

        const observer = new ResizeObserver(([entry]) => {
          const height = Math.ceil(
            entry.borderBoxSize?.[0]?.blockSize ?? entry.contentRect.height,
          );
          /* Ignore sub-pixel jitter, which would otherwise restack forever. */
          if (Math.abs((heights.current[id] ?? 0) - height) < 2) return;
          heights.current = { ...heights.current, [id]: height };
          publish();
        });

        observer.observe(element);
        observers.current.set(id, observer);
      };

      refs.current.set(id, ref);
      return ref;
    },
    [publish],
  );

  const measured = useSyncExternalStore(
    subscribe,
    () => published.current,
    () => published.current,
  );

  return { observe, heights: measured };
}

/** A tiny helper for the common "what size is the surface" question. */
export function useViewport(of: React.RefObject<HTMLElement | null>) {
  const [viewport, setViewport] = useState<Viewport>({ w: 1200, h: 800 });

  useEffect(() => {
    const element = of.current;
    if (!element) return;
    const observer = new ResizeObserver(([entry]) =>
      setViewport({
        w: Math.max(1, Math.round(entry.contentRect.width)),
        h: Math.max(1, Math.round(entry.contentRect.height)),
      }),
    );
    observer.observe(element);
    return () => observer.disconnect();
  }, [of]);

  return viewport;
}
