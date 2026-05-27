import { readFile } from '@tauri-apps/plugin-fs'
import * as pdfjsLib from 'pdfjs-dist'
import mammoth from 'mammoth'

export interface ReadFileResult {
  content: string
  fileName: string
  filePath: string
}

export async function readDocumentFile(filePath: string): Promise<ReadFileResult> {
  const bytes = await readFile(filePath)
  const fileName = filePath.split(/[\\/]/).pop() ?? filePath
  const lower = fileName.toLowerCase()

  let content: string
  if (lower.endsWith('.pdf')) {
    content = await readPdfBytes(bytes)
  } else if (lower.endsWith('.docx')) {
    content = await readDocxBytes(bytes)
  } else {
    content = await readTextBytes(bytes)
  }

  return { content: cleanText(content), fileName, filePath }
}

export async function readPdfBytes(bytes: Uint8Array): Promise<string> {
  const pdf = await pdfjsLib.getDocument({ data: bytes }).promise
  const pages: string[] = []

  for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
    const page = await pdf.getPage(pageNumber)
    const textContent = await page.getTextContent()
    const text = textContent.items
      .map(item => ('str' in item ? item.str : ''))
      .join(' ')
      .trim()
    if (text) pages.push(`--- Page ${pageNumber} ---\n${text}`)
  }

  return pages.join('\n\n')
}

export async function readDocxBytes(bytes: Uint8Array): Promise<string> {
  const result = await mammoth.extractRawText({ arrayBuffer: bytes.buffer.slice(0) as ArrayBuffer })
  return result.value
}

export async function readTextBytes(bytes: Uint8Array): Promise<string> {
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(bytes)
  } catch {
    return new TextDecoder('gbk').decode(bytes)
  }
}

export function cleanText(text: string): string {
  return text
    .replace(/　/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .replace(/[ \t]{2,}/g, ' ')
    .trim()
}
