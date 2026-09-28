/** Event bus so the hero button (or anything else) can open the terminal owned by <Terminal />. */
export const OPEN_TERMINAL = 'portfolio:open-terminal';

export function openTerminal() {
  window.dispatchEvent(new Event(OPEN_TERMINAL));
}
