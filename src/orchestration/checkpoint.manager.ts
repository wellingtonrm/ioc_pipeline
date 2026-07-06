import { readFile, writeFile } from "node:fs/promises"
import { join } from "node:path"
import { existsSync } from "node:fs"

export enum PipelineStage {
  INITIALIZING = "INITIALIZING",
  DOWNLOAD = "DOWNLOAD",
  PARSER = "PARSER",
  NORMALIZER = "NORMALIZER",
  CATEGORIZER = "CATEGORIZER",
  GENERATOR = "GENERATOR",
  COMPRESSOR = "COMPRESSOR",
  UPLOAD = "UPLOAD",
  CHECKPOINT = "CHECKPOINT",
  CLEANUP = "CLEANUP",
  COMPLETED = "COMPLETED",
  FAILED = "FAILED"
}

export interface CheckpointData {
  runId: string
  release: number
  totalChunks: number
  currentChunk: number
  currentStage: PipelineStage
  completedChunks: number[]
  /** Files already uploaded+registered: key = "chunk-{id}:{fileName}" */
  uploadedFiles: Record<string, true>
  status: "RUNNING" | "FAILED" | "COMPLETED"
  startedAt: string
  updatedAt: string
  error?: string
}

export class CheckpointManager {
  private checkpointFile: string

  constructor(outputDir: string) {
    this.checkpointFile = join(outputDir, "checkpoint.json")
  }

  async loadCheckpoint(): Promise<CheckpointData | null> {
    if (!existsSync(this.checkpointFile)) {
      return null
    }

    try {
      const data = await readFile(this.checkpointFile, "utf-8")
      return JSON.parse(data) as CheckpointData
    } catch {
      return null
    }
  }

  async createCheckpoint(
    runId: string,
    release: number,
    totalChunks: number
  ): Promise<CheckpointData> {
    const data: CheckpointData = {
      runId,
      release,
      totalChunks,
      currentChunk: 1,
      currentStage: PipelineStage.INITIALIZING,
      completedChunks: [],
      uploadedFiles: {},
      status: "RUNNING",
      startedAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    }

    await this.saveCheckpoint(data)
    return data
  }

  async updateStage(data: CheckpointData, stage: PipelineStage): Promise<void> {
    data.currentStage = stage
    data.updatedAt = new Date().toISOString()
    await this.saveCheckpoint(data)
  }

  async markChunkCompleted(data: CheckpointData, chunkIndex: number): Promise<void> {
    if (!data.completedChunks.includes(chunkIndex)) {
      data.completedChunks.push(chunkIndex)
    }
    data.updatedAt = new Date().toISOString()
    await this.saveCheckpoint(data)
  }

  /** Mark a single file as successfully uploaded+registered */
  async markFileUploaded(data: CheckpointData, chunkId: number, fileName: string): Promise<void> {
    if (!data.uploadedFiles) data.uploadedFiles = {}
    data.uploadedFiles[`chunk-${chunkId}:${fileName}`] = true
    data.updatedAt = new Date().toISOString()
    await this.saveCheckpoint(data)
  }

  /** Check if a file was already uploaded+registered in a previous run */
  isFileUploaded(data: CheckpointData, chunkId: number, fileName: string): boolean {
    return !!data.uploadedFiles?.[`chunk-${chunkId}:${fileName}`]
  }

  async setNextChunk(data: CheckpointData, nextChunk: number): Promise<void> {
    data.currentChunk = nextChunk
    data.updatedAt = new Date().toISOString()
    await this.saveCheckpoint(data)
  }

  async failCheckpoint(data: CheckpointData, error: string): Promise<void> {
    data.status = "FAILED"
    data.error = error
    data.updatedAt = new Date().toISOString()
    await this.saveCheckpoint(data)
  }

  async completeCheckpoint(data: CheckpointData): Promise<void> {
    data.status = "COMPLETED"
    data.currentStage = PipelineStage.COMPLETED
    data.updatedAt = new Date().toISOString()
    await this.saveCheckpoint(data)
  }

  private async saveCheckpoint(data: CheckpointData): Promise<void> {
    await writeFile(this.checkpointFile, JSON.stringify(data, null, 2), "utf-8")
  }
}
