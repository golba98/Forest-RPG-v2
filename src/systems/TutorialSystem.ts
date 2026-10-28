import type { Entity, PlayerEntity, PlayerIntent } from '../types/entities';
export class TutorialSystem {
  stage = 0;
  update(p: PlayerEntity, entities: readonly Entity[], intent: PlayerIntent): void {
    if (this.stage === 0 && Math.hypot(p.x - p.prevX, p.y - p.prevY) > 0) this.stage = 1;
    else if (this.stage === 1 && intent.sprint && p.isSprinting) this.stage = 2;
    else if (this.stage === 2 && !entities.some(e => e.kind === 'enemy' && e.alive)) this.stage = 3;
    else if (this.stage === 3 && !entities.some(e => e.kind === 'pickup' && e.pickupType === 'coin' && e.alive)) this.stage = 4;
  }
}
