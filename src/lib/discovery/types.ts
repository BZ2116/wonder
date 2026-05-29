export interface S2Paper {
  paperId: string
  title: string
  abstract: string | null
  year: number | null
  citationCount: number
  venue: string
  authors: Array<{ authorId: string; name: string }>
  url: string
}

export interface S2SearchResult {
  total: number
  papers: S2Paper[]
}
