// VIDAA keeps one short animation per scroll axis. Holding a remote key
// retargets that animation with its current velocity, rather than restarting
// it or queuing movements. Geometry is read only when a new target arrives.
export const VIDAA_FOCUS_SCROLL_DURATION_MS = 140;

export function animateVidaaFocusScroll(
  owner,
  container,
  axis,
  targetValue,
  { duration = VIDAA_FOCUS_SCROLL_DURATION_MS } = {}
) {
  if (!container) return;

  const key = axis === "y" ? "y" : "x";
  const property = key === "y" ? "scrollTop" : "scrollLeft";
  const map = owner.scrollAnimations || (owner.scrollAnimations = new WeakMap());
  const frames = map.get(container) || {};
  map.set(container, frames);
  const motionMap =
    owner.vidaaFocusScrollAnimations || (owner.vidaaFocusScrollAnimations = new WeakMap());
  const motions = motionMap.get(container) || {};
  motionMap.set(container, motions);
  const previous = motions[key];
  const active = previous?.raf != null && frames[key] === previous.raf ? previous : null;
  const stop = () => {
    if (frames[key] != null) cancelAnimationFrame(frames[key]);
    frames[key] = null;
    if (previous) previous.raf = null;
    motions[key] = null;
  };

  const springState = owner.springScrollAnimations?.get(container);
  if (springState?.[key]) {
    if (springState[key].raf != null) cancelAnimationFrame(springState[key].raf);
    springState[key] = null;
  }
  if (container.isConnected === false) {
    stop();
    return;
  }

  const max =
    key === "y"
      ? Math.max(0, container.scrollHeight - container.clientHeight)
      : Math.max(0, container.scrollWidth - container.clientWidth);
  const nextValue = Math.max(0, Math.min(max, Math.round(Number(targetValue) || 0)));
  const startValue = Number(container[property] || 0);
  const durationMs = Math.max(0, Math.min(VIDAA_FOCUS_SCROLL_DURATION_MS, Number(duration) || 0));
  const reducedMotion = globalThis.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches;
  if (Math.abs(nextValue - startValue) <= 1 || reducedMotion || durationMs === 0) {
    stop();
    container[property] = nextValue;
    return;
  }

  if (active?.target === nextValue) return;
  const distance = nextValue - startValue;
  // A same-direction retarget keeps velocity. Bound the tangent to prevent
  // overshoot; reversing direction responds immediately from the shown frame.
  const velocity =
    active && active.velocity * distance > 0
      ? Math.sign(distance) *
        Math.min(Math.abs(active.velocity), (3 * Math.abs(distance)) / durationMs)
      : 0;
  const state = active || {};
  Object.assign(state, {
    start: startValue,
    target: nextValue,
    startTime: performance.now(),
    duration: durationMs,
    initialVelocity: velocity,
    velocity
  });
  if (active) return;
  stop();
  motions[key] = state;
  const tick = (now) => {
    if (frames[key] !== state.raf) return;
    if (container.isConnected === false) {
      frames[key] = null;
      state.raf = null;
      motions[key] = null;
      return;
    }
    const progress = Math.max(0, Math.min(1, (now - state.startTime) / state.duration));
    const squared = progress * progress;
    const cubed = squared * progress;
    const delta = state.target - state.start;
    const tangent = state.initialVelocity * state.duration;
    // Cubic Hermite interpolation ends at zero velocity and allows continuous
    // velocity when the next remote repeat changes the destination.
    container[property] =
      progress === 1
        ? state.target
        : state.start +
          delta * (3 * squared - 2 * cubed) +
          tangent * (cubed - 2 * squared + progress);
    state.velocity =
      (delta * (6 * progress - 6 * squared) + tangent * (3 * squared - 4 * progress + 1)) /
      state.duration;
    state.raf = frames[key] = progress < 1 ? requestAnimationFrame(tick) : null;
    if (progress === 1) motions[key] = null;
  };
  state.raf = frames[key] = requestAnimationFrame(tick);
}
