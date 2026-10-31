import type { Entity, PlayerEntity, PortalEntity } from '../types/entities';
import type { PortalChange, PortalState, RoundStatus } from '../types/gameplay';

export const PORTAL_RULES = {
  approachRadius: 2.5,
  leaveRadius: 3,
  entryRadius: 0.8,
  reactionMs: 600,
} as const;
export function roundStatus(entities: readonly Entity[], complete = false, pendingBosses = 0): RoundStatus {
  let enemiesRemaining = pendingBosses,
    coinsRemaining = 0;
  for (const e of entities)
    if (e.alive) {
      if (e.kind === 'enemy' && e.enemyType !== 'ghost') enemiesRemaining++;
      else if (e.kind === 'pickup' && e.pickupType === 'coin' && e.requiredForCompletion !== false) coinsRemaining++;
    }
  return {
    complete: complete || (enemiesRemaining === 0 && coinsRemaining === 0),
    enemiesRemaining,
    coinsRemaining,
  };
}
/** Owns eligibility and latched completion. Animation never drives this controller. */
export class PortalSystem {
  private complete = false;
  private reaction = 0;
  private armed = true;
  private status: RoundStatus = { complete: false, enemiesRemaining: 0, coinsRemaining: 0 };
  constructor(
    private readonly changed?: (change: PortalChange) => void,
    private readonly completed?: (status: RoundStatus) => void,
  ) {}
  getStatus(): RoundStatus {
    return { ...this.status };
  }
  private set(portal: PortalEntity, state: PortalState): void {
    const previous = portal.portalState ?? 'locked';
    portal.portalState = state;
    portal.roundComplete = this.complete;
    portal.entryEligible = state === 'open';
    portal.active = state === 'open' || state === 'transitioning';
    if (previous !== state)
      this.changed?.({ portalId: portal.id, previous, state, round: this.getStatus() });
  }
  step(p: PlayerEntity, entities: readonly Entity[], dt: number, pendingBosses = 0): void {
    const portal = entities.find((e): e is PortalEntity => e.kind === 'portal');
    if (!portal) return;
    this.status = roundStatus(entities, this.complete, pendingBosses);
    if (!this.complete && this.status.complete) {
      this.complete = true;
      this.completed?.(this.getStatus());
    }
    if (portal.portalState === 'transitioning') return;
    if (this.complete) {
      this.set(portal, 'open');
      return;
    }
    const distance = Math.hypot(p.x - portal.x, p.y - portal.y);
    if (distance >= PORTAL_RULES.leaveRadius) this.armed = true;
    if (portal.portalState === 'reacting') {
      this.reaction = Math.max(0, this.reaction - dt * 1000);
      if (this.reaction === 0 || distance >= PORTAL_RULES.leaveRadius) this.set(portal, 'locked');
    } else if (this.armed && distance < PORTAL_RULES.approachRadius) {
      this.armed = false;
      this.reaction = PORTAL_RULES.reactionMs;
      this.set(portal, 'reacting');
    } else this.set(portal, 'locked');
  }
  claim(p: PlayerEntity, entities: readonly Entity[]): boolean {
    const portal = entities.find((e): e is PortalEntity => e.kind === 'portal');
    if (
      !portal ||
      !this.complete ||
      portal.portalState !== 'open' ||
      p.stats.health <= 0 ||
      Math.hypot(p.x - portal.x, p.y - portal.y) >= PORTAL_RULES.entryRadius - 1e-9
    )
      return false;
    this.set(portal, 'transitioning');
    return true;
  }
  restore(entities: readonly Entity[], pendingBosses = 0): void {
    const portal = entities.find((e): e is PortalEntity => e.kind === 'portal');
    if (!portal) return;
    this.status = roundStatus(entities, portal.roundComplete === true, pendingBosses);
    this.complete = this.status.complete;
    this.armed = true;
    this.reaction = 0;
    this.set(portal, this.complete ? 'open' : 'locked');
  }
}
