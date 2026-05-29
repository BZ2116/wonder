import MarkdownIt from 'markdown-it'

const renderer = new MarkdownIt({
  html: false,
  linkify: true,
  breaks: true,
})

export function renderMarkdown(markdown: string): string {
  return renderer.render(markdown)
}
