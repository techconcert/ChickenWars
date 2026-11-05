// Service worker registration (production builds only). The worker caches the app shell for offline play.
export function registerServiceWorker(): void {
  if (!import.meta.env.PROD || !('serviceWorker' in navigator)) return;
  const url = `${import.meta.env.BASE_URL}sw.js`;
  const reg = (): void => { navigator.serviceWorker.register(url, { scope: import.meta.env.BASE_URL }).catch((e) => console.warn('service worker not registered', e)); };
  if (document.readyState === 'complete') reg(); else window.addEventListener('load', reg, { once: true });
}
