import { readFile } from "node:fs/promises"
import { StageFile, PipelineConfig, ReleaseManifest } from "../types/pipeline.js"
import { FileUploadResult, PublishReport, UploadResponse } from "../types/publisher.js"
import { MetadataPayload } from "./metadata.js"
import { stageStart, stageEnd, formatBytes } from "../observability/metrics.js"
import { logger } from "../utils/logger.js"
import { CheckpointData, CheckpointManager } from "../orchestration/checkpoint.manager.js"

function delay(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms))
}

function getApiKey(): string {
  return process.env.IOC_UPLOAD_API_KEY || ""
}

export class Publisher {
  private config: PipelineConfig

  constructor(config: PipelineConfig) {
    this.config = config
  }

  async publishManifest(
    manifest: ReleaseManifest,
    stageFiles: StageFile[],
    metadata: MetadataPayload,
  ): Promise<PublishReport> {
    stageStart("publish")

    const startedAt = new Date().toISOString()
    const results: FileUploadResult[] = []
    let uploadedBytes = 0
    const urls: Record<string, string> = {}

    for (const file of stageFiles) {
      const result = await this.uploadFile(file, metadata)
      results.push(result)
      if (result.success) {
        uploadedBytes += file.compressedSize
        urls[file.category] = result.url
      }
    }

    const manifestResult = await this.uploadMetadata(metadata, manifest.version)
    results.push(manifestResult)

    const finishedAt = new Date().toISOString()
    const duration = Date.parse(finishedAt) - Date.parse(startedAt)
    const success = results.every((r) => r.success)

    const report: PublishReport = {
      version: manifest.version,
      success,
      startedAt,
      finishedAt,
      duration,
      uploadedFiles: results.filter((r) => r.success).length,
      uploadedBytes,
      baseUrl: manifest.baseUrl,
      urls,
      files: results,
    }

    logger.info(`[PUBLISH] ${success ? "✓" : "✗"} uploaded ${report.uploadedFiles} files (${formatBytes(uploadedBytes)})`)

    stageEnd("publish")
    return report
  }

  async publishChunkFiles(
    stageFiles: StageFile[],
    metadata: MetadataPayload,
    chunkId: number,
    checkpoint: CheckpointData,
    checkpointManager: CheckpointManager,
  ): Promise<PublishReport> {
    const startedAt = new Date().toISOString()
    const results: FileUploadResult[] = []
    let uploadedBytes = 0
    const urls: Record<string, string> = {}

    for (const file of stageFiles) {
      const fileName = file.path.split(/[\/\\]/).pop() || `${file.category}.zst`

      // Skip files already confirmed uploaded+registered in a previous run
      if (checkpointManager.isFileUploaded(checkpoint, chunkId, fileName)) {
        logger.info(`[UPLOAD] ${fileName} → Skipping (already uploaded in previous run)`)
        results.push({ category: file.category, url: "", fileId: 0, success: true, attempts: 0 })
        continue
      }

      const result = await this.uploadFile(file, metadata)
      results.push(result)
      if (result.success) {
        uploadedBytes += file.compressedSize
        urls[file.category] = result.url
        // Persist immediately so a crash mid-chunk doesn't re-upload this file
        await checkpointManager.markFileUploaded(checkpoint, chunkId, fileName)
      }
    }

    const finishedAt = new Date().toISOString()
    const duration = Date.parse(finishedAt) - Date.parse(startedAt)
    const success = results.every((r) => r.success)

    if (!success) {
      const failed = results.filter(r => !r.success).map(r => r.category)
      logger.warn(`[UPLOAD] Failed files: ${failed.join(', ')}`)
    }

    return {
      version: metadata.version,
      success,
      startedAt,
      finishedAt,
      duration,
      uploadedFiles: results.filter((r) => r.success).length,
      uploadedBytes,
      baseUrl: "",
      urls,
      files: results,
    }
  }

  private async uploadFile(
    file: StageFile,
    metadata: MetadataPayload,
  ): Promise<FileUploadResult> {
    const apiKey = getApiKey()
    const attempts: string[] = []

    const fileMeta = metadata.files[file.category]
    if (!fileMeta) {
      return {
        category: file.category,
        url: "",
        fileId: 0,
        success: false,
        error: "no metadata for this category",
        attempts: 0,
      }
    }

    const fileName = file.path.split(/[/\\]/).pop() || `${file.category}.zst`
    const version = metadata.version
    const storagePath = `v${version}/${fileName}`

    // Supabase Project URL from env
    const supabaseUrl = process.env.SUPABASE_URL || this.config.publisher.endpoint.replace(/\/functions\/v1$/, "")
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY || apiKey
    const storageBucket = process.env.STORAGE_BUCKET || "ioc"
    const storageUploadUrl = `${supabaseUrl}/storage/v1/object/${storageBucket}/${storagePath}`
    const publicUrl = `${supabaseUrl}/storage/v1/object/public/${storageBucket}/${storagePath}`
    const registerUrl = `${this.config.publisher.endpoint}/api/ioc/register`

    const payload = {
      release: {
        version: metadata.version,
        generatedAt: metadata.generatedAt,
        channel: "stable",
        notes: `Pipeline v${metadata.version} — ${file.category}`,
      },
      file: { ...fileMeta, fileName },
      filter: {
        platforms: ["android", "ios", "windows", "macos", "linux"],
        engines: ["dns", "proxy", "vpn"],
        modes: ["block"],
        enabled: true,
        recommended: false,
        priority: 0,
        language: "global",
        region: "world",
        tags: [file.category],
      },
      storagePath,
      publicUrl,
    }

    for (let attempt = 1; attempt <= this.config.publisher.retryMax; attempt++) {
      try {
        // Step 1: Upload binary directly to Supabase Storage (no body size limit)
        const content = await readFile(file.path)
        const storageController = new AbortController()
        const storageTimeout = setTimeout(() => storageController.abort(), this.config.publisher.timeout)

        const storageRes = await fetch(storageUploadUrl, {
          method: "POST",
          headers: {
            "Authorization": `Bearer ${serviceRoleKey}`,
            "Content-Type": "application/octet-stream",
            "x-upsert": "true",
          },
          body: content,
          signal: storageController.signal,
        })
        clearTimeout(storageTimeout)

        if (!storageRes.ok) {
          const text = await storageRes.text().catch(() => "")
          throw new Error(`Storage upload failed: HTTP ${storageRes.status} — ${text}`)
        }

        logger.info(`[UPLOAD] ${fileName} → Storage OK (${(content.length / 1024 / 1024).toFixed(2)} MB)`)

        // Step 2: Register metadata in DB via Edge Function (tiny JSON payload)
        const registerController = new AbortController()
        const registerTimeout = setTimeout(() => registerController.abort(), 30000)

        const headers: Record<string, string> = {
          "Content-Type": "application/json",
          "X-IOC-Version": String(metadata.version),
          "X-IOC-Category": file.category,
        }
        if (apiKey) {
          headers["Authorization"] = `Bearer ${apiKey}`
        }

        const registerRes = await fetch(registerUrl, {
          method: "POST",
          headers,
          body: JSON.stringify({ metadata: JSON.stringify(payload) }),
          signal: registerController.signal,
        })
        clearTimeout(registerTimeout)

        if (!registerRes.ok) {
          const text = await registerRes.text().catch(() => "")
          throw new Error(`Register failed: HTTP ${registerRes.status} — ${text}`)
        }

        const result: UploadResponse = await registerRes.json()

        return {
          category: file.category,
          url: publicUrl,
          fileId: result.fileId,
          success: true,
          attempts: attempt,
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err)
        attempts.push(msg)
        logger.warn(`[UPLOAD] ${file.category} attempt ${attempt}/${this.config.publisher.retryMax} failed: ${msg}`)

        if (attempt < this.config.publisher.retryMax) {
          const backoff = this.config.publisher.retryDelay * Math.pow(2, attempt - 1)
          await delay(backoff)
        }
      }
    }

    return {
      category: file.category,
      url: "",
      fileId: 0,
      success: false,
      error: attempts.join("; "),
      attempts: this.config.publisher.retryMax,
    }
  }

  private async uploadMetadata(
    metadata: MetadataPayload,
    version: number,
  ): Promise<FileUploadResult> {
    const attempts: string[] = []
    const url = `${this.config.publisher.endpoint}/api/ioc/upload`

    for (let attempt = 1; attempt <= this.config.publisher.retryMax; attempt++) {
      try {
        const metadataContent = JSON.stringify(metadata, null, 2)
        const encoder = new TextEncoder()
        const base64 = btoa(String.fromCharCode(...encoder.encode(metadataContent)))

        const payload = {
          release: {
            version,
            generatedAt: metadata.generatedAt,
            channel: "stable",
            notes: `Pipeline v${version} — metadata`,
          },
          file: {
            category: "metadata",
            iocType: "metadata",
            fileName: "metadata.json",
            compression: "none",
            sha256: metadata.integrity.manifestSha256,
            originalSize: metadataContent.length,
            compressedSize: metadataContent.length,
            entries: metadata.totalDomains,
          },
        }

        const body = JSON.stringify({
          metadata: JSON.stringify(payload),
          file: {
            base64,
            type: "application/json",
            name: "metadata.json",
          },
        })

        const apiKey = getApiKey()
        const headers: Record<string, string> = {
          "Content-Type": "application/json",
          "X-IOC-Version": String(version),
          "X-IOC-Type": "metadata",
        }
        if (apiKey) {
          headers["Authorization"] = `Bearer ${apiKey}`
        }

        const response = await fetch(url, {
          method: "POST",
          headers,
          body,
        })

        if (!response.ok) {
          throw new Error(`HTTP ${response.status}: ${response.statusText}`)
        }

        const result: UploadResponse = await response.json()
        return {
          category: "metadata",
          url: result.url,
          fileId: result.fileId,
          success: true,
          attempts: attempt,
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err)
        attempts.push(msg)
        if (attempt < this.config.publisher.retryMax) {
          const backoff = this.config.publisher.retryDelay * Math.pow(2, attempt - 1)
          await delay(backoff)
        }
      }
    }

    return {
      category: "metadata",
      url: "",
      fileId: 0,
      success: false,
      error: attempts.join("; "),
      attempts: this.config.publisher.retryMax,
    }
  }
}
