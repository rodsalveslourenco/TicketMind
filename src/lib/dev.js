export function setupHotReloadIndicator() {
  if (!import.meta.env.DEV || typeof window === "undefined" || !import.meta.hot) return;

  import.meta.hot.on("vite:afterUpdate", () => {
    window.dispatchEvent(new CustomEvent("ticketmind:hot-reload", { detail: { at: new Date().toISOString() } }));
  });
}
