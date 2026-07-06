import { mkdir, rm } from "node:fs/promises"
import { join } from "node:path"
import { NormalizedIOC, StageFile, PipelineConfig } from "../types/pipeline.js"
import { Category } from "../types/threat.js"
import { ShardEngine } from "../shard/shard-engine.js"
import { StreamWriter, ensureDir } from "./stream-writer.js"
import { compressFile } from "../compression/compress.js"
import { sha256File, getFileSize } from "../utils/integrity.js"
import { stageStart, stageEnd, addDomain, formatBytes } from "../observability/metrics.js"
import { logger } from "../utils/logger.js"

export class StageBuilder {
  private writers: Map<Category, StreamWriter>
  private counts: Map<Category, number>
  private config: PipelineConfig
  private outputDir: string
  private tmpDir: string

  constructor(config: PipelineConfig) {
    this.config = config
    this.outputDir = config.outputDir
    this.tmpDir = config.tmpDir
    this.writers = new Map()
    this.counts = new Map()
  }

  private categoryFilePath(category: Category, chunkId?: number): string {
    if (chunkId !== undefined) {
      const partStr = String(chunkId).padStart(3, '0')
      return join(this.outputDir, `${category}.part${partStr}.json`)
    }
    return join(this.outputDir, `${category}.json`)
  }

  private categoryTmpPath(category: Category, chunkId?: number): string {
    if (chunkId !== undefined) {
      const partStr = String(chunkId).padStart(3, '0')
      return join(this.tmpDir, `${category}.part${partStr}.tmp.json`)
    }
    return join(this.tmpDir, `${category}.tmp.json`)
  }

  async init(categories: Category[], chunkId?: number): Promise<void> {
    stageStart("stage-builder-init")
    await mkdir(this.outputDir, { recursive: true })
    await mkdir(this.tmpDir, { recursive: true })

    for (const cat of categories) {
      const tmpPath = this.categoryTmpPath(cat, chunkId)
      await ensureDir(tmpPath)
      const writer = new StreamWriter({
        filePath: tmpPath,
        flushInterval: 5000,
      })
      this.writers.set(cat, writer)
      this.counts.set(cat, 0)
    }
    stageEnd("stage-builder-init")
  }

  async flushShard(shardIndex: number, engine: ShardEngine): Promise<void> {
    const batch = engine.drainShard(shardIndex)
    if (batch.length === 0) return

    for (const ioc of batch) {
      const writer = this.writers.get(ioc.category)
      if (writer) {
        await writer.write(ioc)
        this.counts.set(ioc.category, (this.counts.get(ioc.category) || 0) + 1)
      }
    }

    addDomain(batch.length)
  }

  getCategoryCount(category: Category): number {
    return this.counts.get(category) || 0
  }

  async finalize(chunkId?: number): Promise<StageFile[]> {
    stageStart("stage-builder-finalize")
    const files: StageFile[] = []

    for (const [category, writer] of this.writers) {
      const tmpPath = this.categoryTmpPath(category, chunkId)
      const finalPath = this.categoryFilePath(category, chunkId)
      const domainCount = this.counts.get(category) || 0

      await writer.close()

      const originalSize = await getFileSize(tmpPath)

      const { compressedPath, algorithm, compressedSize } = await compressFile(
        tmpPath,
        finalPath,
        this.config.compression,
      )

      const sha256 = await sha256File(finalPath)
      const compressedSha256 = await sha256File(compressedPath)

      files.push({
        category,
        path: compressedPath,
        tmpPath,
        domainCount,
        sha256,
        originalSize,
        compressedSize,
        compressedSha256,
        compressionAlgo: algorithm,
      })

      logger.info(
        `[STAGE] ${category}: ${domainCount.toLocaleString("pt-BR")} domains | ` +
        `${formatBytes(originalSize)} → ${formatBytes(compressedSize)} (${algorithm})`
      )
    }

    this.writers.clear()
    this.counts.clear()

    stageEnd("stage-builder-finalize")
    return files
  }

  async cleanup(): Promise<void> {
    await rm(this.tmpDir, { recursive: true, force: true })
  }
}


