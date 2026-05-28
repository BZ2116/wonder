import type { StorageAdapter } from './storage'

export interface HistoryRecord {
  id: string
  fileName: string
  model: string
  summary: string
  createdAt: string
  readingCard: string
  relationAnalysis: string
  writingMaterials: string
  todoList: string
  matching?: string
  fullReport: string
}

export type NewHistoryRecord = Omit<HistoryRecord, 'id' | 'createdAt'>

export class HistoryManager {
  constructor(
    private readonly storage: StorageAdapter,
    private readonly outputsDir = 'outputs',
  ) {}

  async saveRecord(input: NewHistoryRecord): Promise<string> {
    await this.storage.ensureDir(this.outputsDir)
    const id = crypto.randomUUID().slice(0, 8)
    const record: HistoryRecord = {
      id,
      createdAt: new Date().toISOString(),
      ...input,
    }
    await this.storage.writeText(this.recordPath(id), JSON.stringify(record, null, 2))
    return id
  }

  async listRecords(): Promise<HistoryRecord[]> {
    const files = await this.storage.listFiles(this.outputsDir)
    const records = await Promise.all(
      files
        .filter(file => file.endsWith('_record.json'))
        .map(async file => JSON.parse((await this.storage.readText(file)) ?? 'null') as HistoryRecord),
    )
    return records.filter(Boolean).sort((a, b) => b.createdAt.localeCompare(a.createdAt))
  }

  async getRecord(id: string): Promise<HistoryRecord | null> {
    const raw = await this.storage.readText(this.recordPath(id))
    return raw ? (JSON.parse(raw) as HistoryRecord) : null
  }

  async deleteRecord(id: string): Promise<void> {
    await this.storage.remove(this.recordPath(id))
  }

  private recordPath(id: string): string {
    return `${this.outputsDir}/${id}_record.json`
  }
}
