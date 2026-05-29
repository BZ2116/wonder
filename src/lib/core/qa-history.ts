import type { StorageAdapter } from './storage'

export interface QAMessage {
  role: 'user' | 'assistant'
  content: string
  timestamp: string
}

export interface QASession {
  id: string
  recordId: string | null
  documentName: string
  messages: QAMessage[]
  createdAt: string
}

export type NewQASession = Omit<QASession, 'id' | 'createdAt'>

export class QAHistoryManager {
  constructor(
    private readonly storage: StorageAdapter,
    private readonly dir = 'qa-sessions',
  ) {}

  async createSession(recordId: string | null, documentName: string): Promise<string> {
    await this.storage.ensureDir(this.dir)
    const id = crypto.randomUUID().slice(0, 8)
    const session: QASession = {
      id,
      recordId,
      documentName,
      messages: [],
      createdAt: new Date().toISOString(),
    }
    await this.storage.writeText(this.sessionPath(id), JSON.stringify(session, null, 2))
    return id
  }

  async addMessage(sessionId: string, message: QAMessage): Promise<void> {
    const session = await this.getSession(sessionId)
    if (!session) return
    session.messages.push(message)
    await this.storage.writeText(this.sessionPath(sessionId), JSON.stringify(session, null, 2))
  }

  async updateLastMessage(sessionId: string, content: string): Promise<void> {
    const session = await this.getSession(sessionId)
    if (!session || session.messages.length === 0) return
    session.messages[session.messages.length - 1].content = content
    await this.storage.writeText(this.sessionPath(sessionId), JSON.stringify(session, null, 2))
  }

  async getSession(id: string): Promise<QASession | null> {
    const raw = await this.storage.readText(this.sessionPath(id))
    return raw ? (JSON.parse(raw) as QASession) : null
  }

  async listSessions(): Promise<QASession[]> {
    const files = await this.storage.listFiles(this.dir)
    const sessions = await Promise.all(
      files
        .filter(file => file.endsWith('.json'))
        .map(async file => JSON.parse((await this.storage.readText(file)) ?? 'null') as QASession),
    )
    return sessions.filter(Boolean).sort((a, b) => b.createdAt.localeCompare(a.createdAt))
  }

  async deleteSession(id: string): Promise<void> {
    await this.storage.remove(this.sessionPath(id))
  }

  private sessionPath(id: string): string {
    return `${this.dir}/${id}.json`
  }
}
