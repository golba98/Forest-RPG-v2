interface Progress { version: 1; seen: boolean; complete: boolean }
export class OnboardingStore {
  value: Progress = { version: 1, seen: false, complete: false };
  constructor(private storage: Storage) {
    try {
      const raw: unknown = JSON.parse(storage.getItem('forestrpg.v2.onboarding') ?? 'null');
      if (raw && typeof raw === 'object' && Reflect.get(raw, 'version') === 1) {
        this.value.seen = Reflect.get(raw, 'seen') === true;
        this.value.complete = Reflect.get(raw, 'complete') === true;
      } else {
        this.value.seen = storage.getItem('hasShownWelcomeTutorial') === 'true';
        this.value.complete = storage.getItem('tutorialComplete') === 'true';
      }
    } catch { /* Session state still works without storage. */ }
  }
  save(): boolean { try { this.storage.setItem('forestrpg.v2.onboarding', JSON.stringify(this.value)); return true; } catch { return false; } }
}
