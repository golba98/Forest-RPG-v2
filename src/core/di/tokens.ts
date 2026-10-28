import { createServiceToken } from './types';
import type { IEventBus } from '../events/types';

// Core Subsystem Tokens
export const EVENT_BUS_TOKEN = createServiceToken<IEventBus>('IEventBus');
export const INPUT_MANAGER_TOKEN = createServiceToken<unknown>('IInputManager');
export const GAME_LOOP_TOKEN = createServiceToken<unknown>('IGameLoop');
export const SPATIAL_GRID_TOKEN = createServiceToken<unknown>('ISpatialHashGrid');

// Audio Subsystem Tokens
export const SOUND_SYNTH_TOKEN = createServiceToken<unknown>('ISoundSynthesizer');
export const MUSIC_PLAYER_TOKEN = createServiceToken<unknown>('IMusicPlayer');

// World & Gameplay Tokens
export const WORLD_SYSTEM_TOKEN = createServiceToken<unknown>('IWorldSystem');
export const COLLISION_SYSTEM_TOKEN = createServiceToken<unknown>('ICollisionSystem');
export const COMBAT_SYSTEM_TOKEN = createServiceToken<unknown>('ICombatSystem');
export const SAVE_MANAGER_TOKEN = createServiceToken<unknown>('ISaveManager');

// Rendering & UI Tokens
export const RENDER_ENGINE_TOKEN = createServiceToken<unknown>('IRenderEngine');
export const CAMERA_TOKEN = createServiceToken<unknown>('ICamera');
export const UI_MANAGER_TOKEN = createServiceToken<unknown>('IUIManager');
