import { Vector2 } from '../math/Vector2';
import {
  InputAction,
  InputCode,
  KeybindConfig,
  IInputManager,
  DEFAULT_KEYBINDS,
} from './types';

export class InputManager implements IInputManager {
  private _target: Window | HTMLElement | null = null;
  private _canvas: HTMLElement | null = null;
  private _attached = false;
  private _enabled = true;

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
    this._onContextMenuRef = (ev) => {
      if (typeof ev.preventDefault === 'function') {
        ev.preventDefault();
      }
    };
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
    target?: Window | HTMLElement,
    canvasElement?: HTMLElement
  ): void {
    const resolvedTarget = target ?? (typeof window !== 'undefined' ? window : null);
    if (this._attached || !resolvedTarget) return;

    this._target = resolvedTarget;
    this._canvas =
      canvasElement ||
      (typeof document !== 'undefined' ? document.querySelector('canvas') : null);

    // Attach keyboard listeners on target (using capture to intercept prior to bubbling)
    resolvedTarget.addEventListener('keydown', this._onKeyDownRef as EventListener, { capture: true });
    resolvedTarget.addEventListener('keyup', this._onKeyUpRef as EventListener, { capture: true });

    // Attach mouse listeners
    const mouseTarget = this._canvas || resolvedTarget;
    mouseTarget.addEventListener('mousedown', this._onMouseDownRef as EventListener);
    mouseTarget.addEventListener('mousemove', this._onMouseMoveRef as EventListener);
    mouseTarget.addEventListener('contextmenu', this._onContextMenuRef as EventListener);

    // Attach mouseup to target window to catch drag releases outside canvas
    resolvedTarget.addEventListener('mouseup', this._onMouseUpRef as EventListener);

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

  /**
   * Enables/disables gameplay input capture. While disabled (menus, terminal),
   * key-downs are ignored and not prevented so the DOM handles them; held state
   * is cleared so nothing stays pressed when gameplay resumes.
   */
  public setEnabled(enabled: boolean): void {
    if (this._enabled === enabled) return;
    this._enabled = enabled;
    if (!enabled) this.reset();
  }

  public get enabled(): boolean {
    return this._enabled;
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
    const result = {} as KeybindConfig;
    for (const [action, codes] of this._bindings.entries()) {
      result[action] = Array.from(codes);
    }
    return result;
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
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
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
      const parsed = JSON.parse(raw) as Record<string, unknown>;
      // Actions whose defaults have already been replaced by a stored binding list
      const replaced = new Set<InputAction>();

      for (const [key, val] of Object.entries(parsed)) {
        let action: InputAction | null = null;
        if (key === 'cut') action = 'attack';
        else if (key in DEFAULT_KEYBINDS) action = key as InputAction;

        if (action) {
          if (Array.isArray(val)) {
            // Stored lists replace defaults; scalar legacy codes (e.g. "cut") are merged in
            if (!replaced.has(action)) {
              this._bindings.set(action, new Set());
              replaced.add(action);
            }
            for (const code of val) {
              if (typeof code === 'string' || typeof code === 'number') {
                this.bindAction(action, code);
              }
            }
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

  /**
   * Keys typed into form fields (terminal input, settings) belong to the DOM,
   * not to the game.
   */
  private _isEditableTarget(ev: Event): boolean {
    const target = ev.target as { tagName?: unknown; isContentEditable?: unknown } | null;
    if (!target || typeof target.tagName !== 'string') return false;
    const tag = target.tagName.toUpperCase();
    return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || target.isContentEditable === true;
  }

  private _handleKeyDown(ev: KeyboardEvent): void {
    if (!this._enabled || this._isEditableTarget(ev)) return;

    // Gameplay owns these keys: stop page scrolling. Tab is left alone for accessibility.
    if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(ev.code)) {
      if (typeof ev.preventDefault === 'function') {
        ev.preventDefault();
      }
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
    // Key-ups are always processed (even when disabled) so no key stays stuck.
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
    if (!this._enabled) return;
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
