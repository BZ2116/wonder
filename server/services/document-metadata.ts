export type MetadataSource = 'analysis' | 'history' | 'reading_card' | 'file_name' | 'manual' | 'none'
export type MetadataStatus = 'complete' | 'partial' | 'missing'

export interface ExtractedDocumentMetadata {
  title: string | null
  authors: string[]
  year: number | null
  venue: string | null
  doi: string | null
  url: string | null
  abstract: string | null
  keywords: string[]
  source: MetadataSource
}

function toStringArray(value: unknown): string[] {
  if (Array.isArray(value)) return value.map(String).map(s => s.trim()).filter(Boolean)
  if (typeof value === 'string') {
    return value.split(/[;,，、]/).map(s => s.trim()).filter(Boolean)
  }
  return []
}

function firstString(...values: unknown[]): string | null {
  for (const value of values) {
    if (typeof value === 'string' && value.trim()) return value.trim()
  }
  return null
}

function parseHistory(historyResult?: string | null): Record<string, unknown> {
  if (!historyResult) return {}
  try {
    const parsed = JSON.parse(historyResult)
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {}
  } catch {
    return {}
  }
}

function section(readingCard: string, names: string[]): string | null {
  for (const name of names) {
    const pattern = new RegExp(`##\\s*(?:\\d+[.)、]?\\s*)?${name}\\s*\\n([\\s\\S]*?)(?=\\n##\\s|$)`, 'i')
    const match = readingCard.match(pattern)
    if (match?.[1]?.trim()) return match[1].trim().split('\n')[0].replace(/^[-*]\s*/, '').trim()
  }
  return null
}

function cleanFileName(fileName?: string | null): string | null {
  if (!fileName) return null
  const base = fileName.replace(/\.[a-z0-9]+$/i, '')
  const cleaned = base.replace(/[_-]+/g, ' ').replace(/\s+/g, ' ').trim()
  return cleaned || null
}

export function metadataStatus(meta: ExtractedDocumentMetadata): MetadataStatus {
  if (!meta.title) return 'missing'
  if (meta.title && meta.authors.length > 0 && meta.year) return 'complete'
  return 'partial'
}

export function extractDocumentMetadata(input: {
  fileName?: string | null
  readingCard?: string | null
  summary?: string | null
  historyResult?: string | null
  analysisResult?: Record<string, unknown> | null
}): ExtractedDocumentMetadata {
  const history = parseHistory(input.historyResult)
  const analysis = input.analysisResult || {}
  const lit = (history.literature && typeof history.literature === 'object') ? history.literature as Record<string, unknown> : {}
  const readingCard = input.readingCard || ''

  const explicitTitle = firstString(
    analysis.paper_title, analysis.paperTitle, analysis.pdf_title, analysis.pdfTitle,
    history.paperTitle, history.paper_title, history.pdfTitle, history.pdf_title,
    lit.paperTitle, lit.paper_title,
  )
  const readingCardTitle = section(readingCard, ['Paper Title', '论文标题', '标题'])
  const fallbackTitle = cleanFileName(input.fileName)

  const title = explicitTitle || readingCardTitle || fallbackTitle
  const source: MetadataSource = explicitTitle ? (Object.keys(analysis).length ? 'analysis' : 'history')
    : readingCardTitle ? 'reading_card'
    : fallbackTitle ? 'file_name'
    : 'none'

  const authors = toStringArray(
    analysis.authors ?? history.authors ?? lit.authors ?? section(readingCard, ['Authors', '作者'])
  )

  const rawYear = analysis.year ?? history.year ?? lit.year ?? section(readingCard, ['Year', '年份'])
  const year = rawYear == null ? null : Number(String(rawYear).match(/\d{4}/)?.[0] || NaN)

  return {
    title,
    authors,
    year: Number.isFinite(year) ? year : null,
    venue: firstString(analysis.venue, history.venue, lit.venue, section(readingCard, ['Venue', '期刊', '会议'])),
    doi: firstString(analysis.doi, history.doi, lit.doi),
    url: firstString(analysis.url, history.url, lit.url),
    abstract: firstString(analysis.abstract, history.abstract, lit.abstract, input.summary),
    keywords: toStringArray(analysis.keywords ?? history.keywords ?? lit.keywords),
    source,
  }
}
