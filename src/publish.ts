import { readFileSync } from "node:fs"
import { resolve, dirname } from "node:path"
import { fileURLToPath } from "node:url"
import { config } from "dotenv"

import { Publisher } from "./publisher/uploader.js"
import { buildMetadata } from "./publisher/metadata.js"
import { buildManifest } from "./publisher/manifest.js"
import { sha256File, getFileSize } from "./utils/integrity.js"
import { logger } from "./utils/logger.js"
import { CATEGORIES } from "./types/threat.js"
import { StageFile, PipelineConfig } from "./types/pipeline.js"

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

config()

async function loadStageFiles(
  outputDir: string,
  categories: string[],
  version: number,
): Promise<StageFile[]> {
  const files: StageFile[] = []

  for (const cat of categories) {
    const path = resolve(outputDir, `${cat}.json`)
    try {
      readFileSync(path)
    } catch {
      continue
    }

    const sha256 = await sha256File(path)
    const originalSize = await getFileSize(path)
    const compressedPath = resolve(outputDir, `${cat}.json.gz`)
    const compressedSha256 = await sha256File(compressedPath)
    const compressedSize = await getFileSize(compressedPath)

    files.push({
      category: cat as any,
      path,
      tmpPath: path,
      domainCount: 0,
      sha256,
      originalSize,
      compressedSize,
      compressedSha256,
      compressionAlgo: "gzip",
    })
  }

  return files
}

async function main(): Promise<void> {
  const configPath = resolve(__dirname, "config", "pipeline.json")
  const pipelineConfig: PipelineConfig = JSON.parse(readFileSync(configPath, "utf-8"))
  const outputDir = resolve(__dirname, "..", pipelineConfig.outputDir)

  const stageFiles = await loadStageFiles(outputDir, CATEGORIES, pipelineConfig.version)

  const totalDomains = stageFiles.reduce((s, f) => s + f.domainCount, 0)
  const perCategory: Record<string, number> = {}
  for (const f of stageFiles) {
    perCategory[f.category] = f.domainCount
  }

  const metadata = await buildMetadata(
    pipelineConfig.version,
    stageFiles,
    totalDomains,
    outputDir,
  )

  const baseUrl = `${pipelineConfig.publisher.endpoint}/ioc/v${pipelineConfig.version}`
  const manifest = await buildManifest(
    pipelineConfig.version,
    stageFiles,
    totalDomains,
    perCategory,
    0,
    0,
    baseUrl,
    outputDir,
  )

  const publisher = new Publisher(pipelineConfig)
  const report = await publisher.publishManifest(manifest, stageFiles, metadata)

  if (report.success) {
    logger.info("Publish completed successfully")
    logger.info(`Base URL: ${report.baseUrl}`)
    for (const [cat, url] of Object.entries(report.urls)) {
      logger.info(`  ${cat}: ${url}`)
    }
  } else {
    logger.error("Publish failed")
    for (const f of report.files) {
      if (!f.success) {
        logger.error(`  ${f.category}: ${f.error}`)
      }
    }
    process.exit(1)
  }
}

main()
