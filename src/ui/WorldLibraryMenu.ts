import type { SaveManager } from '../persistence/SaveManager';
import { worldSeed } from '../persistence/WorldLibrary';
import type { Difficulty } from '../types/world';

export function action(host: HTMLElement, label: string, run: () => void): HTMLButtonElement {
  const b = document.createElement('button');
  b.textContent = label;
  b.onclick = run;
  host.append(b);
  return b;
}
export function download(blob: Blob, name: string): void {
  const url = URL.createObjectURL(blob),
    a = document.createElement('a');
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
export async function worldLibraryMenu(
  host: HTMLElement,
  saves: SaveManager,
  difficulty: Difficulty,
  back: () => void,
): Promise<void> {
  let busy = false;
  const run = (task: () => Promise<void>) => {
    if (busy) return;
    busy = true;
    host.dataset.busy = 'true';
    const buttons = [...host.querySelectorAll('button')];
    buttons.forEach((b) => (b.disabled = true));
    host.querySelector('[role="alert"]')?.remove();
    void Promise.resolve()
      .then(task)
      .catch((e: unknown) => {
        const p = document.createElement('p');
        p.setAttribute('role', 'alert');
        p.textContent = e instanceof Error ? e.message : 'World operation failed. Try again.';
        (host.isConnected ? host : document.querySelector('#game-overlay .menu-panel'))?.append(p);
      })
      .finally(() => {
        busy = false;
        delete host.dataset.busy;
        buttons.forEach((b) => (b.disabled = false));
      });
  };
  const render = async () => {
    const entries = await saves.listWorlds();
    host.className = 'menu-panel library-panel';
    host.replaceChildren();
    const h = document.createElement('h1');
    h.textContent = 'Your Worlds';
    host.append(h);
    action(host, 'Create World', create).dataset.testid = 'create-world-button';
    const file = document.createElement('input');
    file.type = 'file';
    file.accept = '.json,.jsonl';
    file.hidden = true;
    file.onchange = () => {
      const selected = file.files?.[0];
      if (selected)
        run(async () => {
          await saves.importWorld(selected);
          await render();
        });
    };
    host.append(file);
    action(host, 'Import World', () => file.click());
    if (!entries.length) {
      const p = document.createElement('p');
      p.textContent = 'Your next adventure starts here. Create a world to explore all five biomes.';
      host.append(p);
    }
    const list = document.createElement('div');
    list.className = 'world-list';
    host.append(list);
    for (const entry of entries) {
      const row = document.createElement('article');
      row.className = 'world-entry';
      row.dataset.worldId = entry.id;
      const title = document.createElement('h2');
      title.textContent = entry.name;
      const detail = document.createElement('p');
      detail.textContent = `${entry.difficulty} · Level ${entry.level} · Seed ${entry.seed} · ${new Date(entry.lastPlayedAt).toLocaleString()}`;
      row.append(title, detail);
      list.append(row);
      action(row, 'Play / Resume', () => run(() => saves.openWorld(entry)));
      action(row, 'Rename', () => {
        row.replaceChildren(title);
        const input = document.createElement('input');
        input.value = entry.name;
        input.maxLength = 64;
        input.setAttribute('aria-label', 'World name');
        row.append(input);
        action(row, 'Save name', () =>
          run(async () => {
            await saves.renameWorld(entry, input.value);
            await render();
          }),
        );
        action(row, 'Cancel', () => run(render));
        input.focus();
      });
      action(row, 'Export', () =>
        run(async () =>
          download(
            await saves.exportWorld(entry),
            `${entry.name.replace(/[^a-z0-9_-]/gi, '_')}.${entry.kind === 'streamed' ? 'jsonl' : 'json'}`,
          ),
        ),
      );
      action(row, 'Delete', () => {
        row.replaceChildren(title);
        const p = document.createElement('p');
        p.textContent = `Delete “${entry.name}”? This cannot be undone.`;
        row.append(p);
        action(row, 'Confirm delete', () =>
          run(async () => {
            await saves.deleteWorld(entry);
            await render();
          }),
        );
        action(row, 'Cancel', () => run(render));
      });
    }
    action(host, 'Back', back);
    host.querySelector('button')?.focus();
  };
  const create = () => {
    host.replaceChildren();
    const h = document.createElement('h1');
    h.textContent = 'Create World';
    host.append(h);
    const field = (text: string, value: string) => {
      const l = document.createElement('label');
      l.textContent = text;
      const i = document.createElement('input');
      i.value = value;
      l.append(i);
      host.append(l);
      return i;
    };
    const name = field('World name', 'New World');
    name.maxLength = 64;
    const seed = field('Seed (optional)', '');
    seed.inputMode = 'numeric';
    const label = document.createElement('label');
    label.textContent = 'Difficulty';
    const select = document.createElement('select');
    for (const d of ['easy', 'normal', 'hard']) {
      const o = document.createElement('option');
      o.value = d;
      o.textContent = d.charAt(0).toUpperCase() + d.slice(1);
      select.append(o);
    }
    select.value = difficulty;
    label.append(select);
    host.append(label);
    const p = document.createElement('p');
    p.textContent =
      'One endless world. Forest, meadow, rocky highlands, wetlands and autumn woodland.';
    host.append(p);
    action(host, 'Create and Play', () =>
      run(() => saves.createWorld(name.value, worldSeed(seed.value), select.value as Difficulty)),
    );
    action(host, 'Cancel', () => run(render));
    name.focus();
  };
  await render();
}
