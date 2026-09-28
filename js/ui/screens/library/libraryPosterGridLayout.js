export function calculateAdaptivePosterGridMetrics(containerWidth, minCardWidth, columnGap) {
  const width = Number(containerWidth);
  const minimum = Number(minCardWidth);
  const gap = Number(columnGap);
  if (
    !Number.isFinite(width) ||
    width <= 0 ||
    !Number.isFinite(minimum) ||
    minimum <= 0 ||
    !Number.isFinite(gap) ||
    gap < 0
  ) {
    return null;
  }

  const columns = Math.max(1, Math.floor((width + gap) / (minimum + gap)));
  const cardWidth = (width - gap * (columns - 1)) / columns;
  return { columns, cardWidth };
}
