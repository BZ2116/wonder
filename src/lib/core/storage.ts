import { BaseDirectory, exists, mkdir, readTextFile, writeTextFile, remove } from '@tauri-apps/plugin-fs'

export interface StorageAdapter {
  readText(path: string): Promise<string | null>
  writeText(path: string, content: string): Promise<void>
  remove(path: string): Promise<void>
  ensureDir(path: string): Promise<void>
  listFiles(path: string): Promise<string[]>
}

export class TauriStorageAdapter implements StorageAdapter {
  async readText(path: string): Promise<string | null> {
    if (!(await exists(path, { baseDir: BaseDirectory.AppData }))) return null
    return readTextFile(path, { baseDir: BaseDirectory.AppData })
  }

  async writeText(path: string, content: string): Promise<void> {
    const slash = path.lastIndexOf('/')
    if (slash > -1) await this.ensureDir(path.slice(0, slash))
    await writeTextFile(path, content, { baseDir: BaseDirectory.AppData })
  }

  async remove(path: string): Promise<void> {
    if (await exists(path, { baseDir: BaseDirectory.AppData })) {
      await remove(path, { baseDir: BaseDirectory.AppData })
    }
  }

  async ensureDir(path: string): Promise<void> {
    if (!path) return
    if (!(await exists(path, { baseDir: BaseDirectory.AppData }))) {
      await mkdir(path, { baseDir: BaseDirectory.AppData, recursive: true })
    }
  }

  async listFiles(path: string): Promise<string[]> {
    const { readDir } = await import('@tauri-apps/plugin-fs')
    if (!(await exists(path, { baseDir: BaseDirectory.AppData }))) return []
    const entries = await readDir(path, { baseDir: BaseDirectory.AppData })
    return entries.filter(entry => entry.isFile).map(entry => `${path}/${entry.name}`)
  }
}

export class MemoryStorageAdapter implements StorageAdapter {
  private files = new Map<string, string>()

  async readText(path: string): Promise<string | null> {
    return this.files.get(path) ?? null
  }

  async writeText(path: string, content: string): Promise<void> {
    this.files.set(path, content)
  }

  async remove(path: string): Promise<void> {
    this.files.delete(path)
  }

  async ensureDir(_path: string): Promise<void> {}

  async listFiles(path: string): Promise<string[]> {
    return [...this.files.keys()].filter(key => key.startsWith(`${path}/`))
  }
}
