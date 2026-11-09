import { BIOME_IDS, type BiomeId } from '../world/Biomes';
import type { Game } from '../game/Game';
import type { Simulation } from '../simulation/Simulation';

const BIOME_COPY: Record<BiomeId, { name: string; description: string }> = {
  forest: {
    name: 'Forest',
    description: 'Deep green canopies, fern-lined clearings and sheltered river valleys.',
  },
  meadow: {
    name: 'Meadow',
    description: 'Open grassy hills, wildflower patches and scattered birch and rowan.',
  },
  highlands: {
    name: 'Rocky Highlands',
    description: 'Rugged ridges, wind-shaped pines and rocky slopes with open views.',
  },
  wetlands: {
    name: 'Wetlands',
    description: 'Willows, alder, reeds and shallow pools along quiet waterways.',
  },
  autumn: {
    name: 'Autumn Woodland',
    description: 'Copper maples, golden birches and warm, leaf-strewn woodland.',
  },
};
export function biomeChoices(
  host: HTMLElement,
  explore: (id: BiomeId) => void,
  back: () => void,
): void {
  host.className = 'menu-panel biome-panel';
  host.replaceChildren();
  const title = document.createElement('h1');
  title.textContent = 'Biome Walk';
  host.append(title);
  const intro = document.createElement('p');
  intro.className = 'biome-intro';
  intro.textContent = 'Choose a starting place. Every landscape belongs to the same endless world.';
  host.append(intro);
  const cards = document.createElement('div');
  cards.className = 'biome-cards';
  host.append(cards);
  for (const id of BIOME_IDS) {
    const card = document.createElement('article');
    card.className = `biome-card biome-${id}`;
    const image = document.createElement('img');
    image.src = `/assets/images/biome-previews/${id}.png`;
    image.alt = `${BIOME_COPY[id].name} in Forest RPG`;
    image.loading = 'lazy';
    card.append(image);
    const name = document.createElement('h2');
    name.textContent = BIOME_COPY[id].name;
    card.append(name);
    const description = document.createElement('p');
    description.textContent = BIOME_COPY[id].description;
    card.append(description);
    const button = document.createElement('button');
    button.textContent = 'Explore';
    button.setAttribute('aria-label', `Explore ${BIOME_COPY[id].name}`);
    button.dataset.testid = `explore-${id}`;
    button.onclick = () => explore(id);
    card.append(button);
    cards.append(card);
  }
  const button = document.createElement('button');
  button.textContent = 'Back';
  button.className = 'biome-back';
  button.onclick = back;
  host.append(button);
  cards.querySelector('button')?.focus();
}
export class BiomeWalkHud {
  readonly element = document.createElement('aside');
  private readonly label = document.createElement('span');
  private last = '';
  constructor(change: () => void, home: () => void, menu: () => void) {
    this.element.className = 'biome-walk-hud';
    this.element.dataset.testid = 'biome-walk-hud';
    this.element.hidden = true;
    this.element.append(this.label);
    for (const [text, action] of [
      ['Change Biome', change],
      ['Return to Spawn', home],
      ['Return to Menu', menu],
    ] as const) {
      const b = document.createElement('button');
      b.textContent = text;
      b.onclick = action;
      this.element.append(b);
    }
    document.body.append(this.element);
  }
  update(game: Game, simulation?: Simulation): void {
    const stream = simulation?.stream;
    this.element.hidden = !stream?.exploration || game.currentScene !== 'playing';
    if (this.element.hidden || !simulation || !stream) return;
    const p = stream.globalPosition(simulation.player);
    const id =
      BIOME_IDS[stream.generator.geography?.sample(Math.floor(p.x), Math.floor(p.y)).biome ?? 0]!;
    const text = `${BIOME_COPY[id].name} · ${Math.floor(p.x)}, ${Math.floor(p.y)} · Seed ${stream.descriptor.seed}`;
    if (text !== this.last) {
      this.label.textContent = text;
      this.last = text;
    }
  }
}
