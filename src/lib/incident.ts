/**
 * The hero's DELETE sticker and the incident it causes share this query.
 * It is wrong on purpose: `DELETE *` is not SQL, and the `;` before WHERE ends
 * the statement early — so the DELETE runs with no WHERE at all.
 */
export const DELETE_QUERY = 'DELETE * from USERS; WHERE name = "NATHAN CAMINI"';

/**
 * Tiny event bus (like `openVolleyball`): the sticker "executes" its query and
 * QueryIncident, mounted once per page, plays the crash + ROLLBACK.
 */
export const EXECUTE_QUERY = 'portfolio:execute-query';

export function executeQuery() {
  window.dispatchEvent(new Event(EXECUTE_QUERY));
}
