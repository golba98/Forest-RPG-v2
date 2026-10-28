import { EMPTY_INSETS, type SafeInsets } from './hudLayout';
let dimensions = '';
let cached: SafeInsets = EMPTY_INSETS;
/** Read CSS safe-area values only on viewport changes, never every render. */
export function readSafeAreaInsets(): SafeInsets {
  const key = `${window.innerWidth}:${window.innerHeight}`;
  if (key === dimensions) return cached;
  dimensions = key;
  const probe = document.createElement('div');
  probe.style.cssText =
    'position:fixed;visibility:hidden;pointer-events:none;padding:env(safe-area-inset-top,0px) env(safe-area-inset-right,0px) env(safe-area-inset-bottom,0px) env(safe-area-inset-left,0px)';
  document.body.append(probe);
  const style = getComputedStyle(probe);
  cached = {
    top: parseFloat(style.paddingTop) || 0,
    right: parseFloat(style.paddingRight) || 0,
    bottom: parseFloat(style.paddingBottom) || 0,
    left: parseFloat(style.paddingLeft) || 0,
  };
  probe.remove();
  return cached;
}
