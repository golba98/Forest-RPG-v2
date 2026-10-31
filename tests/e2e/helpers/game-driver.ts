/**
 * High-Level Playwright Test Driver for Forest RPG V2
 * Provides opaque-box interaction with canvas, DOM, keyboard/mouse, and the __GAME__ diagnostics gateway.
 */

import { Page, Locator } from '@playwright/test';
import { GameSnapshot, Direction } from './types';

export interface LaunchOptions {
  seed?: number;
  tutorial?: boolean;
  difficulty?: 'easy' | 'normal' | 'hard';
  storageItems?: Record<string, string>;
  queryParams?: Record<string, string>;
  viewport?: { width: number; height: number };
}

export class GameDriver {
  readonly page: Page;
  readonly baseUrl: string;

  constructor(page: Page, baseUrl = '', private readonly controlledClock = false) {
    this.page = page;
    this.baseUrl = baseUrl;
  }

  private async wait(ms: number): Promise<void> {
    if (this.controlledClock) await this.page.clock.runFor(ms);
    else await this.page.waitForTimeout(ms);
  }

  /**
   * Navigates to the game and sets up any pre-seeded localStorage items.
   */
  async launchGame(options: LaunchOptions = {}): Promise<void> {
    if (options.viewport) {
      await this.page.setViewportSize(options.viewport);
    }

    // Set localStorage before navigation if provided
    if (options.storageItems && Object.keys(options.storageItems).length > 0) {
      await this.page.addInitScript((items: Record<string, string>) => {
        for (const [key, val] of Object.entries(items)) {
          window.localStorage.setItem(key, String(val));
        }
      }, options.storageItems);
    }

    const params = new URLSearchParams({ debug: '1', autostart: '1' });
    if (options.seed !== undefined) params.set('seed', options.seed.toString());
    if (options.tutorial !== undefined) params.set('tutorial', options.tutorial ? '1' : '0');
    if (options.difficulty) params.set('difficulty', options.difficulty);
    if (options.queryParams) {
      for (const [k, v] of Object.entries(options.queryParams)) {
        params.set(k, v);
      }
    }

    const qs = params.toString() ? `?${params.toString()}` : '';
    await this.page.goto(`${this.baseUrl}/${qs}`, { waitUntil: 'domcontentloaded' });
  }

  /**
   * Waits for the canvas and game engine to become active and ready.
   */
  async waitForEngineReady(timeoutMs = 15000): Promise<void> {
    // Canvas must be visible in DOM
    const canvas = this.getCanvas();
    await canvas.waitFor({ state: 'visible', timeout: timeoutMs });

    // Wait until window.__GAME__ is initialized and engine is running
    await this.page.waitForFunction(
      () => {
        return (
          typeof window !== 'undefined' &&
          window.__GAME__ !== undefined &&
          typeof window.__GAME__.getState === 'function' &&
          window.__GAME__.getState().engine.isRunning
        );
      },
      undefined,
      { timeout: timeoutMs }
    );
  }

  getCanvas(): Locator {
    return this.page.locator('canvas').first();
  }

  /**
   * Retrieves a full snapshot of the authoritative game simulation and rendering state.
   */
  async getState(): Promise<GameSnapshot> {
    return await this.page.evaluate(() => {
      if (!window.__GAME__) {
        throw new Error('window.__GAME__ diagnostics gateway is not defined');
      }
      return window.__GAME__.getState();
    });
  }

  /**
   * Dispatches a single key press event with duration.
   */
  async pressKey(key: string, durationMs = 80): Promise<void> {
    await this.page.keyboard.down(key);
    await this.wait(durationMs);
    await this.page.keyboard.up(key);
  }

  /**
   * Holds multiple keys simultaneously (e.g. Shift + ArrowUp for sprint).
   */
  async holdKeys(keys: string[], durationMs: number): Promise<void> {
    for (const key of keys) {
      await this.page.keyboard.down(key);
    }
    await this.wait(durationMs);
    for (const key of keys.reverse()) {
      await this.page.keyboard.up(key);
    }
  }

  /**
   * Dispatches directional movement for a given step count.
   */
  async moveDirection(dir: Direction, steps = 1, sprint = false): Promise<void> {
    const keyMap: Record<Direction, string[]> = {
      N: ['KeyW'],
      S: ['KeyS'],
      W: ['KeyA'],
      E: ['KeyD'],
      NE: ['KeyW', 'KeyD'],
      NW: ['KeyW', 'KeyA'],
      SE: ['KeyS', 'KeyD'],
      SW: ['KeyS', 'KeyA'],
    };

    const keys = keyMap[dir];
    for (let i = 0; i < steps; i++) {
      if (sprint) {
        await this.holdKeys(['ShiftLeft', ...keys], 80);
      } else {
        await this.holdKeys([...keys], 100);
      }
      await this.wait(60);
    }
  }

  /**
   * Executes a melee attack.
   */
  async performMeleeAttack(): Promise<void> {
    const canvas = this.getCanvas();
    const box = await canvas.boundingBox();
    if (box) {
      await this.page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
    } else {
      await this.pressKey('Space');
    }
  }

  /**
   * Executes a skill (Key Q: AoE Spin Attack, Key R: Magic Projectile).
   */
  async castSkill(skill: 'Q' | 'E'): Promise<void> {
    await this.pressKey(skill === 'E' ? 'KeyR' : 'KeyQ');
  }

  /**
   * Consumes an inventory item (Key 1: Health Potion, Key 2: Speed Potion).
   */
  async useConsumable(slot: 1 | 2): Promise<void> {
    await this.pressKey(`Digit${slot}`);
  }

  /**
   * Triggers player jump (Space).
   */
  async triggerJump(): Promise<void> {
    await this.pressKey('Space');
  }

  /**
   * Triggers player dash (Shift + Move tap).
   */
  async triggerDash(directionKey = 'KeyD'): Promise<void> {
    await this.page.keyboard.down('ShiftLeft');
    await this.page.keyboard.press(directionKey);
    await this.page.keyboard.up('ShiftLeft');
  }

  /**
   * Dispatches in-game debug console command.
   */
  async executeDebugCommand(command: string): Promise<string> {
    return await this.page.evaluate((cmd: string) => {
      if (!window.__GAME__) {
        throw new Error('window.__GAME__ diagnostics gateway not available');
      }
      return window.__GAME__.executeCommand(cmd);
    }, command);
  }

  /**
   * Steps the fixed simulation manually in test environment.
   */
  async stepSimulation(stepCount = 1, fixedDeltaSec = 0.016667): Promise<void> {
    await this.page.evaluate(
      ({ count, dt }: { count: number; dt: number }) => {
        if (!window.__GAME__) return;
        for (let i = 0; i < count; i++) {
          window.__GAME__.stepSimulation(dt);
        }
      },
      { count: stepCount, dt: fixedDeltaSec }
    );
  }

  /**
   * Pauses the simulation loop.
   */
  async pauseSimulation(): Promise<void> {
    await this.page.evaluate(() => {
      window.__GAME__?.pauseSimulation();
    });
  }

  /**
   * Resumes the simulation loop.
   */
  async resumeSimulation(): Promise<void> {
    await this.page.evaluate(() => {
      window.__GAME__?.resumeSimulation();
    });
  }

  /**
   * Sets item in browser localStorage.
   */
  async setLocalStorage(key: string, value: unknown): Promise<void> {
    const strVal = typeof value === 'string' ? value : JSON.stringify(value);
    await this.page.evaluate(
      ([k, v]: [string, string]) => {
        window.localStorage.setItem(k, v);
      },
      [key, strVal] as [string, string]
    );
  }

  /**
   * Reads item from browser localStorage.
   */
  async getLocalStorage(key: string): Promise<string | null> {
    return await this.page.evaluate((k: string) => {
      return window.localStorage.getItem(k);
    }, key);
  }

  /**
   * Polls until the given state predicate returns true or timeout expires.
   */
  async waitForCondition(
    predicate: (s: GameSnapshot) => boolean,
    timeoutMs = 5000,
    pollIntervalMs = 50
  ): Promise<GameSnapshot> {
    const startTime = Date.now();
    while (Date.now() - startTime < timeoutMs) {
      const state = await this.getState();
      if (predicate(state)) {
        return state;
      }
      await this.wait(pollIntervalMs);
    }
    const finalState = await driverSnapshot(this);
    throw new Error(
      `Condition timed out after ${timeoutMs}ms. Final state: ${JSON.stringify(
        {
          player: finalState.player,
          enemies: finalState.enemies.length,
          world: finalState.world,
        },
        null,
        2
      )}`
    );
  }
}

async function driverSnapshot(driver: GameDriver): Promise<GameSnapshot> {
  return await driver.getState();
}
