export const COLOR_MODES = ['None', 'Protanopia', 'Deuteranopia', 'Tritanopia', 'Grayscale', 'Sepia', 'Invert', 'High Contrast'] as const;
export type ColorMode = (typeof COLOR_MODES)[number];
