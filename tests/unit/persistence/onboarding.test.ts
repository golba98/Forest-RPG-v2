// @vitest-environment happy-dom
import { beforeEach, it, expect } from 'vitest';
import { OnboardingStore } from '../../../src/persistence/OnboardingStore';
beforeEach(() => localStorage.clear());
it('detects first visit and remembers a dismissed welcome', () => {
  const first = new OnboardingStore(localStorage); expect(first.value.seen).toBe(false);
  first.value.seen = true; first.save(); expect(new OnboardingStore(localStorage).value.seen).toBe(true);
});
it('migrates completed legacy training', () => {
  localStorage.setItem('tutorialComplete', 'true'); expect(new OnboardingStore(localStorage).value.complete).toBe(true);
});
