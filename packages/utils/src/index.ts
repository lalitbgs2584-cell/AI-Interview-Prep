export function formatScore(value: number | null | undefined) {
  if (value === null || typeof value === "undefined") return "-"
  return `${Math.round(value)}%`
}

export function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value))
}
