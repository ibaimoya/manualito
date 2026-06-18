export const IMAGE_ZOOM_LEVELS = [1, 1.25, 1.5, 2, 3, 4] as const;
export const DEFAULT_IMAGE_ZOOM = 1.25;
export const MAX_IMAGE_ZOOM = lastZoomLevel();

export type ImageZoom = 'fit' | (typeof IMAGE_ZOOM_LEVELS)[number];

type Point = Readonly<{ clientX: number; clientY: number }>;
type RectLike = Readonly<Pick<DOMRect, 'left' | 'top' | 'width' | 'height'>>;

export function imageZoomLabel(zoom: ImageZoom): string {
  return zoom === 'fit' ? 'Zoom' : `${Math.round(zoom * 100)}%`;
}

export function nextImageZoom(zoom: ImageZoom): ImageZoom {
  if (zoom === 'fit') return DEFAULT_IMAGE_ZOOM;
  const nextIndex = Math.min(IMAGE_ZOOM_LEVELS.indexOf(zoom) + 1, IMAGE_ZOOM_LEVELS.length - 1);
  return IMAGE_ZOOM_LEVELS[nextIndex] ?? MAX_IMAGE_ZOOM;
}

export function previousImageZoom(zoom: ImageZoom): ImageZoom {
  if (zoom === 'fit') return 'fit';
  const previousIndex = IMAGE_ZOOM_LEVELS.indexOf(zoom) - 1;
  return previousIndex < 0 ? 'fit' : (IMAGE_ZOOM_LEVELS[previousIndex] ?? 'fit');
}

export function imagePointRatio(imageRect: RectLike, point: Point): { x: number; y: number } {
  return {
    x: clampRatio((point.clientX - imageRect.left) / imageRect.width),
    y: clampRatio((point.clientY - imageRect.top) / imageRect.height),
  };
}

export function imageZoomWidth(
  zoom: ImageZoom,
  sourceWidth: number | null | undefined,
): string | undefined {
  if (zoom === 'fit') return undefined;
  if (sourceWidth) return `${Math.round(sourceWidth * zoom)}px`;
  return `${zoom * 100}%`;
}

export function scrollDeltaForImagePoint(
  imageRect: RectLike,
  ratio: Readonly<{ x: number; y: number }>,
  point: Point,
): { left: number; top: number } {
  return {
    left: imageRect.left + imageRect.width * ratio.x - point.clientX,
    top: imageRect.top + imageRect.height * ratio.y - point.clientY,
  };
}

function clampRatio(value: number): number {
  if (!Number.isFinite(value)) return 0.5;
  return Math.min(1, Math.max(0, value));
}

function lastZoomLevel(): (typeof IMAGE_ZOOM_LEVELS)[number] {
  return IMAGE_ZOOM_LEVELS.at(-1) ?? DEFAULT_IMAGE_ZOOM;
}
