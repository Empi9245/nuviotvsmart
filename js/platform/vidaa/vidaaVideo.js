// VIDAA requires disabling all text tracks before enabling the selected one.
// This keeps selection inside Nuvio's player and uses the TV's HTML media API.
// VIDAA firmware frequently ignores an immediate re-enable or misreports the
// modes on readback, so the switch is verified and retried once after a beat;
// stale retries from a newer selection are dropped via the attempt token.
let vidaaTextTrackAttempt = 0;
export function selectVidaaTextTrack(tracks, index) {
  const targetIndex = Number(index);
  if (!Number.isInteger(targetIndex) || targetIndex < -1 || targetIndex >= tracks.length) {
    return false;
  }
  const attempt = ++vidaaTextTrackAttempt;
  const applyModes = () => {
    try {
      tracks.forEach((track) => {
        try {
          track.mode = "disabled";
        } catch (_) {
          // Keep disabling the remaining outputs if one track is readonly.
        }
      });
      if (targetIndex >= 0) tracks[targetIndex].mode = "showing";
      return true;
    } catch (_) {
      return false;
    }
  };
  const modesMatchSelection = () => {
    try {
      return tracks.every(
        (track, trackIndex) => track.mode === (trackIndex === targetIndex ? "showing" : "disabled")
      );
    } catch (_) {
      return false;
    }
  };
  if (!applyModes()) {
    return false;
  }
  if (modesMatchSelection()) {
    return true;
  }
  setTimeout(() => {
    if (attempt !== vidaaTextTrackAttempt) {
      return;
    }
    applyModes();
    if (attempt !== vidaaTextTrackAttempt || modesMatchSelection()) {
      return;
    }
    // Some firmwares only pick up the enable when it lands a frame later than
    // the disable; give it one more beat before giving up.
    setTimeout(() => {
      if (attempt === vidaaTextTrackAttempt) {
        applyModes();
      }
    }, 250);
  }, 120);
  // Report the switch as accepted: the firmware may also misreport modes even
  // when the rendered track did change, so callers must not treat this as a
  // failure and re-run the whole selection.
  return true;
}
