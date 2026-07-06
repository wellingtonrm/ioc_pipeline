import { Readable } from "node:stream"
import { createInterface } from "node:readline"
import { CrawlerService } from "../crawler/crawler.service.js"
import { getParser } from "../parser/parser.factory.js"
import { enrichBatch } from "../enricher/enricher.js"
import { CopyRepository } from "../database/copy-repository.js"
import { pool } from "../database/pool.js"
import { parallel } from "../utils/concurrency.js"
import { logger } from "../utils/logger.js"
import { Source } from "../types/source.js"
import { IngestResult } from "../types/threat.js"
import { readFileSync } from "node:fs"
import { resolve, dirname } from "node:path"
import { fileURLToPath } from "node:url"

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

const BUFFER_SIZE = 10_000
const DOWNLOAD_CONCURRENCY = 5
const SOURCE_CONCURRENCY = 3

export class Pipeline {
  private crawler: CrawlerService
  private repository: CopyRepository

  constructor() {
    this.crawler = new CrawlerService()
    this.repository = new CopyRepository(pool)
  }

  private loadSources(): Source[] {
    const p = resolve(__dirname, "..", "config", "sources.json")
    return JSON.parse(readFileSync(p, "utf-8")).filter((s: Source) => s.enabled)
  }

  private async processSource(source: Source): Promise<IngestResult> {
    const errors: string[] = []
    const result: IngestResult = {
      listId: source.id,
      listName: source.name,
      total: 0,
      inserted: 0,
      ignored: 0,
      errors,
    }

    try {
      logger.info(`[FEED] ${source.name}`)

      const content = await this.crawler.fetch(source.url)
      const parser = getParser(source.parser)

      const buffer: string[] = []
      const seenHashes = new Set<string>()
      let totalParsed = 0

      const readable = Readable.from(content)
      const rl = createInterface({ input: readable, crlfDelay: Infinity })

      for await (const line of rl) {
        const trimmed = line.trim()
        if (!trimmed || trimmed.startsWith("#") || trimmed.startsWith("!")) {
          continue
        }

        const parsed = parser.parse(trimmed)
        for (const raw of parsed) {
          totalParsed++

          const enriched = enrichBatch([raw], source.source, source.type)
          for (const ioc of enriched) {
            if (seenHashes.has(ioc.sha256)) continue
            seenHashes.add(ioc.sha256)
            buffer.push(ioc)
          }

          if (buffer.length >= BUFFER_SIZE) {
            const batch = buffer.splice(0, buffer.length)
            const { inserted } = await this.repository.importBatch(batch)
            result.inserted += inserted
            logger.info(
              `[FEED] ${source.name}: ${result.inserted.toLocaleString("pt-BR")} inseridos (${totalParsed.toLocaleString("pt-BR")} parseados)`
            )
          }
        }
      }

      if (buffer.length > 0) {
        const { inserted } = await this.repository.importBatch(buffer)
        result.inserted += inserted
      }

      result.total = totalParsed
      result.ignored = totalParsed - result.inserted

      logger.info(`[FEED] ${source.name} concluído: ${result.inserted.toLocaleString("pt-BR")} inseridos`)
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      errors.push(msg)
      logger.error(`[FEED] Falha "${source.name}": ${msg}`)
    }

    return result
  }

  async run(): Promise<IngestResult[]> {
    const start = Date.now()
    logger.info("Pipeline de ingestão inicializado")
    logger.divider()

    const sources = this.loadSources()
    logger.info(`${sources.length} fonte(s) habilitada(s)`)
    logger.divider()

    await this.crawler.init()

    const results: IngestResult[] = []

    try {
      const batches: Source[][] = []
      for (let i = 0; i < sources.length; i += SOURCE_CONCURRENCY) {
        batches.push(sources.slice(i, i + SOURCE_CONCURRENCY))
      }

      for (const batch of batches) {
        const batchResults = await parallel(
          batch.map((s) => () => this.processSource(s)),
          SOURCE_CONCURRENCY,
        )
        results.push(...batchResults)
      }
    } finally {
      await this.crawler.close()
      await pool.end()
    }

    const elapsed = ((Date.now() - start) / 1000).toFixed(2)
    const totalInserted = results.reduce((s, r) => s + r.inserted, 0)
    const totalErrors = results.reduce((s, r) => s + r.errors.length, 0)

    logger.divider()
    logger.info(`Pipeline concluído:`)
    logger.info(`  Inseridos: ${totalInserted.toLocaleString("pt-BR")}`)
    logger.info(`  Erros: ${totalErrors}`)
    logger.info(`  Tempo: ${elapsed}s`)

    return results
  }
}
