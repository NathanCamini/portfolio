/**
 * Tiny event bus so any button on the page (hero CTA, floating button, nav)
 * can open the volleyball panel owned by VolleyballSection.
 */
export const OPEN_VOLLEYBALL = 'portfolio:open-volleyball';

export function openVolleyball() {
  window.dispatchEvent(new Event(OPEN_VOLLEYBALL));
}
