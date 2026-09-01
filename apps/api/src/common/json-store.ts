import { mkdir, readFile, writeFile } from 'fs/promises';
import { dirname } from 'path';

export class JsonStore<T> {
  constructor(private readonly filePath: string) {}

  async read(): Promise<T | null> {
    try {
      const raw = await readFile(this.filePath, 'utf8');
      return JSON.parse(raw) as T;
    } catch {
      return null;
    }
  }

  async write(data: T): Promise<void> {
    await mkdir(dirname(this.filePath), { recursive: true });
    await writeFile(this.filePath, JSON.stringify(data, null, 2), 'utf8');
  }
}
