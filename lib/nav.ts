/**
 * Tell the global RouteProgress bar to start animating.
 * Call before a programmatic navigation (e.g. router.push after a form
 * submit) so the user sees feedback in the same frame as the click —
 * Next.js' built-in pathname change won't fire until navigation completes,
 * which can be visibly slow.
 */
export function startRouteProgress(): void {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent('kairesume:nav-start'));
}
