import { getReferences, getCitations, getPaper } from './semantic-scholar'
import type { S2Paper } from './types'

export interface GraphNode {
  paperId: string
  title: string
  year: number | null
  citationCount: number
  x: number
  y: number
}

export interface GraphEdge {
  from: string
  to: string
  type: 'references' | 'citations'
}

export interface CitationGraph {
  nodes: GraphNode[]
  edges: GraphEdge[]
}

/**
 * Build a citation graph via BFS from a seed paper.
 * depth=1: seed + its references/citations
 * depth=2: also fetch references/citations of first-level nodes
 */
export async function buildCitationGraph(
  seedPaperId: string,
  depth: number = 1,
  limit: number = 10,
): Promise<CitationGraph> {
  const nodesMap = new Map<string, GraphNode>()
  const edges: GraphEdge[] = []
  const visited = new Set<string>()

  // Fetch seed paper
  const seed = await getPaper(seedPaperId)
  nodesMap.set(seed.paperId, makeNode(seed))
  visited.add(seed.paperId)

  // BFS queue: [paperId, currentDepth]
  const queue: Array<{ id: string; d: number }> = [{ id: seed.paperId, d: 0 }]

  while (queue.length > 0) {
    const { id, d } = queue.shift()!
    if (d >= depth) continue

    // Fetch references and citations in parallel
    const [refs, cits] = await Promise.all([
      getReferences(id, limit).catch(() => []),
      getCitations(id, limit).catch(() => []),
    ])

    for (const paper of refs) {
      if (!paper.paperId) continue
      if (!nodesMap.has(paper.paperId)) {
        nodesMap.set(paper.paperId, makeNode(paper))
      }
      edges.push({ from: id, to: paper.paperId, type: 'references' })
      if (!visited.has(paper.paperId)) {
        visited.add(paper.paperId)
        queue.push({ id: paper.paperId, d: d + 1 })
      }
    }

    for (const paper of cits) {
      if (!paper.paperId) continue
      if (!nodesMap.has(paper.paperId)) {
        nodesMap.set(paper.paperId, makeNode(paper))
      }
      edges.push({ from: paper.paperId, to: id, type: 'citations' })
      if (!visited.has(paper.paperId)) {
        visited.add(paper.paperId)
        queue.push({ id: paper.paperId, d: d + 1 })
      }
    }
  }

  // Deduplicate edges
  const edgeSet = new Set<string>()
  const uniqueEdges: GraphEdge[] = []
  for (const e of edges) {
    const key = `${e.from}->${e.to}:${e.type}`
    if (!edgeSet.has(key)) {
      edgeSet.add(key)
      uniqueEdges.push(e)
    }
  }

  // Assign positions: circular layout
  const nodes = Array.from(nodesMap.values())
  assignPositions(nodes, seedPaperId)

  return { nodes, edges: uniqueEdges }
}

function makeNode(paper: S2Paper): GraphNode {
  return {
    paperId: paper.paperId,
    title: paper.title,
    year: paper.year,
    citationCount: paper.citationCount,
    x: 0,
    y: 0,
  }
}

/**
 * Assign x/y positions using concentric circular layout.
 * Seed at center, depth-1 nodes on ring 1, depth-2 nodes on ring 2.
 */
function assignPositions(nodes: GraphNode[], seedId: string): void {
  const seedNode = nodes.find(n => n.paperId === seedId)
  if (!seedNode) return

  // We don't track depth in GraphNode, so use a simple heuristic:
  // seed at center, all others distributed evenly on a single ring.
  // For depth=2 this is still visually clear enough.
  const others = nodes.filter(n => n.paperId !== seedId)
  const cx = 400
  const cy = 300
  const radius = others.length <= 12 ? 200 : 260

  seedNode.x = cx
  seedNode.y = cy

  for (let i = 0; i < others.length; i++) {
    const angle = (2 * Math.PI * i) / others.length - Math.PI / 2
    others[i].x = cx + radius * Math.cos(angle)
    others[i].y = cy + radius * Math.sin(angle)
  }
}
