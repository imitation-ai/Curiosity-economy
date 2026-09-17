export function initAnalytics() {
  const token = import.meta.env.VITE_BETTERSTACK_APPLICATION_TOKEN;
  if (!token || !import.meta.env.PROD || navigator.globalPrivacyControl || navigator.doNotTrack === '1') return;
  window.betterstack = window.betterstack || function (...args) {
    (window.betterstack.q = window.betterstack.q || []).push(args);
  };
  window.betterstack.l = Date.now();
  const script = document.createElement('script');
  script.async = true;
  script.crossOrigin = 'anonymous';
  script.src = `https://betterstack.net/b.js?t=${encodeURIComponent(token)}`;
  document.head.append(script);
  window.betterstack('init', { environment: 'production' });
}
export function track(name, data = {}) {
  window.betterstack?.('track', name, data);
}
