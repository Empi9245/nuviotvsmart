/**
 * Preserve the expiry reported by Trakt. Extending a one-day token to seven
 * days leaves it expired on the server while the client still considers it
 * valid. Invalid lifetimes remain immediately eligible for refresh.
 */

export function normalizeTraktTokenLifetimeSeconds(expiresIn) {
  const seconds = Math.trunc(Number(expiresIn));
  if (!Number.isFinite(seconds)) {
    return 0;
  }
  return seconds;
}
