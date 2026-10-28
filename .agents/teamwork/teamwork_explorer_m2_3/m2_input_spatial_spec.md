# Milestone 2: Input Management & Spatial Partitioning Architecture Specification

**Author**: `teamwork_explorer_m2_3`  
**Milestone**: Milestone 2 — Core Architecture & Simulation Engine  
**Domain**: Input Management, 2D Geometry Math, and Spatial Hash Partitioning  
**Target Files**:
- `src/core/input/types.ts`
- `src/core/input/InputManager.ts`
- `src/core/math/AABB.ts`
- `src/core/spatial/types.ts`
- `src/core/spatial/SpatialHashGrid.ts`

---

## 1. Executive Summary

Milestone 2 establishes the core simulation engine for **Forest RPG V2**. While the legacy engine utilized global window listeners and `O(N)` linear entity scans for collisions and proximity checks, Forest RPG V2 introduces an authoritative, decoupled simulation layer featuring:
1. **Decoupled Input Manager (`InputManager.ts`)**:
   - Zero per-frame garbage allocation.
   - Edge-latched query semantics (`isActionActive`, `isActionJustPressed`, `isActionJustReleased`).
   - Dual-code translation supporting modern DOM `KeyboardEvent.code` (e.g. `'KeyW'`), legacy numeric `keyCode`s (e.g. `87`), and mouse buttons (`'Mouse0'`, `'Mouse2'`).
   - Legacy localStorage persistence parity with key `'playerKeybinds'`.
   - Full headless simulation API enabling deterministic unit testing in Vitest and bot automation.
2. **Axis-Aligned Bounding Box Math (`AABB.ts`)**:
   - High-performance 2D geometric primitive.
   - Broad-phase and narrow-phase collision routines (`intersects`, `containsPoint`, `containsAABB`, `intersectsCircle`, `expand`).
3. **Spatial Hash Partitioning (`SpatialHashGrid.ts`)**:
   - Scalable 2D spatial partitioning with configurable cell size (64px / 128px).
   - Handles multi-cell spanning entities with `O(1)` coordinate hashing.
   - Guaranteed deduplication in multi-cell queries (avoiding duplicate hits on entities spanning adjacent cells).
   - High-efficiency spatial queries: `queryAABB`, `queryRadius`, `queryPoint`.

```
+-----------------------------------------------------------------------------------------+
|                                    InputManager                                         |
|  [DOM Window / Canvas]  <--->  [Internal State: Active, Pressed, Released Sets]        |
|  [Headless Sim API]     --->   [Keybind Registry: Action -> InputCode[]]                |
|                                |                                                        |
|                                v                                                        |
|             Query API: isActionActive, getMovementVector, etc.                          |
+-----------------------------------------------------------------------------------------+
                                         |
                                         v
+-----------------------------------------------------------------------------------------+
|                                 Authoritative Simulation                                |
|  - Player Controller calculates movement & combat actions                               |
|  - Melee sweeps, AoE Spin (radius 3.5 tiles), Projectile paths                         |
+-----------------------------------------------------------------------------------------+
                                         |
                                         v
+-----------------------------------------------------------------------------------------+
|                                 SpatialHashGrid                                         |
|  - Insert / Update / Remove ISpatialEntity (AABB bounds)                                |
|  - Multi-cell spanning with coordinate hashing: Math.floor(x / cellSize)               |
|  - Query Deduplication: Query ID tag / Set                                              |
|  - queryAABB(bounds) / queryRadius(center, radius) / queryPoint(point)                 |
+-----------------------------------------------------------------------------------------+
```

---

## 2. Input Management Subsystem

### 2.1 Types Blueprint (`src/core/input/types.ts`)

```typescript
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
```

---

### 2.2 Default Keybindings Configuration

The default keybinding configuration is crafted to achieve 100% parity with legacy defaults, the modern E2E Playwright test harness, and standard modern PC RPG conventions:

| Action | Primary Key | Secondary Key | Legacy Code | Mouse Equivalent | Notes |
|---|---|---|---|---|---|
| `moveUp` | `'KeyW'` | `'ArrowUp'` | `87`, `38` | — | Move North |
| `moveDown` | `'KeyS'` | `'ArrowDown'` | `83`, `40` | — | Move South |
| `moveLeft` | `'KeyA'` | `'ArrowLeft'` | `65`, `37` | — | Move West |
| `moveRight` | `'KeyD'` | `'ArrowRight'` | `68`, `39` | — | Move East |
| `sprint` | `'ShiftLeft'` | `'ShiftRight'` | `16` | — | Consumes stamina |
| `jump` | `'Space'` | — | `32` | — | 5-frame parabolic jump |
| `dash` | `'ShiftLeft'` | `'KeyC'` | `16` | — | Quick 1-tile dodge |
| `attack` | `'Mouse0'` | `'KeyE'` | `69` | Left Click | Melee swing combo (legacy 'cut') |
| `skillQ` | `'KeyQ'` | — | `81` | — | AoE Spin Attack (30 mana) |
| `skillE` | `'KeyE'` | `'KeyR'` | `69`, `82` | — | Magic Projectile (20 mana) |
| `potionHealth` | `'Digit1'` | `'Numpad1'` | `49`, `97` | — | Slot 1: Health (+2 HP) |
| `potionSpeed` | `'Digit2'` | `'Numpad2'` | `50`, `98` | — | Slot 2: Speed buff (8s) |
| `toggleTerminal` | `'Backquote'` | `'F2'` | `192`, `113`| — | In-game debug console |
| `pause` | `'Escape'` | — | `27` | — | Pause menu toggle |

```typescript
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
```

---

### 2.3 Implementation Blueprint (`src/core/input/InputManager.ts`)

```typescript
import { Vector2 } from '../math/Vector2';
import {
  InputAction,
  InputCode,
  KeybindConfig,
  LegacyKeybindConfig,
  IInputManager,
  MouseButton,
  DEFAULT_KEYBINDS,
} from './types';

export class InputManager implements IInputManager {
  private _target: Window | HTMLElement | null = null;
  private _canvas: HTMLElement | null = null;
  private _attached = false;

  // Keybindings: action -> Set of InputCodes
  private _bindings: Map<InputAction, Set<InputCode>> = new Map();

  // Active / held inputs
  private _activeCodes: Set<InputCode> = new Set();
  private _justPressedCodes: Set<InputCode> = new Set();
  private _justReleasedCodes: Set<InputCode> = new Set();

  // Mouse state
  private _mousePosition: Vector2 = new Vector2(0, 0);
  private _mouseDelta: Vector2 = new Vector2(0, 0);

  // Bound DOM listener references for clean removal
  private _onKeyDownRef: (ev: KeyboardEvent) => void;
  private _onKeyUpRef: (ev: KeyboardEvent) => void;
  private _onMouseDownRef: (ev: MouseEvent) => void;
  private _onMouseUpRef: (ev: MouseEvent) => void;
  private _onMouseMoveRef: (ev: MouseEvent) => void;
  private _onContextMenuRef: (ev: MouseEvent) => void;
  private _onBlurRef: () => void;
  private _onVisibilityChangeRef: () => void;

  constructor(customBindings?: Partial<KeybindConfig>) {
    this._initBindings(customBindings);

    // Bind event handlers to maintain reference equality for detach()
    this._onKeyDownRef = this._handleKeyDown.bind(this);
    this._onKeyUpRef = this._handleKeyUp.bind(this);
    this._onMouseDownRef = this._handleMouseDown.bind(this);
    this._onMouseUpRef = this._handleMouseUp.bind(this);
    this._onMouseMoveRef = this._handleMouseMove.bind(this);
    this._onContextMenuRef = (ev) => ev.preventDefault();
    this._onBlurRef = () => this.reset();
    this._onVisibilityChangeRef = () => {
      if (typeof document !== 'undefined' && document.hidden) {
        this.reset();
      }
    };
  }

  // =========================================================================
  // Lifecycle & DOM Attachment
  // =========================================================================

  public attach(
    target: Window | HTMLElement = (typeof window !== 'undefined' ? window : null as any),
    canvasElement?: HTMLElement
  ): void {
    if (this._attached || !target) return;
    this._target = target;
    this._canvas = canvasElement || (typeof document !== 'undefined' ? document.querySelector('canvas') : null);

    // Attach keyboard listeners on target (using capture to intercept prior to bubbling)
    target.addEventListener('keydown', this._onKeyDownRef as EventListener, { capture: true });
    target.addEventListener('keyup', this._onKeyUpRef as EventListener, { capture: true });

    // Attach mouse listeners
    const mouseTarget = this._canvas || target;
    mouseTarget.addEventListener('mousedown', this._onMouseDownRef as EventListener);
    mouseTarget.addEventListener('mousemove', this._onMouseMoveRef as EventListener);
    mouseTarget.addEventListener('contextmenu', this._onContextMenuRef as EventListener);

    // Attach mouseup to target window to catch drag releases outside canvas
    target.addEventListener('mouseup', this._onMouseUpRef as EventListener);

    // Window focus/blur protection against stuck keys
    if (typeof window !== 'undefined') {
      window.addEventListener('blur', this._onBlurRef);
      window.addEventListener('focusout', this._onBlurRef);
    }
    if (typeof document !== 'undefined') {
      document.addEventListener('visibilitychange', this._onVisibilityChangeRef);
    }

    this._attached = true;
  }

  public detach(): void {
    if (!this._attached || !this._target) return;

    this._target.removeEventListener('keydown', this._onKeyDownRef as EventListener, { capture: true });
    this._target.removeEventListener('keyup', this._onKeyUpRef as EventListener, { capture: true });
    this._target.removeEventListener('mouseup', this._onMouseUpRef as EventListener);

    const mouseTarget = this._canvas || this._target;
    mouseTarget.removeEventListener('mousedown', this._onMouseDownRef as EventListener);
    mouseTarget.removeEventListener('mousemove', this._onMouseMoveRef as EventListener);
    mouseTarget.removeEventListener('contextmenu', this._onContextMenuRef as EventListener);

    if (typeof window !== 'undefined') {
      window.removeEventListener('blur', this._onBlurRef);
      window.removeEventListener('focusout', this._onBlurRef);
    }
    if (typeof document !== 'undefined') {
      document.removeEventListener('visibilitychange', this._onVisibilityChangeRef);
    }

    this.reset();
    this._attached = false;
    this._target = null;
    this._canvas = null;
  }

  public isAttached(): boolean {
    return this._attached;
  }

  // =========================================================================
  // Query API
  // =========================================================================

  public isActionActive(action: InputAction): boolean {
    const codes = this._bindings.get(action);
    if (!codes || codes.size === 0) return false;
    for (const code of codes) {
      if (this._activeCodes.has(code)) return true;
    }
    return false;
  }

  public isActionJustPressed(action: InputAction): boolean {
    const codes = this._bindings.get(action);
    if (!codes || codes.size === 0) return false;
    for (const code of codes) {
      if (this._justPressedCodes.has(code)) return true;
    }
    return false;
  }

  public isActionJustReleased(action: InputAction): boolean {
    const codes = this._bindings.get(action);
    if (!codes || codes.size === 0) return false;
    for (const code of codes) {
      if (this._justReleasedCodes.has(code)) return true;
    }
    return false;
  }

  public getMovementVector(): Vector2 {
    let dx = 0;
    let dy = 0;

    if (this.isActionActive('moveRight')) dx += 1;
    if (this.isActionActive('moveLeft')) dx -= 1;
    if (this.isActionActive('moveDown')) dy += 1;
    if (this.isActionActive('moveUp')) dy -= 1;

    if (dx === 0 && dy === 0) {
      return new Vector2(0, 0);
    }

    // Normalize diagonal movement to uniform speed (length 1.0)
    if (dx !== 0 && dy !== 0) {
      const invLen = 1 / Math.SQRT2; // ~0.70710678
      return new Vector2(dx * invLen, dy * invLen);
    }

    return new Vector2(dx, dy);
  }

  public getMousePosition(): Vector2 {
    return new Vector2(this._mousePosition.x, this._mousePosition.y);
  }

  public getMouseDelta(): Vector2 {
    return new Vector2(this._mouseDelta.x, this._mouseDelta.y);
  }

  public clearFrameState(): void {
    if (this._justPressedCodes.size > 0) this._justPressedCodes.clear();
    if (this._justReleasedCodes.size > 0) this._justReleasedCodes.clear();
    this._mouseDelta.x = 0;
    this._mouseDelta.y = 0;
  }

  public reset(): void {
    this._activeCodes.clear();
    this._justPressedCodes.clear();
    this._justReleasedCodes.clear();
    this._mouseDelta.x = 0;
    this._mouseDelta.y = 0;
  }

  // =========================================================================
  // Keybinding Configuration & Storage
  // =========================================================================

  public getKeybinds(): KeybindConfig {
    const result: Partial<KeybindConfig> = {};
    for (const [action, codes] of this._bindings.entries()) {
      result[action] = Array.from(codes);
    }
    return result as KeybindConfig;
  }

  public setKeybinds(config: Partial<KeybindConfig>): void {
    for (const [action, codes] of Object.entries(config)) {
      if (Array.isArray(codes)) {
        this._bindings.set(action as InputAction, new Set(codes));
      }
    }
  }

  public bindAction(action: InputAction, code: InputCode): void {
    let set = this._bindings.get(action);
    if (!set) {
      set = new Set();
      this._bindings.set(action, set);
    }
    set.add(code);
  }

  public unbindAction(action: InputAction, code: InputCode): void {
    const set = this._bindings.get(action);
    if (set) {
      set.delete(code);
    }
  }

  public resetToDefaults(): void {
    this._initBindings();
  }

  public saveToStorage(storageKey = 'playerKeybinds'): boolean {
    if (typeof localStorage === 'undefined') return false;
    try {
      // Save legacy compatible format for core actions + full config
      const legacyObj: Record<string, any> = {};
      for (const [action, set] of this._bindings.entries()) {
        const arr = Array.from(set);
        legacyObj[action] = arr;
        // Legacy compat: populate numeric keyCode for cut, moveUp, etc.
        const numCode = arr.find((c) => typeof c === 'number');
        if (numCode !== undefined) {
          if (action === 'attack') legacyObj['cut'] = numCode;
          legacyObj[action + 'Code'] = numCode;
        }
      }
      localStorage.setItem(storageKey, JSON.stringify(legacyObj));
      return true;
    } catch {
      return false;
    }
  }

  public loadFromStorage(storageKey = 'playerKeybinds'): boolean {
    if (typeof localStorage === 'undefined') return false;
    try {
      const raw = localStorage.getItem(storageKey);
      if (!raw) return false;
      const parsed = JSON.parse(raw) as LegacyKeybindConfig | Record<string, InputCode[]>;

      for (const [key, val] of Object.entries(parsed)) {
        let action: InputAction | null = null;
        if (key === 'cut') action = 'attack';
        else if (key in DEFAULT_KEYBINDS) action = key as InputAction;

        if (action) {
          if (Array.isArray(val)) {
            for (const code of val) this.bindAction(action, code);
          } else if (typeof val === 'number' || typeof val === 'string') {
            this.bindAction(action, val);
          }
        }
      }
      return true;
    } catch {
      return false;
    }
  }

  // =========================================================================
  // Headless Simulation API (Testing / Automation)
  // =========================================================================

  public simulateKeyDown(code: InputCode): void {
    if (!this._activeCodes.has(code)) {
      this._justPressedCodes.add(code);
    }
    this._activeCodes.add(code);
  }

  public simulateKeyUp(code: InputCode): void {
    this._activeCodes.delete(code);
    this._justReleasedCodes.add(code);
  }

  public simulateMouseMove(x: number, y: number): void {
    this._mouseDelta.x = x - this._mousePosition.x;
    this._mouseDelta.y = y - this._mousePosition.y;
    this._mousePosition.x = x;
    this._mousePosition.y = y;
  }

  public simulateMouseDown(button: number): void {
    const mouseCode = `Mouse${button}`;
    this.simulateKeyDown(mouseCode);
    this.simulateKeyDown(button); // support numeric button code as well
  }

  public simulateMouseUp(button: number): void {
    const mouseCode = `Mouse${button}`;
    this.simulateKeyUp(mouseCode);
    this.simulateKeyUp(button);
  }

  // =========================================================================
  // Private Helpers & DOM Handlers
  // =========================================================================

  private _initBindings(custom?: Partial<KeybindConfig>): void {
    this._bindings.clear();
    for (const [action, codes] of Object.entries(DEFAULT_KEYBINDS)) {
      this._bindings.set(action as InputAction, new Set(codes));
    }
    if (custom) {
      this.setKeybinds(custom);
    }
  }

  private _handleKeyDown(ev: KeyboardEvent): void {
    // Intercept default behavior for game keys (prevent page scrolling, etc.)
    if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Tab'].includes(ev.code)) {
      ev.preventDefault();
    }

    const domCode = ev.code;
    const keyCode = ev.keyCode || ev.which;

    if (!ev.repeat) {
      if (domCode && !this._activeCodes.has(domCode)) this._justPressedCodes.add(domCode);
      if (keyCode && !this._activeCodes.has(keyCode)) this._justPressedCodes.add(keyCode);
    }

    if (domCode) this._activeCodes.add(domCode);
    if (keyCode) this._activeCodes.add(keyCode);
  }

  private _handleKeyUp(ev: KeyboardEvent): void {
    const domCode = ev.code;
    const keyCode = ev.keyCode || ev.which;

    if (domCode) {
      this._activeCodes.delete(domCode);
      this._justReleasedCodes.add(domCode);
    }
    if (keyCode) {
      this._activeCodes.delete(keyCode);
      this._justReleasedCodes.add(keyCode);
    }
  }

  private _handleMouseDown(ev: MouseEvent): void {
    const mouseCode = `Mouse${ev.button}`;
    if (!this._activeCodes.has(mouseCode)) {
      this._justPressedCodes.add(mouseCode);
    }
    this._activeCodes.add(mouseCode);
  }

  private _handleMouseUp(ev: MouseEvent): void {
    const mouseCode = `Mouse${ev.button}`;
    this._activeCodes.delete(mouseCode);
    this._justReleasedCodes.add(mouseCode);
  }

  private _handleMouseMove(ev: MouseEvent): void {
    let clientX = ev.clientX;
    let clientY = ev.clientY;

    if (this._canvas) {
      const rect = this._canvas.getBoundingClientRect();
      clientX = ev.clientX - rect.left;
      clientY = ev.clientY - rect.top;
    }

    this._mouseDelta.x = clientX - this._mousePosition.x;
    this._mouseDelta.y = clientY - this._mousePosition.y;
    this._mousePosition.x = clientX;
    this._mousePosition.y = clientY;
  }
}
```

---

## 3. Math Subsystem: Axis-Aligned Bounding Box (`AABB.ts`)

### 3.1 Vector2 Enhancements

The existing `src/core/math/Vector2.ts` provides basic `add()` and `distanceTo()`. To support spatial queries, raycasts, and geometric bounds calculations without external dependencies, we specify the following zero-dependency methods for `Vector2`:

```typescript
export class Vector2 {
  constructor(public x: number = 0, public y: number = 0) {}

  add(other: Vector2): Vector2 {
    return new Vector2(this.x + other.x, this.y + other.y);
  }

  sub(other: Vector2): Vector2 {
    return new Vector2(this.x - other.x, this.y - other.y);
  }

  scale(scalar: number): Vector2 {
    return new Vector2(this.x * scalar, this.y * scalar);
  }

  distanceTo(other: Vector2): number {
    const dx = this.x - other.x;
    const dy = this.y - other.y;
    return Math.sqrt(dx * dx + dy * dy);
  }

  distanceToSq(other: Vector2): number {
    const dx = this.x - other.x;
    const dy = this.y - other.y;
    return dx * dx + dy * dy;
  }

  length(): number {
    return Math.sqrt(this.x * this.x + this.y * this.y);
  }

  lengthSq(): number {
    return this.x * this.x + this.y * this.y;
  }

  normalize(): Vector2 {
    const len = this.length();
    if (len === 0) return new Vector2(0, 0);
    return new Vector2(this.x / len, this.y / len);
  }

  clone(): Vector2 {
    return new Vector2(this.x, this.y);
  }

  set(x: number, y: number): this {
    this.x = x;
    this.y = y;
    return this;
  }

  equals(other: Vector2, tolerance = 1e-6): boolean {
    return Math.abs(this.x - other.x) <= tolerance && Math.abs(this.y - other.y) <= tolerance;
  }

  static zero(): Vector2 {
    return new Vector2(0, 0);
  }
}
```

---

### 3.2 AABB Blueprint (`src/core/math/AABB.ts`)

```typescript
import { Vector2 } from './Vector2';

/**
 * 2D Axis-Aligned Bounding Box (AABB) represented by min and max corners.
 */
export class AABB {
  public minX: number;
  public minY: number;
  public maxX: number;
  public maxY: number;

  constructor(minX: number, minY: number, maxX: number, maxY: number) {
    this.minX = Math.min(minX, maxX);
    this.minY = Math.min(minY, maxY);
    this.maxX = Math.max(minX, maxX);
    this.maxY = Math.max(minY, maxY);
  }

  // =========================================================================
  // Factory Methods
  // =========================================================================

  public static fromMinMax(minX: number, minY: number, maxX: number, maxY: number): AABB {
    return new AABB(minX, minY, maxX, maxY);
  }

  public static fromBounds(x: number, y: number, width: number, height: number): AABB {
    return new AABB(x, y, x + width, y + height);
  }

  public static fromCenterSize(centerX: number, centerY: number, width: number, height: number): AABB {
    const halfW = width * 0.5;
    const halfH = height * 0.5;
    return new AABB(centerX - halfW, centerY - halfH, centerX + halfW, centerY + halfH);
  }

  public static fromPoints(points: Vector2[]): AABB {
    if (points.length === 0) {
      return new AABB(0, 0, 0, 0);
    }
    let minX = points[0].x;
    let minY = points[0].y;
    let maxX = points[0].x;
    let maxY = points[0].y;
    for (let i = 1; i < points.length; i++) {
      const p = points[i];
      if (p.x < minX) minX = p.x;
      if (p.x > maxX) maxX = p.x;
      if (p.y < minY) minY = p.y;
      if (p.y > maxY) maxY = p.y;
    }
    return new AABB(minX, minY, maxX, maxY);
  }

  // =========================================================================
  // Getters & Properties
  // =========================================================================

  public get min(): Vector2 {
    return new Vector2(this.minX, this.minY);
  }

  public get max(): Vector2 {
    return new Vector2(this.maxX, this.maxY);
  }

  public get center(): Vector2 {
    return new Vector2((this.minX + this.maxX) * 0.5, (this.minY + this.maxY) * 0.5);
  }

  public get width(): number {
    return this.maxX - this.minX;
  }

  public get height(): number {
    return this.maxY - this.minY;
  }

  public get halfWidth(): number {
    return (this.maxX - this.minX) * 0.5;
  }

  public get halfHeight(): number {
    return (this.maxY - this.minY) * 0.5;
  }

  // =========================================================================
  // Geometric Intersection & Containment Queries
  // =========================================================================

  public intersects(other: AABB): boolean {
    return !(
      this.maxX < other.minX ||
      this.minX > other.maxX ||
      this.maxY < other.minY ||
      this.minY > other.maxY
    );
  }

  public containsPoint(point: Vector2 | { x: number; y: number }): boolean {
    return (
      point.x >= this.minX &&
      point.x <= this.maxX &&
      point.y >= this.minY &&
      point.y <= this.maxY
    );
  }

  public containsAABB(other: AABB): boolean {
    return (
      other.minX >= this.minX &&
      other.maxX <= this.maxX &&
      other.minY >= this.minY &&
      other.maxY <= this.maxY
    );
  }

  /**
   * Tests whether this AABB intersects a circle centered at (center.x, center.y) with radius.
   * Uses clamped squared Euclidean distance algorithm.
   */
  public intersectsCircle(center: Vector2 | { x: number; y: number }, radius: number): boolean {
    const closestX = Math.max(this.minX, Math.min(center.x, this.maxX));
    const closestY = Math.max(this.minY, Math.min(center.y, this.maxY));
    const dx = center.x - closestX;
    const dy = center.y - closestY;
    return dx * dx + dy * dy <= radius * radius;
  }

  public expand(margin: number): AABB {
    return new AABB(
      this.minX - margin,
      this.minY - margin,
      this.maxX + margin,
      this.maxY + margin
    );
  }

  public expandInPlace(margin: number): this {
    this.minX -= margin;
    this.minY -= margin;
    this.maxX += margin;
    this.maxY += margin;
    return this;
  }

  public clone(): AABB {
    return new AABB(this.minX, this.minY, this.maxX, this.maxY);
  }

  public union(other: AABB): AABB {
    return new AABB(
      Math.min(this.minX, other.minX),
      Math.min(this.minY, other.minY),
      Math.max(this.maxX, other.maxX),
      Math.max(this.maxY, other.maxY)
    );
  }

  public intersection(other: AABB): AABB | null {
    if (!this.intersects(other)) return null;
    return new AABB(
      Math.max(this.minX, other.minX),
      Math.max(this.minY, other.minY),
      Math.min(this.maxX, other.maxX),
      Math.min(this.maxY, other.maxY)
    );
  }

  public set(minX: number, minY: number, maxX: number, maxY: number): this {
    this.minX = Math.min(minX, maxX);
    this.minY = Math.min(minY, maxY);
    this.maxX = Math.max(minX, maxX);
    this.maxY = Math.max(minY, maxY);
    return this;
  }
}
```

---

## 4. Spatial Partitioning Subsystem

### 4.1 Types Blueprint (`src/core/spatial/types.ts`)

```typescript
import { AABB } from '../math/AABB';
import { Vector2 } from '../math/Vector2';

/**
 * Any entity or object that can be tracked in the SpatialHashGrid.
 */
export interface ISpatialEntity {
  id: string | number;
  getAABB(): AABB;
}

/**
 * Internal cell bounds record for an entity.
 */
export interface EntityCellSpan {
  minCX: number;
  maxCX: number;
  minCY: number;
  maxCY: number;
}

/**
 * Performance and diagnostic stats for the spatial grid.
 */
export interface SpatialGridStats {
  cellSize: number;
  entityCount: number;
  occupiedCellCount: number;
  maxEntitiesPerCell: number;
  avgEntitiesPerCell: number;
}

/**
 * Public interface for SpatialHashGrid.
 */
export interface ISpatialHashGrid<T extends ISpatialEntity> {
  readonly cellSize: number;
  insert(entity: T): void;
  update(entity: T): void;
  remove(entity: T): boolean;
  queryAABB(bounds: AABB, filter?: (entity: T) => boolean): T[];
  queryRadius(center: Vector2, radius: number, filter?: (entity: T) => boolean): T[];
  queryPoint(point: Vector2, filter?: (entity: T) => boolean): T[];
  clear(): void;
  has(entity: T): boolean;
  getStats(): SpatialGridStats;
}
```

---

### 4.2 Deduplication Strategy & Multi-Cell Spanning

When an entity's AABB extends across cell borders:
```
           Cell (1, 1)          Cell (2, 1)
       +--------------------+--------------------+
       |                    |                    |
       |             +------+-----+              |
       |             |  Entity A  |              |
       +-------------+------+-----+--------------+
       |             |  (spans 4  |              |
       |             |   cells)   |              |
       |             +------+-----+              |
       |                    |                    |
       +--------------------+--------------------+
           Cell (1, 2)          Cell (2, 2)
```

1. **Multi-Cell Insertion**:
   Entity A is inserted into all 4 overlapping cells: `(1,1)`, `(2,1)`, `(1,2)`, `(2,2)`.
2. **The Duplicate Return Hazard**:
   If a query region touches all 4 cells, traversing the buckets sequentially would discover Entity A 4 separate times.
3. **Zero-Allocation Query ID Tagging**:
   - The grid maintains an incremental `_queryId: number`.
   - Before executing a query, `_queryId` increments.
   - For every entity found in a bucket, if `entitySeenMap.get(entity.id) === _queryId`, it is skipped.
   - Alternatively, a `Set<string | number>` or `Set<T>` collects visited entities.
   - To guarantee zero mutation on user entity objects and complete type safety, Forest RPG V2 uses a fast internal `Set<T>` or `Set<string | number>` during query collection.
4. **Early-Exit Update Optimization**:
   Entities that move slightly (staying within the same cell boundaries `[minCX..maxCX] x [minCY..maxCY]`) trigger an immediate return during `update(entity)`, avoiding costly Set removals and insertions.

---

### 4.3 Implementation Blueprint (`src/core/spatial/SpatialHashGrid.ts`)

```typescript
import { AABB } from '../math/AABB';
import { Vector2 } from '../math/Vector2';
import {
  ISpatialEntity,
  ISpatialHashGrid,
  EntityCellSpan,
  SpatialGridStats,
} from './types';

export class SpatialHashGrid<T extends ISpatialEntity> implements ISpatialHashGrid<T> {
  public readonly cellSize: number;

  // Spatial cells: "cx,cy" -> Set of entities
  private _cells: Map<string, Set<T>> = new Map();

  // Track entity cell span for O(1) update and removal
  private _entitySpans: Map<string | number, EntityCellSpan> = new Map();

  // Primary entity map: id -> entity
  private _entities: Map<string | number, T> = new Map();

  constructor(cellSize = 64) {
    if (cellSize <= 0) {
      throw new Error(`SpatialHashGrid cellSize must be > 0, got ${cellSize}`);
    }
    this.cellSize = cellSize;
  }

  // =========================================================================
  // Mutation API: insert, update, remove, clear
  // =========================================================================

  public insert(entity: T): void {
    const id = entity.id;
    if (this._entities.has(id)) {
      this.update(entity);
      return;
    }

    const aabb = entity.getAABB();
    const span = this._calculateSpan(aabb);

    this._entities.set(id, entity);
    this._entitySpans.set(id, span);

    this._addToCells(entity, span);
  }

  public update(entity: T): void {
    const id = entity.id;
    const oldSpan = this._entitySpans.get(id);

    if (!oldSpan) {
      this.insert(entity);
      return;
    }

    const aabb = entity.getAABB();
    const newSpan = this._calculateSpan(aabb);

    // Fast path: entity stayed within the exact same cell bounds
    if (
      oldSpan.minCX === newSpan.minCX &&
      oldSpan.maxCX === newSpan.maxCX &&
      oldSpan.minCY === newSpan.minCY &&
      oldSpan.maxCY === newSpan.maxCY
    ) {
      return;
    }

    // Remove from old cells and add to new cells
    this._removeFromCells(entity, oldSpan);
    this._entitySpans.set(id, newSpan);
    this._addToCells(entity, newSpan);
  }

  public remove(entity: T): boolean {
    const id = entity.id;
    const span = this._entitySpans.get(id);
    if (!span) return false;

    this._removeFromCells(entity, span);
    this._entitySpans.delete(id);
    this._entities.delete(id);
    return true;
  }

  public clear(): void {
    this._cells.clear();
    this._entitySpans.clear();
    this._entities.clear();
  }

  public has(entity: T): boolean {
    return this._entities.has(entity.id);
  }

  // =========================================================================
  // Spatial Query API
  // =========================================================================

  /**
   * Queries all entities whose bounding box intersects the given AABB bounds.
   * Multi-cell spanning entities are automatically deduplicated.
   */
  public queryAABB(bounds: AABB, filter?: (entity: T) => boolean): T[] {
    const span = this._calculateSpan(bounds);
    const resultSet = new Set<T>();

    for (let cx = span.minCX; cx <= span.maxCX; cx++) {
      for (let cy = span.minCY; cy <= span.maxCY; cy++) {
        const key = this._cellKey(cx, cy);
        const cell = this._cells.get(key);
        if (!cell || cell.size === 0) continue;

        for (const entity of cell) {
          if (resultSet.has(entity)) continue;

          if (bounds.intersects(entity.getAABB())) {
            if (!filter || filter(entity)) {
              resultSet.add(entity);
            }
          }
        }
      }
    }

    return Array.from(resultSet);
  }

  /**
   * Queries all entities located within a radial distance from center.
   * Broad-phase evaluates bounding box around circle; narrow-phase tests circle-AABB intersection.
   */
  public queryRadius(center: Vector2, radius: number, filter?: (entity: T) => boolean): T[] {
    if (radius <= 0) return [];

    // Broad-phase: construct AABB circumscribing the circle
    const broadAABB = AABB.fromCenterSize(center.x, center.y, radius * 2, radius * 2);
    const span = this._calculateSpan(broadAABB);
    const resultSet = new Set<T>();

    for (let cx = span.minCX; cx <= span.maxCX; cx++) {
      for (let cy = span.minCY; cy <= span.maxCY; cy++) {
        const key = this._cellKey(cx, cy);
        const cell = this._cells.get(key);
        if (!cell || cell.size === 0) continue;

        for (const entity of cell) {
          if (resultSet.has(entity)) continue;

          // Narrow-phase circle-AABB intersection test
          if (entity.getAABB().intersectsCircle(center, radius)) {
            if (!filter || filter(entity)) {
              resultSet.add(entity);
            }
          }
        }
      }
    }

    return Array.from(resultSet);
  }

  /**
   * Queries all entities whose AABB contains the specified point.
   */
  public queryPoint(point: Vector2, filter?: (entity: T) => boolean): T[] {
    const cx = Math.floor(point.x / this.cellSize);
    const cy = Math.floor(point.y / this.cellSize);
    const key = this._cellKey(cx, cy);
    const cell = this._cells.get(key);
    if (!cell || cell.size === 0) return [];

    const results: T[] = [];
    for (const entity of cell) {
      if (entity.getAABB().containsPoint(point)) {
        if (!filter || filter(entity)) {
          results.push(entity);
        }
      }
    }
    return results;
  }

  // =========================================================================
  // Diagnostics & Statistics
  // =========================================================================

  public getStats(): SpatialGridStats {
    let occupiedCellCount = 0;
    let maxEntitiesPerCell = 0;
    let totalCellEntries = 0;

    for (const cell of this._cells.values()) {
      const size = cell.size;
      if (size > 0) {
        occupiedCellCount++;
        totalCellEntries += size;
        if (size > maxEntitiesPerCell) {
          maxEntitiesPerCell = size;
        }
      }
    }

    return {
      cellSize: this.cellSize,
      entityCount: this._entities.size,
      occupiedCellCount,
      maxEntitiesPerCell,
      avgEntitiesPerCell: occupiedCellCount > 0 ? totalCellEntries / occupiedCellCount : 0,
    };
  }

  // =========================================================================
  // Private Coordinate Math & Cell Management
  // =========================================================================

  private _cellKey(cx: number, cy: number): string {
    return `${cx},${cy}`;
  }

  private _calculateSpan(aabb: AABB): EntityCellSpan {
    return {
      minCX: Math.floor(aabb.minX / this.cellSize),
      maxCX: Math.floor(aabb.maxX / this.cellSize),
      minCY: Math.floor(aabb.minY / this.cellSize),
      maxCY: Math.floor(aabb.maxY / this.cellSize),
    };
  }

  private _addToCells(entity: T, span: EntityCellSpan): void {
    for (let cx = span.minCX; cx <= span.maxCX; cx++) {
      for (let cy = span.minCY; cy <= span.maxCY; cy++) {
        const key = this._cellKey(cx, cy);
        let cell = this._cells.get(key);
        if (!cell) {
          cell = new Set();
          this._cells.set(key, cell);
        }
        cell.add(entity);
      }
    }
  }

  private _removeFromCells(entity: T, span: EntityCellSpan): void {
    for (let cx = span.minCX; cx <= span.maxCX; cx++) {
      for (let cy = span.minCY; cy <= span.maxCY; cy++) {
        const key = this._cellKey(cx, cy);
        const cell = this._cells.get(key);
        if (cell) {
          cell.delete(entity);
          if (cell.size === 0) {
            this._cells.delete(key);
          }
        }
      }
    }
  }
}
```

---

## 5. Subsystem Integration & Workflow

### 5.1 Game Loop Coordination
1. **Simulation Tick**:
   During each fixed step (`fixedDeltaSec = 1/60`), the simulation engine queries `InputManager`:
   ```typescript
   const moveDir = inputManager.getMovementVector();
   if (inputManager.isActionJustPressed('attack')) {
     combatSystem.executeMeleeAttack(player);
   }
   if (inputManager.isActionJustPressed('skillQ')) {
     combatSystem.executeSpinAttack(player);
   }
   if (inputManager.isActionJustPressed('skillE')) {
     combatSystem.castProjectile(player);
   }
   ```
2. **Post-Simulation Cleanup**:
   At the end of each simulation frame, `inputManager.clearFrameState()` is called to clear the `_justPressedCodes` and `_justReleasedCodes` buffers.

### 5.2 Combat & Spatial Queries
- **Melee Sweeps**: Player melee hitbox (AABB) is queried against `SpatialHashGrid`:
  ```typescript
  const hitEnemies = spatialGrid.queryAABB(attackHitbox, (e) => e.isEnemy && !e.isDead);
  ```
- **AoE Spin Attack (Key Q)**:
  ```typescript
  const radiusPx = 3.5 * cellSize; // 3.5 tiles
  const spinHits = spatialGrid.queryRadius(playerCenter, radiusPx, (e) => e.isEnemy);
  ```
- **Projectile Trajectory**:
  ```typescript
  const projectileAABB = AABB.fromCenterSize(proj.x, proj.y, 8, 8);
  const collisions = spatialGrid.queryAABB(projectileAABB);
  ```

---

## 6. Comprehensive Vitest Unit Test Suites

The implementation must pass the following unit test specifications:

### 6.1 `tests/unit/input/InputManager.test.ts`
```typescript
import { describe, it, expect, beforeEach } from 'vitest';
import { InputManager } from '@/core/input/InputManager';
import { Vector2 } from '@/core/math/Vector2';

describe('InputManager Unit Tests', () => {
  let input: InputManager;

  beforeEach(() => {
    input = new InputManager();
  });

  it('detects active, just pressed, and just released key events', () => {
    expect(input.isActionActive('moveUp')).toBe(false);
    expect(input.isActionJustPressed('moveUp')).toBe(false);

    input.simulateKeyDown('KeyW');
    expect(input.isActionActive('moveUp')).toBe(true);
    expect(input.isActionJustPressed('moveUp')).toBe(true);

    // Frame end clears rising edge
    input.clearFrameState();
    expect(input.isActionActive('moveUp')).toBe(true);
    expect(input.isActionJustPressed('moveUp')).toBe(false);

    // Key up creates falling edge
    input.simulateKeyUp('KeyW');
    expect(input.isActionActive('moveUp')).toBe(false);
    expect(input.isActionJustReleased('moveUp')).toBe(true);

    input.clearFrameState();
    expect(input.isActionJustReleased('moveUp')).toBe(false);
  });

  it('calculates normalized 8-directional movement vectors', () => {
    expect(input.getMovementVector()).toEqual(new Vector2(0, 0));

    input.simulateKeyDown('KeyD');
    expect(input.getMovementVector()).toEqual(new Vector2(1, 0));

    // Diagonal movement (D + S) must be normalized
    input.simulateKeyDown('KeyS');
    const diag = input.getMovementVector();
    expect(diag.x).toBeCloseTo(Math.SQRT1_2, 4);
    expect(diag.y).toBeCloseTo(Math.SQRT1_2, 4);

    // Opposing keys cancel out
    input.simulateKeyDown('KeyA');
    expect(input.getMovementVector()).toEqual(new Vector2(0, 1));
  });

  it('handles legacy numeric keyCodes seamlessly', () => {
    // 87 = W, 83 = S, 65 = A, 68 = D, 32 = Space
    input.simulateKeyDown(87);
    expect(input.isActionActive('moveUp')).toBe(true);

    input.simulateKeyDown(32);
    expect(input.isActionActive('jump')).toBe(true);
  });

  it('handles mouse button attacks and mouse coordinates', () => {
    input.simulateMouseMove(250, 180);
    expect(input.getMousePosition()).toEqual(new Vector2(250, 180));

    input.simulateMouseDown(0); // Left Click
    expect(input.isActionActive('attack')).toBe(true);
    expect(input.isActionJustPressed('attack')).toBe(true);
  });

  it('persists and restores keybinds from storage', () => {
    const customConfig = {
      jump: ['KeyJ', 74],
    };
    input.setKeybinds(customConfig);
    expect(input.isActionActive('jump')).toBe(false);

    input.simulateKeyDown('KeyJ');
    expect(input.isActionActive('jump')).toBe(true);
  });
});
```

### 6.2 `tests/unit/math/AABB.test.ts`
```typescript
import { describe, it, expect } from 'vitest';
import { AABB } from '@/core/math/AABB';
import { Vector2 } from '@/core/math/Vector2';

describe('AABB Unit Tests', () => {
  it('correctly constructs and normalizes min/max coordinates', () => {
    const box = new AABB(100, 200, 50, 80);
    expect(box.minX).toBe(50);
    expect(box.maxX).toBe(100);
    expect(box.minY).toBe(80);
    expect(box.maxY).toBe(200);
    expect(box.width).toBe(50);
    expect(box.height).toBe(120);
    expect(box.center).toEqual(new Vector2(75, 140));
  });

  it('computes AABB vs AABB intersection correctly', () => {
    const a = AABB.fromBounds(0, 0, 50, 50);
    const b = AABB.fromBounds(25, 25, 50, 50);
    const c = AABB.fromBounds(60, 60, 20, 20);

    expect(a.intersects(b)).toBe(true);
    expect(b.intersects(a)).toBe(true);
    expect(a.intersects(c)).toBe(false);
  });

  it('computes point containment correctly', () => {
    const box = AABB.fromBounds(10, 10, 80, 80);
    expect(box.containsPoint(new Vector2(50, 50))).toBe(true);
    expect(box.containsPoint(new Vector2(10, 10))).toBe(true);
    expect(box.containsPoint(new Vector2(90, 90))).toBe(true);
    expect(box.containsPoint(new Vector2(5, 50))).toBe(false);
  });

  it('computes circle vs AABB intersection correctly', () => {
    const box = AABB.fromBounds(10, 10, 20, 20); // [10..30, 10..30]
    expect(box.intersectsCircle(new Vector2(20, 20), 5)).toBe(true); // circle inside
    expect(box.intersectsCircle(new Vector2(5, 20), 6)).toBe(true);  // overlaps left edge
    expect(box.intersectsCircle(new Vector2(5, 5), 7.1)).toBe(true); // overlaps corner (dist ~7.07)
    expect(box.intersectsCircle(new Vector2(5, 5), 6.0)).toBe(false); // misses corner
  });

  it('expands bounds symmetrically', () => {
    const box = AABB.fromBounds(10, 10, 20, 20);
    const expanded = box.expand(5);
    expect(expanded.minX).toBe(5);
    expect(expanded.maxX).toBe(35);
    expect(expanded.width).toBe(30);
  });
});
```

### 6.3 `tests/unit/spatial/SpatialHashGrid.test.ts`
```typescript
import { describe, it, expect, beforeEach } from 'vitest';
import { SpatialHashGrid } from '@/core/spatial/SpatialHashGrid';
import { ISpatialEntity } from '@/core/spatial/types';
import { AABB } from '@/core/math/AABB';
import { Vector2 } from '@/core/math/Vector2';

class TestEntity implements ISpatialEntity {
  constructor(
    public id: string,
    public x: number,
    public y: number,
    public size: number
  ) {}

  getAABB(): AABB {
    return AABB.fromBounds(this.x, this.y, this.size, this.size);
  }
}

describe('SpatialHashGrid Unit Tests', () => {
  let grid: SpatialHashGrid<TestEntity>;

  beforeEach(() => {
    grid = new SpatialHashGrid<TestEntity>(64);
  });

  it('inserts and queries entities in cell bounds', () => {
    const e1 = new TestEntity('e1', 10, 10, 20);
    const e2 = new TestEntity('e2', 200, 200, 20);
    grid.insert(e1);
    grid.insert(e2);

    const hits = grid.queryAABB(AABB.fromBounds(0, 0, 50, 50));
    expect(hits).toHaveLength(1);
    expect(hits[0].id).toBe('e1');
  });

  it('deduplicates entities spanning multiple cells', () => {
    // Entity spanning cells (0,0), (1,0), (0,1), (1,1)
    const largeEntity = new TestEntity('boss', 50, 50, 50);
    grid.insert(largeEntity);

    // Query covering all 4 cells
    const hits = grid.queryAABB(AABB.fromBounds(0, 0, 128, 128));
    expect(hits).toHaveLength(1);
    expect(hits[0].id).toBe('boss');
  });

  it('updates entity location when moving across cells', () => {
    const e = new TestEntity('e1', 10, 10, 20);
    grid.insert(e);

    e.x = 500;
    e.y = 500;
    grid.update(e);

    expect(grid.queryAABB(AABB.fromBounds(0, 0, 50, 50))).toHaveLength(0);
    expect(grid.queryAABB(AABB.fromBounds(480, 480, 50, 50))).toHaveLength(1);
  });

  it('removes entities cleanly from all cells', () => {
    const e = new TestEntity('e1', 50, 50, 50);
    grid.insert(e);
    expect(grid.remove(e)).toBe(true);
    expect(grid.has(e)).toBe(false);
    expect(grid.queryAABB(AABB.fromBounds(0, 0, 200, 200))).toHaveLength(0);
  });

  it('performs radius proximity queries with circle filtering', () => {
    const e1 = new TestEntity('center', 100, 100, 10);
    const e2 = new TestEntity('edge', 130, 100, 10);
    const e3 = new TestEntity('far', 300, 300, 10);

    grid.insert(e1);
    grid.insert(e2);
    grid.insert(e3);

    const radiusHits = grid.queryRadius(new Vector2(100, 100), 40);
    expect(radiusHits.map((e) => e.id)).toContain('center');
    expect(radiusHits.map((e) => e.id)).toContain('edge');
    expect(radiusHits.map((e) => e.id)).not.toContain('far');
  });
});
```
