import { createWriteStream, WriteStream } from "node:fs"
import { mkdir } from "node:fs/promises"
import { dirname } from "node:path"
import { NormalizedIOC } from "../types/pipeline.js"

export interface StreamWriterOptions {
  filePath: string
  flushInterval: number
}

export class StreamWriter {
  private stream: WriteStream
  private filePath: string
  private count: number
  private first: boolean
  private flushTimer: ReturnType<typeof setInterval> | null

  constructor(options: StreamWriterOptions) {
    this.filePath = options.filePath
    this.count = 0
    this.first = true
    this.flushTimer = null

    this.stream = createWriteStream(options.filePath, {
      flags: "w",
      encoding: "utf-8",
      highWaterMark: 65536,
    })

    this.stream.write("[\n")
  }

  async write(ioc: NormalizedIOC): Promise<void> {
    const json = JSON.stringify({
      d: ioc.normalized,
      c: ioc.category,
      t: ioc.iocType,
    })

    if (this.first) {
      this.first = false
      this.stream.write(json)
    } else {
      this.stream.write(",\n" + json)
    }

    this.count++
  }

  getCount(): number {
    return this.count
  }

  async close(): Promise<void> {
    if (this.flushTimer) {
      clearInterval(this.flushTimer)
      this.flushTimer = null
    }

    return new Promise((resolve, reject) => {
      this.stream.write("\n]", () => {
        this.stream.end(() => {
          resolve()
        })
      })
      this.stream.on("error", reject)
    })
  }
}

export async function ensureDir(filePath: string): Promise<void> {
  await mkdir(dirname(filePath), { recursive: true })
}

export function buildCategoryFilePath(
  outputDir: string,
  category: string,
  version: number,
  extension: string = "json",
): string {
  return `${outputDir}/${category}.v${version}.${extension}`
}
