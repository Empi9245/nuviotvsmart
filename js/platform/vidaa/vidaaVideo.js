// VIDAA requires disabling all text tracks before enabling the selected one.
// This keeps selection inside Nuvio's player and uses the TV's HTML media API.
export function selectVidaaTextTrack(tracks, index) {
  const targetIndex = Number(index);
  if (!Number.isInteger(targetIndex) || targetIndex < -1 || targetIndex >= tracks.length) {
    return false;
  }
  tracks.forEach((track) => {
    try {
      track.mode = "disabled";
    } catch (_) {
      // Keep disabling the remaining outputs if one track is readonly.
    }
  });
  try {
    if (targetIndex >= 0) tracks[targetIndex].mode = "showing";
    return tracks.every(
      (track, trackIndex) => track.mode === (trackIndex === targetIndex ? "showing" : "disabled")
    );
  } catch (_) {
    return false;
  }
}
