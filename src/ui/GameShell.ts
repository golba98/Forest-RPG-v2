import './theme.css';
import type { InputManager } from '../core/input/InputManager';
import type { InputAction } from '../core/input/types';
import type { Game, GameShell as Shell, SceneState } from '../game/Game';
import { OnboardingStore } from '../persistence/OnboardingStore';
import type { SettingsStore } from '../persistence/SettingsStore';

export class GameShell implements Shell {
  game!: Game;
  input?: InputManager;
  readonly onboarding = new OnboardingStore(localStorage);
  private video = document.createElement('video');
  private panel = document.createElement('section');
  private cancelCapture: (() => void) | null = null;
  private previousFocus: HTMLElement | null = null;
  constructor(private settings: SettingsStore, private applySettings: () => void) {
    this.panel.id = 'game-overlay'; this.panel.hidden = true;
    this.panel.setAttribute('role', 'dialog'); this.panel.setAttribute('aria-modal', 'true'); this.panel.setAttribute('aria-label', 'Forest RPG menu');
    this.video.src = '/assets/video/menu_vid.webm'; this.video.poster = '/assets/images/background/menu_bg.png';
    this.video.muted = true; this.video.loop = true; this.video.playsInline = true;
    this.video.style.cssText = 'position:fixed;inset:0;width:100%;height:100%;object-fit:cover;z-index:9;pointer-events:none';
    document.body.append(this.video, this.panel);
    this.panel.style.background = 'linear-gradient(#06120b33,#06120b88)';
    this.panel.addEventListener('keydown', e => {
      if (e.code === 'Escape') { e.preventDefault(); if (this.game.currentScene === 'paused') this.game.resume(); }
      if (e.code !== 'Tab') return;
      const controls = [...this.panel.querySelectorAll<HTMLElement>('button,input,select')];
      const first = controls[0], last = controls.at(-1);
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last?.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first?.focus(); }
    });
  }
  onLoadingProgress(progress: number, status: string): void {
    const label = document.querySelector('#loading-screen span'); if (label) label.textContent = `${status} ${Math.round(progress * 100)}%`;
  }
  onLoadingFailed(error: Error): void { const el = document.querySelector('#loading-screen'); if (el) el.textContent = `Unable to start: ${error.message}`; }
  onSceneChanged(scene: SceneState): void {
    this.cancelCapture?.(); this.cancelCapture = null;
    if (scene === 'loading' || scene === 'error') return;
    document.querySelector('#loading-screen')?.classList.add('hidden');
    this.panel.hidden = scene === 'playing';
    this.video.hidden = scene !== 'menu';
    if (scene === 'menu') void this.video.play().catch(() => { this.video.hidden = true; this.panel.style.background = '#08150e url(/assets/images/background/menu_bg.png) center/cover'; });
    else this.video.pause();
    if (scene === 'playing') { this.previousFocus?.focus(); return; }
    this.previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    this.panel.dataset.screen = scene;
    this.panel.replaceChildren(); const box = document.createElement('div'); this.panel.append(box);
    const title = document.createElement('h1'); title.textContent = scene === 'menu' ? 'Forest RPG V2' : scene === 'paused' ? 'Paused' : scene === 'victory' ? 'Victory' : 'Game Over'; box.append(title);
    const button = (label: string, id: string, action: () => void) => {
      const el = document.createElement('button'); el.textContent = label; el.dataset.testid = id; el.onclick = action; box.append(el);
    };
    if (scene === 'paused') button('Resume', 'resume-button', () => this.game.resume());
    else { button('Play', 'new-game-button', () => this.play()); button('Tutorial', 'tutorial-button', () => this.game.startNewGame({ tutorial: true })); }
    button('Settings', 'settings-button', () => this.showSettings(scene));
    if (scene !== 'menu') button('Main Menu', 'main-menu-button', () => this.game.returnToMenu());
    this.panel.querySelector('button')?.focus();
  }
  private play(): void {
    if (!this.settings.value.tutorials || this.onboarding.value.seen || this.onboarding.value.complete) {
      this.game.startNewGame({ difficulty: this.settings.value.difficulty }); return;
    }
    this.panel.dataset.screen = 'welcome';
    const box = this.panel.firstElementChild; if (!box) return; box.replaceChildren();
    const h = document.createElement('h1'); h.textContent = 'Welcome to the forest'; box.append(h);
    const p = document.createElement('p'); p.textContent = 'Learn to explore, fight and open the portal in a short training glade.'; box.append(p);
    const start = document.createElement('button'); start.textContent = 'Start tutorial'; start.onclick = () => { this.onboarding.value.seen = true; this.onboarding.save(); this.game.startNewGame({ tutorial: true }); }; box.append(start);
    const skip = document.createElement('button'); skip.textContent = 'Skip for now'; skip.onclick = () => { this.onboarding.value.seen = true; this.onboarding.save(); this.game.startNewGame({ difficulty: this.settings.value.difficulty }); }; box.append(skip);
    const label = document.createElement('label'); label.textContent = 'Don’t show automatically again'; const checkbox = document.createElement('input'); checkbox.type = 'checkbox'; checkbox.onchange = () => { this.settings.value.tutorials = !checkbox.checked; this.persist(); }; label.append(checkbox); box.append(label); start.focus();
  }
  private showSettings(scene: SceneState): void {
    const box = this.panel.firstElementChild; if (!box) return; box.replaceChildren(); this.panel.dataset.screen = 'settings';
    const heading = document.createElement('h1'); heading.textContent = 'Settings'; box.append(heading);
    const body = document.createElement('div'); body.className = 'settings-body'; box.append(body);
    const group = (name: string) => { const section = document.createElement('fieldset'); const legend = document.createElement('legend'); legend.textContent = name; section.append(legend); body.append(section); return section; };
    const display = group('Display'), gameplay = group('Gameplay'), audio = group('Audio'), access = group('Accessibility');
    for (const [key, text, section] of [['lighting','Lighting',display], ['clouds','Clouds',display], ['particles','Ambient particles',display], ['hud','Show HUD',gameplay], ['tutorials','Show tutorials',gameplay], ['invertY','Invert Y axis',gameplay]] as const) {
      const label = document.createElement('label'); label.textContent = text; const control = document.createElement('input'); control.type = 'checkbox'; control.checked = this.settings.value[key]; control.onchange = () => { this.settings.value[key] = control.checked; this.persist(); }; label.append(control); section.append(label);
    }
    for (const [key, text] of [['masterVolume','Master volume'], ['musicVolume','Music volume'], ['sfxVolume','Effects volume']] as const) {
      const label = document.createElement('label'); label.textContent = text; const control = document.createElement('input'); control.type = 'range'; control.min = '0'; control.max = '1'; control.step = '.05'; control.value = String(this.settings.value[key]); const output = document.createElement('output'); output.textContent = `${Math.round(Number(control.value) * 100)}%`; control.oninput = () => { this.settings.value[key] = Number(control.value); output.textContent = `${Math.round(Number(control.value) * 100)}%`; this.persist(); }; label.append(control, output); audio.append(label);
    }
    const select = (section: HTMLElement, text: string, choices: Array<[string,string]>, current: string, change: (v: string) => void) => {
      const label = document.createElement('label'); label.textContent = text; const control = document.createElement('select'); for (const [value, title] of choices) control.append(new Option(title, value)); control.value = current; control.onchange = () => { change(control.value); this.persist(); }; label.append(control); section.append(label);
    };
    select(display, 'Frame limit', [60,120,144,170,240,0].map(n => [String(n), n ? `${n} FPS` : 'Unlimited']), String(this.settings.value.maxFps), v => this.settings.value.maxFps = Number(v));
    select(gameplay, 'Difficulty (next world)', [['easy','Easy'],['normal','Normal'],['hard','Hard']], this.settings.value.difficulty, v => { if (v === 'easy' || v === 'normal' || v === 'hard') this.settings.value.difficulty = v; });
    select(access, 'UI scale', [['0.8','Compact'],['1','Default'],['1.2','Large']], String(this.settings.value.uiScale), v => this.settings.value.uiScale = Number(v));
    const controls = group('Controls');
    const actions: Array<[InputAction, string]> = [['moveUp','Move up'],['moveDown','Move down'],['moveLeft','Move left'],['moveRight','Move right'],['sprint','Sprint'],['attack','Attack'],['skillQ','Spin'],['skillE','Magic bolt'],['potionHealth','Health potion'],['potionSpeed','Speed potion'],['pause','Pause']];
    for (const [action, name] of actions) {
      const label = document.createElement('label'); label.textContent = name;
      const key = document.createElement('button'); key.textContent = String(this.input?.getKeybinds()[action]?.[0] ?? 'Unbound');
      key.onclick = () => {
        this.cancelCapture?.();
        key.textContent = 'Press a key…';
        const capture = (event: KeyboardEvent) => {
          event.preventDefault(); event.stopImmediatePropagation();
          window.removeEventListener('keydown', capture, true);
          if (event.code !== 'Escape') { this.input?.setKeybinds({ [action]: [event.code] }); this.input?.saveToStorage(); }
          key.textContent = String(this.input?.getKeybinds()[action]?.[0] ?? 'Unbound');
        };
        this.cancelCapture = () => { window.removeEventListener('keydown', capture, true); key.textContent = String(this.input?.getKeybinds()[action]?.[0] ?? 'Unbound'); };
        window.addEventListener('keydown', capture, true);
      }; label.append(key); controls.append(label);
    }
    const restore = document.createElement('button'); restore.textContent = 'Reset controls'; restore.onclick = () => { this.input?.resetToDefaults(); this.input?.saveToStorage(); this.showSettings(scene); }; controls.append(restore);
    const replay = document.createElement('button'); replay.textContent = 'Replay tutorial'; replay.onclick = () => this.game.startNewGame({ tutorial: true }); gameplay.append(replay);
    const fullscreen = document.createElement('button'); fullscreen.textContent = 'Toggle fullscreen'; fullscreen.onclick = () => { void this.game.toggleFullscreen(); }; display.append(fullscreen);
    const reset = document.createElement('button'); reset.textContent = 'Reset settings'; reset.onclick = () => { this.settings.reset(); this.applySettings(); this.showSettings(scene); }; box.append(reset);
    const back = document.createElement('button'); back.textContent = 'Back'; back.onclick = () => this.onSceneChanged(scene); box.append(back); this.panel.querySelector('input')?.focus();
  }
  private persist(): void { const saved = this.settings.save(); this.applySettings(); if (!saved) { const notice = document.createElement('p'); notice.setAttribute('role', 'status'); notice.textContent = 'Preferences apply for this session but could not be saved.'; this.panel.firstElementChild?.append(notice); } }
}
