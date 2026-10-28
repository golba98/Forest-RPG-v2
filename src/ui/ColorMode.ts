import type { ColorMode } from '../types/colorModes';
const matrices: Record<string, string> = {
  Protanopia: '0.567 0.433 0 0 0  0.558 0.442 0 0 0  0 0.242 0.758 0 0  0 0 0 1 0',
  Deuteranopia: '0.625 0.375 0 0 0  0.7 0.3 0 0 0  0 0.3 0.7 0 0  0 0 0 1 0',
  Tritanopia: '0.95 0.05 0 0 0  0 0.433 0.567 0 0  0 0.475 0.525 0 0  0 0 0 1 0',
};
export function applyColorMode(canvas: HTMLCanvasElement, mode: ColorMode): void {
  if (!document.getElementById('forest-color-filters')) {
    const ns = 'http://www.w3.org/2000/svg'; const svg = document.createElementNS(ns, 'svg'); svg.id = 'forest-color-filters'; svg.setAttribute('aria-hidden', 'true'); svg.style.cssText = 'position:absolute;width:0;height:0;pointer-events:none';
    const defs = document.createElementNS(ns, 'defs'); svg.append(defs);
    for (const [name, values] of Object.entries(matrices)) { const filter = document.createElementNS(ns, 'filter'); filter.id = `forest-color-${name.toLowerCase()}`; const matrix = document.createElementNS(ns, 'feColorMatrix'); matrix.setAttribute('type', 'matrix'); matrix.setAttribute('values', values); filter.append(matrix); defs.append(filter); }
    document.body.append(svg);
  }
  const filters: Record<ColorMode, string> = { None: '', Protanopia: 'url(#forest-color-protanopia)', Deuteranopia: 'url(#forest-color-deuteranopia)', Tritanopia: 'url(#forest-color-tritanopia)', Grayscale: 'grayscale(100%)', Sepia: 'sepia(80%)', Invert: 'invert(100%) hue-rotate(180deg)', 'High Contrast': 'contrast(150%) saturate(120%)' };
  canvas.style.filter = filters[mode];
}
