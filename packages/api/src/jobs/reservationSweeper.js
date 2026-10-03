/**
 * Releases expired stock reservations on a timer. The expiry logic arrives in MT-16;
 * until then this only provides the start/stop lifecycle used by server.js.
 * @returns {() => void} stop function
 */
export function startSweeper() {
  return () => {};
}
