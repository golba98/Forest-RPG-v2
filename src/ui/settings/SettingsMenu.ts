import type { InputManager } from '../../core/input/InputManager';
import type { InputAction } from '../../core/input/types';
import type { Game, SceneState } from '../../game/Game';
import type { SettingsStore } from '../../persistence/SettingsStore';
import { COLOR_MODES, type ColorMode } from '../../types/colorModes';
import { LANGUAGES, type Language } from '../../types/languages';
import { languageCode, translate } from '../i18n';

interface SettingsMenuOptions {
  panel: HTMLElement;
  settings: SettingsStore;
  input: InputManager | undefined;
  game: Game;
  scene: SceneState;
  applySettings: () => void;
  onBack: (scene: SceneState) => void;
}

/** Owns settings controls and the lifetime of their temporary key listener. */
export function settingsMenu({
  panel,
  settings,
  input,
  game,
  scene,
  applySettings,
  onBack,
}: SettingsMenuOptions): () => void {
  let cancelCapture: (() => void) | null = null;
  const t = (text: string) => translate(settings.value.language, text);
  function settingRow(section: HTMLElement, text: string): HTMLLabelElement {
    const row = document.createElement('label');
    row.className = 'setting-row';
    const name = document.createElement('span');
    name.className = 'setting-label';
    name.textContent = t(text);
    row.append(name);
    section.append(row);
    return row;
  }
  function render(): void {
    cancelCapture?.();
    cancelCapture = null;
    const box = panel.firstElementChild;
    if (!box) return;
    box.replaceChildren();
    panel.dataset.screen = 'settings';
    box.className = 'menu-panel settings-panel';
    const heading = document.createElement('h1');
    heading.textContent = t('Settings');
    box.append(heading);
    const layout = document.createElement('div');
    layout.className = 'settings-layout';
    box.append(layout);
    const navigation = document.createElement('nav');
    navigation.className = 'settings-nav';
    navigation.setAttribute('aria-label', 'Settings sections');
    layout.append(navigation);
    const body = document.createElement('div');
    body.className = 'settings-body';
    layout.append(body);
    const group = (name: string) => {
      const section = document.createElement('fieldset');
      section.dataset.section = name;
      section.hidden = name !== 'Display';
      const legend = document.createElement('legend');
      legend.textContent = t(name);
      section.append(legend);
      body.append(section);
      const tab = document.createElement('button');
      tab.textContent = t(name);
      tab.type = 'button';
      tab.className = 'settings-tab';
      tab.setAttribute('aria-pressed', String(name === 'Display'));
      tab.onclick = () => {
        for (const other of body.querySelectorAll<HTMLElement>('fieldset'))
          other.hidden = other !== section;
        for (const other of navigation.querySelectorAll('button'))
          other.setAttribute('aria-pressed', String(other === tab));
        body.scrollTop = 0;
      };
      navigation.append(tab);
      return section;
    };
    const display = group('Display'),
      gameplay = group('Gameplay'),
      audio = group('Audio'),
      access = group('Accessibility');
    for (const [key, text, section] of [
      ['lighting', 'Lighting', display],
      ['clouds', 'Clouds', display],
      ['particles', 'Ambient particles', display],
      ['showStars', 'Stars at night', display],
      ['shake', 'Camera shake', display],
      ['fireflies', 'Fireflies', display],
      ['performance', 'Performance overlay', display],
      ['hud', 'Show HUD', gameplay],
      ['tutorials', 'Show tutorials', gameplay],
      ['invertY', 'Invert Y axis', gameplay],
    ] as const) {
      const label = settingRow(section, text);
      label.classList.add('setting-row--toggle');
      const control = document.createElement('input');
      control.type = 'checkbox';
      control.checked = settings.value[key];
      control.onchange = () => {
        settings.value[key] = control.checked;
        persist();
      };
      label.append(control);
    }
    for (const [key, text] of [
      ['masterVolume', 'Master volume'],
      ['musicVolume', 'Music volume'],
      ['sfxVolume', 'Effects volume'],
    ] as const) {
      const label = settingRow(audio, text);
      const value = document.createElement('span');
      value.className = 'setting-value';
      const control = document.createElement('input');
      control.type = 'range';
      control.min = '0';
      control.max = '1';
      control.step = '.05';
      control.value = String(settings.value[key]);
      const output = document.createElement('output');
      output.textContent = `${Math.round(Number(control.value) * 100)}%`;
      control.oninput = () => {
        settings.value[key] = Number(control.value);
        output.textContent = `${Math.round(Number(control.value) * 100)}%`;
        persist();
      };
      value.append(control, output);
      label.append(value);
    }
    const select = (
      section: HTMLElement,
      text: string,
      choices: Array<[string, string]>,
      current: string,
      change: (v: string) => void,
    ) => {
      const label = settingRow(section, text);
      const control = document.createElement('select');
      for (const [value, title] of choices) control.append(new Option(t(title), value));
      control.value = current;
      control.onchange = () => {
        change(control.value);
        persist();
      };
      label.append(control);
    };
    select(
      display,
      'Frame limit',
      [60, 120, 144, 170, 240, 0].map((n) => [String(n), n ? `${n} FPS` : 'Unlimited']),
      String(settings.value.maxFps),
      (v) => (settings.value.maxFps = Number(v)),
    );
    const sensitivity = settingRow(gameplay, 'Movement sensitivity');
    const sensitivityControls = document.createElement('span');
    sensitivityControls.className = 'setting-value';
    const slider = document.createElement('input');
    slider.type = 'range';
    slider.min = '1';
    slider.max = '10';
    slider.step = '1';
    slider.value = String(settings.value.sensitivity);
    const sensitivityValue = document.createElement('output');
    sensitivityValue.textContent = slider.value;
    slider.oninput = () => {
      settings.value.sensitivity = Number(slider.value);
      sensitivityValue.textContent = slider.value;
      persist();
    };
    sensitivityControls.append(slider, sensitivityValue);
    sensitivity.append(sensitivityControls);
    select(
      gameplay,
      'Difficulty (next world)',
      [
        ['easy', 'Easy'],
        ['normal', 'Normal'],
        ['hard', 'Hard'],
      ],
      settings.value.difficulty,
      (v) => {
        if (v === 'easy' || v === 'normal' || v === 'hard') settings.value.difficulty = v;
      },
    );
    select(
      access,
      'Language',
      LANGUAGES.map((language) => [language, language]),
      settings.value.language,
      (value) => {
        if (LANGUAGES.some((language) => language === value)) {
          settings.value.language = value as Language;
          document.documentElement.lang = languageCode(settings.value.language);
          queueMicrotask(() => {
            render();
            const tab = panel.querySelectorAll<HTMLButtonElement>('.settings-tab')[3];
            tab?.click();
            tab?.focus();
          });
        }
      },
    );
    select(
      access,
      'Color mode',
      COLOR_MODES.map((mode) => [mode, mode]),
      settings.value.colorMode,
      (v) => {
        if (COLOR_MODES.some((mode) => mode === v)) settings.value.colorMode = v as ColorMode;
      },
    );
    select(
      access,
      'UI scale',
      [
        ['0.8', 'Compact'],
        ['1', 'Default'],
        ['1.2', 'Large'],
      ],
      String(settings.value.uiScale),
      (v) => (settings.value.uiScale = Number(v)),
    );
    const controls = group('Controls');
    const actions: Array<[InputAction, string]> = [
      ['moveUp', 'Move up'],
      ['moveDown', 'Move down'],
      ['moveLeft', 'Move left'],
      ['moveRight', 'Move right'],
      ['sprint', 'Sprint'],
      ['jump', 'Jump'],
      ['dash', 'Dash'],
      ['attack', 'Attack'],
      ['interact', 'Interact'],
      ['skillQ', 'Spin'],
      ['skillE', 'Magic bolt'],
      ['potionHealth', 'Health potion'],
      ['potionSpeed', 'Speed potion'],
      ['pause', 'Pause'],
    ];
    for (const [action, name] of actions) {
      const label = settingRow(controls, name);
      const key = document.createElement('button');
      key.className = 'key-binding';
      key.textContent = String(input?.getKeybinds()[action]?.[0] ?? 'Unbound');
      key.onclick = () => {
        cancelCapture?.();
        key.textContent = t('Press a key…');
        const capture = (event: KeyboardEvent) => {
          event.preventDefault();
          event.stopImmediatePropagation();
          window.removeEventListener('keydown', capture, true);
          if (event.code !== 'Escape' && input) {
            const bindings = input.getKeybinds();
            for (const other of Object.keys(bindings) as InputAction[])
              if (other !== action) {
                input.unbindAction(other, event.code);
                if (event.keyCode) input.unbindAction(other, event.keyCode);
              }
            input.setKeybinds({ [action]: [event.code] });
            input.saveToStorage();
          }
          key.textContent = String(input?.getKeybinds()[action]?.[0] ?? 'Unbound');
        };
        cancelCapture = () => {
          window.removeEventListener('keydown', capture, true);
          key.textContent = String(input?.getKeybinds()[action]?.[0] ?? 'Unbound');
        };
        window.addEventListener('keydown', capture, true);
      };
      label.append(key);
    }
    const restore = document.createElement('button');
    restore.textContent = t('Reset controls');
    restore.onclick = () => {
      input?.resetToDefaults();
      input?.saveToStorage();
      render();
    };
    controls.append(restore);
    const replay = document.createElement('button');
    replay.textContent = t('Replay tutorial');
    replay.onclick = () => game.startNewGame({ tutorial: true });
    gameplay.append(replay);
    const fullscreen = document.createElement('button');
    fullscreen.textContent = t('Toggle fullscreen');
    fullscreen.onclick = () => {
      void game.toggleFullscreen();
    };
    display.append(fullscreen);
    const footer = document.createElement('footer');
    footer.className = 'settings-footer';
    box.append(footer);
    const reset = document.createElement('button');
    reset.textContent = t('Reset settings');
    reset.onclick = () => {
      settings.reset();
      applySettings();
      render();
    };
    footer.append(reset);
    const back = document.createElement('button');
    back.className = 'menu-button--primary';
    back.textContent = t('Back');
    back.onclick = () => onBack(scene);
    footer.append(back);
    navigation.querySelector('button')?.focus();
  }
  function persist(): void {
    const saved = settings.save();
    applySettings();
    if (!saved) {
      const notice = document.createElement('p');
      notice.setAttribute('role', 'status');
      notice.textContent = 'Preferences apply for this session but could not be saved.';
      panel.firstElementChild?.append(notice);
    }
  }
  render();
  return () => {
    cancelCapture?.();
    cancelCapture = null;
  };
}
