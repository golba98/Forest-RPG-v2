// @vitest-environment happy-dom
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { InputManager } from '@/core/input/InputManager';

describe('InputManager DOM gating', () => {
  let input: InputManager;

  beforeEach(() => {
    input = new InputManager();
    input.attach(window);
  });

  afterEach(() => {
    input.detach();
    document.body.innerHTML = '';
  });

  function keyDown(code: string, target: EventTarget = window): KeyboardEvent {
    const ev = new KeyboardEvent('keydown', { code, bubbles: true, cancelable: true });
    target.dispatchEvent(ev);
    return ev;
  }

  it('captures gameplay keys and prevents page scrolling for arrows/space', () => {
    const ev = keyDown('ArrowUp');
    expect(input.isActionActive('moveUp')).toBe(true);
    expect(ev.defaultPrevented).toBe(true);
  });

  it('never prevents Tab so menus stay keyboard-navigable', () => {
    const ev = keyDown('Tab');
    expect(ev.defaultPrevented).toBe(false);
  });

  it('ignores key-downs while disabled and clears held keys on disable', () => {
    keyDown('KeyW');
    expect(input.isActionActive('moveUp')).toBe(true);

    input.setEnabled(false);
    expect(input.isActionActive('moveUp')).toBe(false);

    const ev = keyDown('ArrowUp');
    expect(input.isActionActive('moveUp')).toBe(false);
    expect(ev.defaultPrevented).toBe(false);

    input.setEnabled(true);
    keyDown('KeyW');
    expect(input.isActionActive('moveUp')).toBe(true);
  });

  it('ignores keys typed into editable elements', () => {
    const field = document.createElement('input');
    document.body.appendChild(field);

    keyDown('KeyW', field);
    expect(input.isActionActive('moveUp')).toBe(false);
  });

  it('binds system actions and keeps the magic bolt off the attack key', () => {
    input.simulateKeyDown('KeyE');
    expect(input.isActionActive('attack')).toBe(true);
    expect(input.isActionActive('skillE')).toBe(false);
    input.simulateKeyUp('KeyE');

    input.simulateKeyDown('KeyR');
    expect(input.isActionActive('skillE')).toBe(true);

    input.simulateKeyDown('KeyF');
    expect(input.isActionActive('fullscreen')).toBe(true);
  });
  for (const event of ['blur', 'focusout']) {
    it(`clears held movement and pending presses on ${event}`, () => {
      keyDown('KeyW');
      expect(input.isActionActive('moveUp')).toBe(true);
      window.dispatchEvent(new Event(event));
      expect(input.isActionActive('moveUp')).toBe(false);
      expect(input.isActionJustPressed('moveUp')).toBe(false);
    });
  }

  it('clears held movement when the document becomes hidden', () => {
    keyDown('KeyW');
    const hidden = vi.spyOn(document, 'hidden', 'get').mockReturnValue(true);
    try {
      document.dispatchEvent(new Event('visibilitychange'));
      expect(input.isActionActive('moveUp')).toBe(false);
      expect(input.isActionJustPressed('moveUp')).toBe(false);
    } finally {
      hidden.mockRestore();
    }
  });

});
