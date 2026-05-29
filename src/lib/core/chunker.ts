export function chunkText(text: string, maxChars = 7000, overlap = 500): string[] {
  if (maxChars <= 0) throw new Error('maxChars must be positive')
  if (overlap < 0) throw new Error('overlap must be non-negative')
  if (overlap >= maxChars) throw new Error('overlap must be smaller than maxChars')

  const normalized = text.trim()
  if (!normalized) return []
  if (normalized.length <= maxChars) return [normalized]

  const chunks: string[] = []
  let start = 0

  while (start < normalized.length) {
    const end = Math.min(start + maxChars, normalized.length)
    chunks.push(normalized.slice(start, end))
    if (end >= normalized.length) break
    start = end - overlap
  }

  return chunks
}

export function estimateTokens(text: string): number {
  return Math.floor(text.length / 1.5)
}
