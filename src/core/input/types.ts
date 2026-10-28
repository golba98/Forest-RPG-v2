import { Vector2 } from '../math/Vector2';

/**
 * Logical action names recognized by the game simulation and UI.
 */
export type InputAction =
  | 'moveUp'
  | 'moveDown'
  | 'moveLeft'
  | 'moveRight'
  | 'sprint'
  | 'jump'
  | 'dash'
  | 'attack'
  | 'skillQ'
  | 'skillE'
  | 'potionHealth'
  | 'potionSpeed'
  | 'toggleTerminal'
  | 'pause';

/**
 * Standard mouse buttons matching DOM MouseEvent.button.
 */
export enum MouseButton {
  Left = 0,
  Middle = 1,
  Right = 2,
  Back = 3,
  Forward = 4,
}

/**
 * Input code representing either:
 * - A modern DOM KeyboardEvent.code string (e.g. 'KeyW', 'ArrowUp', 'Space', 'ShiftLeft')
 * - A legacy DOM KeyboardEvent.keyCode number (e.g. 87, 38, 32, 16)
 * - A mouse code string (e.g. 'Mouse0', 'Mouse1', 'Mouse2')
 */
export type InputCode = string | number;

/**
 * Action to input codes mapping dictionary.
 */
export type KeybindConfig = Record<InputAction, InputCode[]>;

/**
 * Legacy keybind mapping structure saved in legacy localStorage ('playerKeybinds').
 */
export interface LegacyKeybindConfig {
  moveUp?: number | string;
  moveDown?: number | string;
  moveLeft?: number | string;
  moveRight?: number | string;
  sprint?: number | string;
  jump?: number | string;
  cut?: number | string; // Legacy melee attack name
  [key: string]: number | string | undefined;
}

/**
 * Default keybinding configuration.
 */
export const DEFAULT_KEYBINDS: KeybindConfig = Object.freeze({
  moveUp: ['KeyW', 'ArrowUp', 87, 38],
  moveDown: ['KeyS', 'ArrowDown', 83, 40],
  moveLeft: ['KeyA', 'ArrowLeft', 65, 37],
  moveRight: ['KeyD', 'ArrowRight', 68, 39],
  sprint: ['ShiftLeft', 'ShiftRight', 16],
  jump: ['Space', 32],
  dash: ['ShiftLeft', 'ShiftRight', 'KeyC', 16],
  attack: ['Mouse0', 'KeyE', 69],
  skillQ: ['KeyQ', 81],
  skillE: ['KeyE', 'KeyR', 69, 82],
  potionHealth: ['Digit1', 'Numpad1', 49, 97],
  potionSpeed: ['Digit2', 'Numpad2', 50, 98],
  toggleTerminal: ['Backquote', 'F2', 192, 113],
  pause: ['Escape', 27],
});

/**
 * Public interface for InputManager.
 */
export interface IInputManager {
  attach(target?: Window | HTMLElement, canvasElement?: HTMLElement): void;
  detach(): void;
  isAttached(): boolean;

  // Query API
  isActionActive(action: InputAction): boolean;
  isActionJustPressed(action: InputAction): boolean;
  isActionJustReleased(action: InputAction): boolean;
  getMovementVector(): Vector2;
  getMousePosition(): Vector2;
  getMouseDelta(): Vector2;
  clearFrameState(): void;
  reset(): void;

  // Keybind Configuration & Persistence
  getKeybinds(): KeybindConfig;
  setKeybinds(config: Partial<KeybindConfig>): void;
  bindAction(action: InputAction, code: InputCode): void;
  unbindAction(action: InputAction, code: InputCode): void;
  resetToDefaults(): void;
  saveToStorage(storageKey?: string): boolean;
  loadFromStorage(storageKey?: string): boolean;

  // Headless Simulation API (Vitest / Playwright / Bot)
  simulateKeyDown(code: InputCode): void;
  simulateKeyUp(code: InputCode): void;
  simulateMouseMove(x: number, y: number): void;
  simulateMouseDown(button: number): void;
  simulateMouseUp(button: number): void;
}
