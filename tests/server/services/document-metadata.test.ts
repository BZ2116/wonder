import { describe, expect, it } from 'vitest'
import { extractDocumentMetadata, metadataStatus } from '../../../server/services/document-metadata'

describe('document metadata extraction', () => {
  it('extracts title from explicit result fields before reading card', () => {
    const meta = extractDocumentMetadata({
      fileName: 'paper.pdf',
      historyResult: JSON.stringify({
        paperTitle: 'Attention Is All You Need',
        authors: ['Vaswani', 'Shazeer'],
        year: 2017,
      }),
      readingCard: '# Reading Card\n## Topic Summary\nSummary text',
      summary: 'summary',
    })

    expect(meta.title).toBe('Attention Is All You Need')
    expect(meta.authors).toEqual(['Vaswani', 'Shazeer'])
    expect(meta.year).toBe(2017)
    expect(meta.source).toBe('history')
  })

  it('extracts title from reading card headings', () => {
    const meta = extractDocumentMetadata({
      fileName: 'upload.pdf',
      readingCard: '## Paper Title\nRetrieval-Augmented Generation for Knowledge-Intensive NLP\n\n## Authors\nLewis et al.',
      summary: '',
    })

    expect(meta.title).toBe('Retrieval-Augmented Generation for Knowledge-Intensive NLP')
    expect(meta.authors).toEqual(['Lewis et al.'])
    expect(meta.source).toBe('reading_card')
  })

  it('falls back to cleaned file name when no paper title exists', () => {
    const meta = extractDocumentMetadata({
      fileName: '2024-awesome-paper_v2.pdf',
      readingCard: '',
      summary: '',
    })

    expect(meta.title).toBe('2024 awesome paper v2')
    expect(meta.source).toBe('file_name')
    expect(metadataStatus(meta)).toBe('partial')
  })

  it('marks metadata missing when only an empty file name is available', () => {
    const meta = extractDocumentMetadata({
      fileName: '',
      readingCard: '',
      summary: '',
    })

    expect(meta.title).toBeNull()
    expect(metadataStatus(meta)).toBe('missing')
  })
})
