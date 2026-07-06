import { writeFile } from "node:fs/promises"
import { join } from "node:path"
import { StageFile } from "../types/pipeline.js"
import { computeSHA256 } from "../utils/domain.js"
import { stageStart, stageEnd } from "../observability/metrics.js"
import { logger } from "../utils/logger.js"

export interface MetadataPayload {
  version: number
  generatedAt: string
  totalDomains: number
  perCategory: Record<string, number>
  files: Record<string, {
    category: string
    iocType: string
    compression: string
    sha256: string
    compressedSha256: string
    domainCount: number
    originalSize: number
    compressedSize: number
  }>
  integrity: {
    manifestSha256: string
  }
}

export async function buildMetadata(
  version: number,
  stageFiles: StageFile[],
  totalDomains: number,
  outputDir: string,
): Promise<MetadataPayload> {
  stageStart("metadata")

  const perCategory: Record<string, number> = {}
  const files: any = {}

  for (const f of stageFiles) {
    perCategory[f.category] = (perCategory[f.category] || 0) + f.domainCount
    files[f.category] = {
      category: f.category,
      iocType: "domain",
      compression: f.compressionAlgo,
      sha256: f.sha256,
      compressedSha256: f.compressedSha256,
      domainCount: f.domainCount,
      originalSize: f.originalSize,
      compressedSize: f.compressedSize,
    }
  }

  const metadata: MetadataPayload = {
    version,
    generatedAt: new Date().toISOString(),
    totalDomains,
    perCategory,
    files,
    integrity: {
      manifestSha256: "",
    },
  }

  const raw = JSON.stringify(metadata, null, 2)
  metadata.integrity.manifestSha256 = computeSHA256(raw)

  await writeFile(join(outputDir, "metadata.json"), raw, "utf-8")
  logger.info(`[METADATA] generated: ${totalDomains.toLocaleString("pt-BR")} total domains across ${stageFiles.length} categories`)

  stageEnd("metadata")
  return metadata
}
