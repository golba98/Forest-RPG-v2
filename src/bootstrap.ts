// Keep startup errors visible even when a dependency cannot be loaded or evaluated.
void import('./main').catch((error: unknown) => {
  const loading = document.querySelector<HTMLElement>('#loading-screen');
  if (loading) {
    loading.classList.remove('hidden');
    loading.setAttribute('role', 'alert');
    const message = error instanceof Error ? error.message : String(error);
    loading.textContent = `Unable to start: ${message}. Reload the page and check the browser console for details.`;
  }
  console.error('Game startup failed', error);
});
