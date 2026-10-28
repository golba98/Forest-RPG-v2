export interface SafeInsets {
  readonly top: number;
  readonly right: number;
  readonly bottom: number;
  readonly left: number;
}
export interface HudRect {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}
export interface HudLayout {
  readonly scale: number;
  readonly compact: boolean;
  /** Top-left level/XP/coins panel: screen position, logical size. */
  readonly level: HudRect;
  /** Bottom-right hearts + bars + hotbar: screen position, logical size. */
  readonly cluster: HudRect;
  readonly heartStep: number;
  readonly heartSize: number;
  readonly slotSize: number;
  readonly slotGap: number;
  readonly slotCount: number;
  readonly barHeight: number;
  /** Logical height of the hearts/bars panel; the hotbar sits below it. */
  readonly vitalsHeight: number;
}
export const EMPTY_INSETS: SafeInsets = { top: 0, right: 0, bottom: 0, left: 0 };
export const HUD_MARGIN = 16;
export const LEVEL_PANEL = { width: 184, height: 48 } as const;
const SLOT_COUNT = 5,
  PAD = 6;

/** Logical vitals panel height: two heart rows, MP and STA bars, padding. */
export function vitalsHeight(heartStep: number, bar: number): number {
  return PAD + heartStep * 2 + 3 + bar + 3 + bar + PAD;
}

/**
 * Screen-space coordinates only; independent of camera zoom and device pixel ratio.
 * `reserveTopRight` is a screen rect (e.g. the minimap) the level panel must not cover.
 */
export function hudLayout(
  width: number,
  height: number,
  requestedScale = 1,
  insets: SafeInsets = EMPTY_INSETS,
  reserveTopRight: HudRect | null = null,
): HudLayout {
  const margin = HUD_MARGIN,
    compact = width < 600;
  // Health is the headline element: whole-pixel sizes, larger on desktop.
  const slotSize = compact ? 30 : 44,
    slotGap = 4,
    heartStep = compact ? 15 : 22,
    heartSize = compact ? 14 : 20,
    barHeight = compact ? 9 : 11;
  const clusterWidth = SLOT_COUNT * slotSize + (SLOT_COUNT - 1) * slotGap,
    vitals = vitalsHeight(heartStep, barHeight),
    clusterHeight = vitals + 4 + slotSize;
  const availableWidth = Math.max(1, width - insets.left - insets.right - margin * 2),
    availableHeight = Math.max(1, height - insets.top - insets.bottom - margin * 3);
  const scale = Math.max(
    0.1,
    Math.min(
      requestedScale,
      availableWidth / Math.max(clusterWidth, LEVEL_PANEL.width),
      availableHeight / (clusterHeight + LEVEL_PANEL.height),
    ),
  );
  const levelX = Math.round(insets.left + margin);
  let levelY = Math.round(insets.top + margin);
  // Narrow screens: drop below the minimap instead of sliding under it.
  if (reserveTopRight && levelX + LEVEL_PANEL.width * scale > reserveTopRight.x - 4)
    levelY = Math.max(levelY, Math.round(reserveTopRight.y + reserveTopRight.height + 8));
  return {
    scale,
    compact,
    level: { x: levelX, y: levelY, width: LEVEL_PANEL.width, height: LEVEL_PANEL.height },
    cluster: {
      x: Math.round(width - insets.right - margin - clusterWidth * scale),
      y: Math.round(height - insets.bottom - margin - clusterHeight * scale),
      width: clusterWidth,
      height: clusterHeight,
    },
    heartStep,
    heartSize,
    slotSize,
    slotGap,
    slotCount: SLOT_COUNT,
    barHeight,
    vitalsHeight: vitals,
  };
}
