import type { S2Paper, S2SearchResult } from './types'

const BASE = 'https://api.semanticscholar.org/graph/v1'
const FIELDS = 'paperId,title,abstract,year,citationCount,venue,authors,url'

export async function searchPapers(query: string, limit = 20): Promise<S2SearchResult> {
  const url = `${BASE}/paper/search?query=${encodeURIComponent(query)}&limit=${limit}&fields=${FIELDS}`
  const res = await fetch(url)
  if (!res.ok) throw new Error(`Semantic Scholar API error: ${res.status}`)
  const data = await res.json()
  return {
    total: data.total ?? 0,
    papers: data.data ?? [],
  }
}

export async function getPaper(paperId: string): Promise<S2Paper> {
  const url = `${BASE}/paper/${encodeURIComponent(paperId)}?fields=${FIELDS}`
  const res = await fetch(url)
  if (!res.ok) throw new Error(`Semantic Scholar API error: ${res.status}`)
  return res.json()
}

export async function getReferences(paperId: string, limit = 50): Promise<S2Paper[]> {
  const url = `${BASE}/paper/${encodeURIComponent(paperId)}/references?fields=${FIELDS}&limit=${limit}`
  const res = await fetch(url)
  if (!res.ok) throw new Error(`Semantic Scholar API error: ${res.status}`)
  const data = await res.json()
  return (data.data ?? []).map((item: { citedPaper: S2Paper }) => item.citedPaper)
}

export async function getCitations(paperId: string, limit = 50): Promise<S2Paper[]> {
  const url = `${BASE}/paper/${encodeURIComponent(paperId)}/citations?fields=${FIELDS}&limit=${limit}`
  const res = await fetch(url)
  if (!res.ok) throw new Error(`Semantic Scholar API error: ${res.status}`)
  const data = await res.json()
  return (data.data ?? []).map((item: { citingPaper: S2Paper }) => item.citingPaper)
}
