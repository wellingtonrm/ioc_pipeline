import { Readable } from "node:stream"
import { createInterface } from "node:readline"
import { readFileSync } from "node:fs"
import { resolve, dirname } from "node:path"
import { fileURLToPath } from "node:url"

import { CrawlerService } from "../crawler/crawler.service.js"
import { getParser } from "../parser/parser.factory.js"
import { ShardEngine } from "../shard/shard-engine.js"
import { StageBuilder } from "../generator/stage-builder.js"
import { Publisher } from "../publisher/uploader.js"
import { buildMetadata } from "../publisher/metadata.js"
import { buildManifest } from "../publisher/manifest.js"
import { classify } from "../classifier/classifier.js"
import {
  normalizeIOC,
  detectIOCType,
  computeSHA256,
  cleanIOC,
} from "../utils/domain.js"
import { parallel } from "../utils/concurrency.js"
import {
  resetMetrics,
  stageStart,
  stageEnd,
  buildMetrics,
  printMetrics,
  addError,
} from "../observability/metrics.js"
import { logger } from "../utils/logger.js"
import { validateIOCValue } from "../validator/validator.js"

import { Source } from "../types/source.js"
import { Category, CATEGORIES } from "../types/threat.js"
import {
  NormalizedIOC,
  PipelineConfig,
  ShardConfig,
  PipelineMetrics,
  StageFile,
} from "../types/pipeline.js"

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

export class IOCPipeline {
  private crawler: CrawlerService
  private shardEngine: ShardEngine
  private stageBuilder: StageBuilder
  private publisher: Publisher
  private config: PipelineConfig
  private metrics: PipelineMetrics | null

  private _stageFiles: StageFile[] = []
  private _totalDomains = 0
  private _perCategory: Record<string, number> = {}
  private _duration = 0
  private _totalSources = 0
  private chunkId: number

  constructor(chunkId: number) {
    this.chunkId = chunkId
    this.config = this.loadConfig()
    this.crawler = new CrawlerService()
    this.publisher = new Publisher(this.config)

    const shardConfig: ShardConfig = {
      totalShards: this.config.shards,
      algorithm: "fnv1a",
    }
    this.shardEngine = new ShardEngine(shardConfig)
    this.stageBuilder = new StageBuilder(this.config)
    this.metrics = null
  }

  private loadConfig(): PipelineConfig {
    const p = resolve(__dirname, "..", "config", "pipeline.json")
    return JSON.parse(readFileSync(p, "utf-8"))
  }

  async run(sources: Source[]): Promise<{ metrics: PipelineMetrics, stageFiles: StageFile[], totalDomains: number, perCategory: Record<string, number>, duration: number }> {
    const globalStart = Date.now()
    resetMetrics()
    stageStart(`chunk-${this.chunkId}-total`)

    logger.info("=".repeat(60))
    logger.info(`IOC PIPELINE v${this.config.version} - CHUNK ${this.chunkId}`)
    logger.info("=".repeat(60))
    logger.info(`Shards: ${this.config.shards}`)
    logger.info(`Buffer: ${(this.config.bufferSize / 1000).toFixed(0)}K`)
    logger.info(`Compression: ${this.config.compression.priority.join(" → ")}`)
    logger.info("")

    logger.info(`Sources: ${sources.length} in this chunk`)

    await this.crawler.init()

    await this.stageBuilder.init(CATEGORIES, this.chunkId)
    let totalParsed = 0
    let totalSources = 0
    let shardStates: import("../types/pipeline.js").ShardState[] = []

    try {
      const batches: Source[][] = []
      for (let i = 0; i < sources.length; i += this.config.sources.concurrency) {
        batches.push(sources.slice(i, i + this.config.sources.concurrency))
      }

      for (const batch of batches) {
        const results = await parallel(
          batch.map((s) => () => this.processSource(s)),
          this.config.sources.concurrency,
        )
        for (const parsed of results) {
          totalParsed += parsed
        }
        totalSources += batch.length
        this.shardEngine.clearHashes()
      }

      logger.info(`[PIPELINE] Flushing remaining sharded data...`)

      for (let i = 0; i < this.config.shards; i++) {
        await this.stageBuilder.flushShard(i, this.shardEngine)
      }

      shardStates = this.shardEngine.getAllStates()

      logger.info(`[PIPELINE] Total parsed: ${totalParsed.toLocaleString("pt-BR")}`)
      logger.info(`[PIPELINE] After dedup: ${this.shardEngine.totalDomains().toLocaleString("pt-BR")}`)
      logger.info(`[PIPELINE] Dedup hits: ${this.shardEngine.totalDedupHits().toLocaleString("pt-BR")}`)

    } finally {
      await this.crawler.close()
    }

    this._stageFiles = await this.stageBuilder.finalize(this.chunkId)
    await this.stageBuilder.cleanup()

    this._totalDomains = this.shardEngine.totalDomains()
    this._perCategory = {}
    for (const f of this._stageFiles) {
      this._perCategory[f.category] = f.domainCount
    }

    this._duration = Date.now() - globalStart
    this._totalSources = totalSources
    
    stageEnd(`chunk-${this.chunkId}-total`)

    const stageTimings: Record<string, number> = {}
    this.metrics = buildMetrics(shardStates, stageTimings)
    printMetrics(this.metrics)

    return {
      metrics: this.metrics,
      stageFiles: this._stageFiles,
      totalDomains: this._totalDomains,
      perCategory: this._perCategory,
      duration: this._duration
    }
  }

  // Publish is removed from here as ChunkManager handles it

  private async processSource(source: Source): Promise<number> {
    stageStart(`source:${source.id}`)
    let parsed = 0

    try {
      logger.info(`[CRAWL] ${source.name} (${source.url})`)
      const content = await this.crawler.fetch(source.url)
      const parser = getParser(source.parser)

      const readable = Readable.from(content)
      const rl = createInterface({ input: readable, crlfDelay: Infinity })

      for await (const line of rl) {
        const trimmed = line.trim()
        if (!trimmed || trimmed.startsWith("#") || trimmed.startsWith("!")) {
          continue
        }

        const results = parser.parse(trimmed)
        for (const raw of results) {
          const validation = validateIOCValue(raw)
          if (!validation.valid) {
            addError(`[${source.name}] ${validation.error}`)
            continue
          }

          const normalized = normalizeIOC(raw)
          if (!normalized) continue

          const iocType = detectIOCType(normalized)
          const sha256 = computeSHA256(normalized)
          const keywords = matchSourceKeywords(normalized)
          const classification = classify(normalized, keywords, source.source, source.type as Category)

          const ioc: NormalizedIOC = {
            raw: cleanIOC(raw),
            normalized,
            domain: normalized,
            iocType,
            sha256,
            category: classification.category,
            shardIndex: 0,
          }

          ioc.shardIndex = this.shardEngine.assignShard(ioc)
          const added = this.shardEngine.tryAdd(ioc.shardIndex, ioc)

          if (added) {
            parsed++
            if (parsed % this.config.bufferSize === 0) {
              await this.stageBuilder.flushShard(ioc.shardIndex, this.shardEngine)
            }
          }
        }
      }

      await this.flushSourceShards()
      logger.info(`[CRAWL] ${source.name}: ${parsed.toLocaleString("pt-BR")} new IOCs`)
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      addError(`[${source.name}] ${msg}`)
      logger.error(`[CRAWL] ${source.name} failed: ${msg}`)
    }

    stageEnd(`source:${source.id}`)
    return parsed
  }

  private async flushSourceShards(): Promise<void> {
    for (let i = 0; i < this.config.shards; i++) {
      const state = this.shardEngine.getState(i)
      if (state && state.buffer.length > 0) {
        await this.stageBuilder.flushShard(i, this.shardEngine)
      }
    }
  }

}

function matchSourceKeywords(value: string): string[] {
  const found: string[] = []
  const lower = value.toLowerCase()

  if (lower.includes("phish") || lower.includes("login") || lower.includes("account")) found.push("phishing")
  if (lower.includes("ad") || lower.includes("ads") || lower.includes("advert")) found.push("ads")
  if (lower.includes("track") || lower.includes("analytics") || lower.includes("pixel")) found.push("tracker")
  if (lower.includes("malware") || lower.includes("virus") || lower.includes("trojan")) found.push("malware")
  if (lower.includes("crypto") || lower.includes("miner") || lower.includes("coin")) found.push("cryptominer")
  if (lower.includes("scam") || lower.includes("fraud")) found.push("scam")
  if (lower.includes("spam")) found.push("spam")
  if (lower.includes("ransom")) found.push("ransomware")
  if (lower.includes("bot") || lower.includes("ddos")) found.push("botnet")
  if (lower.includes("c2") || lower.includes("command")) found.push("c2")
  if (lower.includes("exploit") || lower.includes("cve")) found.push("exploit")

  return found
}
