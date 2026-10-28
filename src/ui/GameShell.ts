import './theme.css';
import { LANGUAGES, type Language } from '../types/languages';
import { translate, languageCode } from './i18n';
import { COLOR_MODES, type ColorMode } from '../types/colorModes';
import type { Simulation } from '../simulation/Simulation';
import type { SaveManager } from '../persistence/SaveManager';
import type { InputManager } from '../core/input/InputManager';
import type { InputAction } from '../core/input/types';
import type { Game, GameShell as Shell, SceneState } from '../game/Game';
import { OnboardingStore } from '../persistence/OnboardingStore';
import type { SettingsStore } from '../persistence/SettingsStore';

export class GameShell implements Shell {
  game!: Game;
  input?: InputManager;
  saves?: SaveManager;
  simulation?: Simulation;
  readonly onboarding = new OnboardingStore(localStorage);
  private video = document.createElement('video');
  private panel = document.createElement('section');
  private cancelCapture: (() => void) | null = null;
  private t(text: string): string { return translate(this.settings.value.language, text); }
  private previousFocus: HTMLElement | null = null;
  constructor(private settings: SettingsStore, private applySettings: () => void) {
    this.panel.id = 'game-overlay'; this.panel.hidden = true;
    this.panel.setAttribute('role', 'dialog'); this.panel.setAttribute('aria-modal', 'true'); this.panel.setAttribute('aria-label', 'Forest RPG menu');
    this.video.src = '/assets/video/menu_vid.webm'; this.video.poster = '/assets/images/background/woodland_menu.webp';
    this.video.muted = true; this.video.loop = true; this.video.playsInline = true;
    this.video.className = 'menu-backdrop';
    document.body.append(this.video, this.panel);
    this.panel.addEventListener('keydown', e => {
      if (e.code === 'Escape') { e.preventDefault(); if (this.panel.dataset.screen === 'settings' || this.panel.dataset.screen === 'welcome') this.onSceneChanged(this.game.currentScene); else if (this.game.currentScene === 'paused') this.game.resume(); }
      if (e.code !== 'Tab') return;
      const controls = [...this.panel.querySelectorAll<HTMLElement>('button:not(:disabled),input:not(:disabled),select:not(:disabled)')].filter(control => control.getClientRects().length > 0);
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
    if (scene === 'menu') void this.video.play().catch(() => { this.video.hidden = true; this.panel.dataset.video = 'fallback'; });
    else this.video.pause();
    if (scene === 'playing') { this.previousFocus?.focus(); return; }
    this.previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    this.panel.dataset.screen = scene;
    this.panel.dataset.backdrop = scene === 'menu' ? 'menu' : 'world';
    this.panel.replaceChildren(); const box = document.createElement('div'); box.className = `menu-panel action-panel${scene === 'menu' ? ' main-menu-panel' : ''}`; this.panel.append(box);
    const title = document.createElement('h1'); title.textContent = scene === 'menu' ? 'Forest RPG V2' : scene === 'paused' ? 'Paused' : scene === 'victory' ? 'Victory' : 'Game Over'; title.textContent = this.t(title.textContent ?? ''); box.append(title);
    if (scene === 'menu') { const subtitle = document.createElement('p'); subtitle.className = 'menu-subtitle'; subtitle.textContent = this.t('A journey through the wild'); box.append(subtitle); }
    const button = (label: string, id: string, action: () => void) => {
      const el = document.createElement('button'); el.textContent = this.t(label); el.dataset.testid = id; el.onclick = action;
      if (id === 'resume-button' || id === 'continue-button' || (id === 'new-game-button' && !(scene === 'menu' && this.saves?.exists()))) el.className = 'menu-button--primary';
      box.append(el);
    };
    if (scene === 'menu' && this.saves?.exists()) button('Continue', 'continue-button', () => this.withSave(() => this.saves?.load()));
    if (scene === 'paused') button('Resume', 'resume-button', () => this.game.resume());
    else { button('Play', 'new-game-button', () => this.play()); button('Tutorial', 'tutorial-button', () => this.game.startNewGame({ tutorial: true })); }
    if (scene === 'paused') {
      button('Save game', 'save-button', () => this.withSave(() => this.saves?.save()));
      button('Export save', 'export-button', () => this.exportSave());
    }
    if (scene === 'menu') button('Import save', 'import-button', () => this.importSave());
    button('Settings', 'settings-button', () => this.showSettings(scene));
    if (scene !== 'menu') button('Main Menu', 'main-menu-button', () => this.game.returnToMenu());
    this.panel.querySelector('button')?.focus();
  }
  showCharacter(): void {
    if (!this.simulation || this.game.currentScene !== 'playing') return;
    this.game.pause(); this.panel.dataset.screen = 'character';
    const box = this.panel.firstElementChild; if (!box) return;
    box.className = 'menu-panel action-panel';
    const render = () => {
      if (!this.simulation) return;
      box.replaceChildren(); const stats = this.simulation.player.stats;
      const title = document.createElement('h1'); title.textContent = `Level ${stats.level}`; box.append(title);
      const points = document.createElement('p'); points.textContent = `Available stat points: ${stats.statPoints}`; box.append(points);
      const choices = [['health', `Health ${stats.maxHealth} / 20`], ['damage', `Damage ${stats.baseDamage}`], ['mana', `Mana ${stats.maxMana}`], ['stamina', `Stamina ${stats.maxStamina}`]] as const;
      for (const [stat, text] of choices) {
        const button = document.createElement('button'); button.textContent = `${text}  +`; button.disabled = stats.statPoints === 0 || (stat === 'health' && stats.maxHealth >= 20);
        button.onclick = () => { this.simulation?.allocateStat(stat); render(); }; box.append(button);
      }
      const close = document.createElement('button'); close.className = 'menu-button--primary'; close.textContent = 'Resume'; close.onclick = () => this.game.resume(); box.append(close); close.focus();
    };
    render();
  }
  private withSave(action: () => void): void {
    try { action(); } catch (error) {
      const notice = document.createElement('p'); notice.setAttribute('role', 'alert'); notice.textContent = error instanceof Error ? error.message : 'Unable to access saved game'; this.panel.firstElementChild?.append(notice);
    }
  }
  private exportSave(): void {
    this.withSave(() => {
      if (!this.saves) throw new Error('Save manager unavailable');
      const url = URL.createObjectURL(new Blob([this.saves.export()], { type: 'application/json' }));
      const link = document.createElement('a'); link.href = url; link.download = 'forest-rpg-save.json'; link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
    });
  }
  private importSave(): void {
    const input = document.createElement('input'); input.type = 'file'; input.accept = 'application/json,.json';
    input.onchange = () => { const file = input.files?.[0]; if (file) void file.text().then(text => this.withSave(() => this.saves?.import(text))); }; input.click();
  }
  private play(): void {
    if (!this.settings.value.tutorials || this.onboarding.value.seen || this.onboarding.value.complete) {
      this.game.startNewGame({ difficulty: this.settings.value.difficulty }); return;
    }
    this.panel.dataset.screen = 'welcome';
    const box = this.panel.firstElementChild; if (!box) return; box.replaceChildren();
    box.className = 'menu-panel action-panel';
    const h = document.createElement('h1'); h.textContent = this.t('Welcome to the forest'); box.append(h);
    const p = document.createElement('p'); p.textContent = this.t('Learn to explore, fight and open the portal in a short training glade.'); box.append(p);
    const start = document.createElement('button'); start.className = 'menu-button--primary'; start.textContent = this.t('Start tutorial'); start.onclick = () => { this.onboarding.value.seen = true; this.onboarding.save(); this.game.startNewGame({ tutorial: true }); }; box.append(start);
    const skip = document.createElement('button'); skip.textContent = this.t('Skip for now'); skip.onclick = () => { this.onboarding.value.seen = true; this.onboarding.save(); this.game.startNewGame({ difficulty: this.settings.value.difficulty }); }; box.append(skip);
    const label = document.createElement('label'); label.className = 'menu-choice'; label.textContent = this.t('Don’t show automatically again'); const checkbox = document.createElement('input'); checkbox.type = 'checkbox'; checkbox.onchange = () => { this.settings.value.tutorials = !checkbox.checked; this.persist(); }; label.append(checkbox); box.append(label); start.focus();
  }
  private settingRow(section: HTMLElement, text: string): HTMLLabelElement {
    const row = document.createElement('label');
    row.className = 'setting-row';
    const name = document.createElement('span');
    name.className = 'setting-label';
    name.textContent = this.t(text);
    row.append(name); section.append(row);
    return row;
  }
  private showSettings(scene: SceneState): void {
    const box = this.panel.firstElementChild; if (!box) return; box.replaceChildren(); this.panel.dataset.screen = 'settings';
    box.className = 'menu-panel settings-panel';
    const heading = document.createElement('h1'); heading.textContent = this.t('Settings'); box.append(heading);
    const layout = document.createElement('div'); layout.className = 'settings-layout'; box.append(layout);
    const navigation = document.createElement('nav'); navigation.className = 'settings-nav'; navigation.setAttribute('aria-label', 'Settings sections'); layout.append(navigation);
    const body = document.createElement('div'); body.className = 'settings-body'; layout.append(body);
    const group = (name: string) => {
      const section = document.createElement('fieldset'); section.dataset.section = name; section.hidden = name !== 'Display';
      const legend = document.createElement('legend'); legend.textContent = this.t(name); section.append(legend); body.append(section);
      const tab = document.createElement('button'); tab.textContent = this.t(name); tab.type = 'button'; tab.className = 'settings-tab'; tab.setAttribute('aria-pressed', String(name === 'Display'));
      tab.onclick = () => { for (const other of body.querySelectorAll<HTMLElement>('fieldset')) other.hidden = other !== section; for (const other of navigation.querySelectorAll('button')) other.setAttribute('aria-pressed', String(other === tab)); body.scrollTop = 0; };
      navigation.append(tab); return section;
    };
    const display = group('Display'), gameplay = group('Gameplay'), audio = group('Audio'), access = group('Accessibility');
    for (const [key, text, section] of [['lighting','Lighting',display], ['clouds','Clouds',display], ['particles','Ambient particles',display], ['showStars','Stars at night',display], ['shake','Camera shake',display], ['fireflies','Fireflies',display], ['performance','Performance overlay',display], ['hud','Show HUD',gameplay], ['tutorials','Show tutorials',gameplay], ['invertY','Invert Y axis',gameplay]] as const) {
      const label = this.settingRow(section, text); label.classList.add('setting-row--toggle'); const control = document.createElement('input'); control.type = 'checkbox'; control.checked = this.settings.value[key]; control.onchange = () => { this.settings.value[key] = control.checked; this.persist(); }; label.append(control);
    }
    for (const [key, text] of [['masterVolume','Master volume'], ['musicVolume','Music volume'], ['sfxVolume','Effects volume']] as const) {
      const label = this.settingRow(audio, text); const value = document.createElement('span'); value.className = 'setting-value'; const control = document.createElement('input'); control.type = 'range'; control.min = '0'; control.max = '1'; control.step = '.05'; control.value = String(this.settings.value[key]); const output = document.createElement('output'); output.textContent = `${Math.round(Number(control.value) * 100)}%`; control.oninput = () => { this.settings.value[key] = Number(control.value); output.textContent = `${Math.round(Number(control.value) * 100)}%`; this.persist(); }; value.append(control, output); label.append(value);
    }
    const select = (section: HTMLElement, text: string, choices: Array<[string,string]>, current: string, change: (v: string) => void) => {
      const label = this.settingRow(section, text); const control = document.createElement('select'); for (const [value, title] of choices) control.append(new Option(this.t(title), value)); control.value = current; control.onchange = () => { change(control.value); this.persist(); }; label.append(control);
    };
    select(display, 'Frame limit', [60,120,144,170,240,0].map(n => [String(n), n ? `${n} FPS` : 'Unlimited']), String(this.settings.value.maxFps), v => this.settings.value.maxFps = Number(v));
    const sensitivity = this.settingRow(gameplay, 'Movement sensitivity'); const sensitivityControls = document.createElement('span'); sensitivityControls.className = 'setting-value'; const slider = document.createElement('input'); slider.type = 'range'; slider.min = '1'; slider.max = '10'; slider.step = '1'; slider.value = String(this.settings.value.sensitivity); const sensitivityValue = document.createElement('output'); sensitivityValue.textContent = slider.value; slider.oninput = () => { this.settings.value.sensitivity = Number(slider.value); sensitivityValue.textContent = slider.value; this.persist(); }; sensitivityControls.append(slider, sensitivityValue); sensitivity.append(sensitivityControls);
    select(gameplay, 'Difficulty (next world)', [['easy','Easy'],['normal','Normal'],['hard','Hard']], this.settings.value.difficulty, v => { if (v === 'easy' || v === 'normal' || v === 'hard') this.settings.value.difficulty = v; });
    select(access, 'Language', LANGUAGES.map(language => [language, language]), this.settings.value.language, value => {
      if (LANGUAGES.some(language => language === value)) { this.settings.value.language = value as Language; document.documentElement.lang = languageCode(this.settings.value.language); queueMicrotask(() => { this.showSettings(scene); const tab = this.panel.querySelectorAll<HTMLButtonElement>('.settings-tab')[3]; tab?.click(); tab?.focus(); }); }
    });
    select(access, 'Color mode', COLOR_MODES.map(mode => [mode, mode]), this.settings.value.colorMode, v => { if (COLOR_MODES.some(mode => mode === v)) this.settings.value.colorMode = v as ColorMode; });
    select(access, 'UI scale', [['0.8','Compact'],['1','Default'],['1.2','Large']], String(this.settings.value.uiScale), v => this.settings.value.uiScale = Number(v));
    const controls = group('Controls');
    const actions: Array<[InputAction, string]> = [['moveUp','Move up'],['moveDown','Move down'],['moveLeft','Move left'],['moveRight','Move right'],['sprint','Sprint'],['jump','Jump'],['dash','Dash'],['attack','Attack'],['skillQ','Spin'],['skillE','Magic bolt'],['potionHealth','Health potion'],['potionSpeed','Speed potion'],['pause','Pause']];
    for (const [action, name] of actions) {
      const label = this.settingRow(controls, name);
      const key = document.createElement('button'); key.className = 'key-binding'; key.textContent = String(this.input?.getKeybinds()[action]?.[0] ?? 'Unbound');
      key.onclick = () => {
        this.cancelCapture?.();
        key.textContent = this.t('Press a key…');
        const capture = (event: KeyboardEvent) => {
          event.preventDefault(); event.stopImmediatePropagation();
          window.removeEventListener('keydown', capture, true);
          if (event.code !== 'Escape' && this.input) {
            const bindings = this.input.getKeybinds();
            for (const other of Object.keys(bindings) as InputAction[]) if (other !== action) {
              this.input.unbindAction(other, event.code);
              if (event.keyCode) this.input.unbindAction(other, event.keyCode);
            }
            this.input.setKeybinds({ [action]: [event.code] }); this.input.saveToStorage();
          }
          key.textContent = String(this.input?.getKeybinds()[action]?.[0] ?? 'Unbound');
        };
        this.cancelCapture = () => { window.removeEventListener('keydown', capture, true); key.textContent = String(this.input?.getKeybinds()[action]?.[0] ?? 'Unbound'); };
        window.addEventListener('keydown', capture, true);
      }; label.append(key);
    }
    const restore = document.createElement('button'); restore.textContent = this.t('Reset controls'); restore.onclick = () => { this.input?.resetToDefaults(); this.input?.saveToStorage(); this.showSettings(scene); }; controls.append(restore);
    const replay = document.createElement('button'); replay.textContent = this.t('Replay tutorial'); replay.onclick = () => this.game.startNewGame({ tutorial: true }); gameplay.append(replay);
    const fullscreen = document.createElement('button'); fullscreen.textContent = this.t('Toggle fullscreen'); fullscreen.onclick = () => { void this.game.toggleFullscreen(); }; display.append(fullscreen);
    const footer = document.createElement('footer'); footer.className = 'settings-footer'; box.append(footer);
    const reset = document.createElement('button'); reset.textContent = this.t('Reset settings'); reset.onclick = () => { this.settings.reset(); this.applySettings(); this.showSettings(scene); }; footer.append(reset);
    const back = document.createElement('button'); back.className = 'menu-button--primary'; back.textContent = this.t('Back'); back.onclick = () => this.onSceneChanged(scene); footer.append(back); navigation.querySelector('button')?.focus();
  }
  private persist(): void { const saved = this.settings.save(); this.applySettings(); if (!saved) { const notice = document.createElement('p'); notice.setAttribute('role', 'status'); notice.textContent = 'Preferences apply for this session but could not be saved.'; this.panel.firstElementChild?.append(notice); } }
}
