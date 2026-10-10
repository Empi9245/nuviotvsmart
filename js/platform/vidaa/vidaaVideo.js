// Disable all outputs before enabling a different VIDAA text track. Retry only
// pending modes: restarting an already-enabled target also restarts its renderer.
let vidaaTextTrackAttempt = 0;
export function selectVidaaTextTrack(
  tracks,
  index,
  { isCurrent = () => true, getTracks = () => tracks } = {}
) {
  const targetIndex = Number(index);
  if (!Number.isInteger(targetIndex) || targetIndex < -1 || targetIndex >= tracks.length)
    return false;

  const attempt = ++vidaaTextTrackAttempt;
  const target = targetIndex >= 0 ? tracks[targetIndex] : null;
  const current = () => attempt === vidaaTextTrackAttempt && isCurrent();
  const readTracks = () => {
    if (!current()) return null;
    try {
      const liveTracks = getTracks();
      if (!Array.isArray(liveTracks) || (target && !liveTracks.includes(target))) return null;
      return liveTracks;
    } catch (_) {
      return null;
    }
  };
  const modesMatch = (liveTracks) => {
    try {
      return liveTracks.every(
        (track) => track.mode === (track === target ? "showing" : "disabled")
      );
    } catch (_) {
      return false;
    }
  };
  const allDisabled = (liveTracks) => {
    try {
      return liveTracks.every((track) => track.mode === "disabled");
    } catch (_) {
      return false;
    }
  };
  let enableRequested = false;
  const applyPendingModes = (liveTracks, initial = false) => {
    for (const track of liveTracks) {
      if (!current()) return;
      // After requesting enable, keep that target intact while waiting for its
      // mode to arrive. Disable only competing outputs in subsequent attempts.
      if (!initial && enableRequested && track === target) continue;
      try {
        if (initial || track.mode !== "disabled") track.mode = "disabled";
      } catch (_) {
        // Still disable the remaining outputs when one mode is readonly.
      }
    }
    if (!target || !current()) return;
    try {
      const competitorsDisabled = liveTracks.every(
        (track) => track === target || track.mode === "disabled"
      );
      if (!competitorsDisabled || (!enableRequested && !allDisabled(liveTracks))) return;
      if (target.mode !== "showing") {
        enableRequested = true;
        target.mode = "showing";
      }
    } catch (_) {
      // Confirmation below determines whether a readonly setter actually worked.
    }
  };

  const initialTracks = readTracks();
  if (!initialTracks) return false;
  if (modesMatch(initialTracks)) return true;
  applyPendingModes(initialTracks, true);
  if (!current()) return false;
  const appliedTracks = readTracks();
  if (!appliedTracks) return false;
  if (modesMatch(appliedTracks)) return true;

  // Two correction attempts, then one final readback. A fulfilled true means
  // the selected object is showing and every competing output is disabled.
  return new Promise((resolve) => {
    let retries = 0;
    const check = () => {
      const liveTracks = readTracks();
      if (!liveTracks) return resolve(false);
      if (modesMatch(liveTracks)) return resolve(true);
      if (retries >= 2) return resolve(false);
      retries++;
      applyPendingModes(liveTracks);
      if (!current()) return resolve(false);
      const updatedTracks = readTracks();
      if (!updatedTracks) return resolve(false);
      if (modesMatch(updatedTracks)) return resolve(true);
      setTimeout(check, 250);
    };
    setTimeout(check, 120);
  });
}
