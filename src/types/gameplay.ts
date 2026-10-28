import type { TileId } from './tiles';
import type { TilePoint } from './world';

export type PortalState = 'locked' | 'reacting' | 'open' | 'transitioning';
export type TraversalProfile = 'player' | 'groundEnemy' | 'ghost' | 'jumping';
export interface Bounds {
  readonly minX: number;
  readonly minY: number;
  readonly maxX: number;
  readonly maxY: number;
}
export interface Collider extends Bounds {
  readonly ownerId: string;
  readonly shape: 'aabb';
  readonly classification: 'solid' | 'trigger';
  readonly source: 'terrain' | 'object' | 'boundary' | 'portal';
}
export interface RoundStatus {
  readonly complete: boolean;
  readonly enemiesRemaining: number;
  readonly coinsRemaining: number;
}
export interface PortalChange {
  readonly portalId: string;
  readonly previous: PortalState;
  readonly state: PortalState;
  readonly round: RoundStatus;
}
export interface TerrainInfo {
  readonly tileId: TileId;
  readonly category: 'ground' | 'hill' | 'water' | 'solid' | 'crossing';
  readonly elevation: number;
  readonly walkable: boolean;
  /** N,NE,E,SE,S,SW,W,NW bit order. */
  readonly hillNeighbors: number;
  /** N,E,S,W bit order. */
  readonly exposedEdges: number;
  /** NE,SE,SW,NW bit order. */
  readonly convexCorners: number;
  readonly concaveCorners: number;
  readonly crossing: boolean;
}
export interface NavigationDebug {
  readonly id: string;
  readonly target: TilePoint | null;
  readonly path: readonly TilePoint[];
  readonly unreachable: boolean;
}
export interface GameplayDebug {
  readonly seed: number;
  readonly tile: TilePoint;
  readonly terrain: TerrainInfo;
  readonly colliders: readonly Collider[];
  readonly round: RoundStatus;
  readonly portalState: PortalState;
  readonly regionId: number;
  readonly navigation: readonly NavigationDebug[];
}
