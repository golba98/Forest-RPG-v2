export interface SafeInsets {
  readonly top: number;
  readonly right: number;
  readonly bottom: number;
  readonly left: number;
}
export interface HudLayout {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
  readonly scale: number;
  readonly compact: boolean;
  readonly heartStep: number;
  readonly heartSize: number;
  readonly leftWidth: number;
  readonly rightX: number;
  readonly rightWidth: number;
}
export const EMPTY_INSETS: SafeInsets = { top: 0, right: 0, bottom: 0, left: 0 };
/** Screen-space coordinates only; independent of camera zoom and device pixel ratio. */
export function hudLayout(
  width: number,
  height: number,
  requestedScale = 1,
  insets: SafeInsets = EMPTY_INSETS,
): HudLayout {
  const margin = 16,
    available = Math.max(1, width - insets.left - insets.right - (margin + 6) * 2);
  const compact = width < 600,
    logicalWidth = compact ? 280 : 360,
    logicalHeight = 120;
  const scale = Math.max(
    0.1,
    Math.min(
      requestedScale,
      available / logicalWidth,
      Math.max(1, height - insets.top - insets.bottom - margin * 2) / logicalHeight,
    ),
  );
  const drawnWidth = logicalWidth * scale,
    drawnHeight = logicalHeight * scale;
  return {
    x: Math.round(insets.left + (width - insets.left - insets.right - drawnWidth) / 2),
    y: Math.round(height - insets.bottom - margin - drawnHeight),
    width: logicalWidth,
    height: logicalHeight,
    scale,
    compact,
    heartStep: compact ? 13 : 16,
    heartSize: compact ? 12 : 16,
    leftWidth: compact ? 130 : 160,
    rightX: compact ? 150 : 200,
    rightWidth: compact ? 130 : 160,
  };
}
