export interface EncounterSite {
  readonly id: string;
  readonly kind: 'nest' | 'grove';
  /** Continuous ground position, in tiles. */
  readonly x: number;
  readonly y: number;
  readonly legacy?: boolean;
}

export type BossPhase = 'dormant' | 'warning' | 'emerging' | 'fighting' | 'returning' | 'defeated';
export interface BossEncounter {
  siteId: string;
  phase: BossPhase;
  discovered: boolean;
  remainingMs: number;
  awayMs: number;
  unreachableMs: number;
  returnMs: number;
  health: number;
  maxHealth: number;
  rewardClaimed: boolean;
}
export interface GhostMember {
  id: string;
  x: number;
  y: number;
  status: 'pending' | 'forming' | 'active' | 'killed' | 'dismissed';
  remainingMs: number;
  placementWaitMs: number;
  health: number;
  maxHealth: number;
}
export interface GroveEncounter {
  siteId: string;
  phase: 'available' | 'active' | 'cooldown';
  discovered: boolean;
  cooldownMs: number;
  cycle: number;
  armed: boolean;
  wasInside: boolean;
  leftSinceClear: boolean;
  awayMs: number;
  introductory: boolean;
  manifested: boolean;
  members: GhostMember[];
}
export interface EncounterState {
  version: 1;
  bosses: BossEncounter[];
  groves: GroveEncounter[];
}
export interface SimulationRuntime {
  moisture?: import('../systems/SurfaceMoisture').SavedMoisture;
  rngState: number;
  /** Accepted only as migration evidence; never used for spawning. */
  ghostNightSpawned?: boolean;
  encounters?: EncounterState;
}
export interface EncounterSiteView extends EncounterSite {
  readonly phase: BossPhase | GroveEncounter['phase'];
  readonly discovered: boolean;
  readonly progress: number;
}
export interface EncounterPresentation {
  readonly sites: readonly EncounterSiteView[];
  readonly boss: {
    readonly name: string;
    readonly health: number;
    readonly maxHealth: number;
    readonly phase: BossPhase;
  } | null;
  readonly interaction: 'disturb' | 'stepBack' | null;
  readonly pendingBosses: number;
}
