import { writeFile } from "node:fs/promises"
import { join } from "node:path"
import { StageFile, ReleaseManifest } from "../types/pipeline.js"
import { stageStart, stageEnd } from "../observability/metrics.js"
import { logger } from "../utils/logger.js"

export async function buildManifest(
  version: number,
  stageFiles: StageFile[],
  totalDomains: number,
  perCategory: Record<string, number>,
  duration: number,
  sourcesProcessed: number,
  baseUrl: string,
  outputDir: string,
): Promise<ReleaseManifest> {
  stageStart("manifest")

  const files: ReleaseManifest["files"] = {}

  for (const f of stageFiles) {
    files[f.category] = {
      url: `${baseUrl}/${f.category}.v${version}.${f.compressionAlgo === "brotli" ? "br" : f.compressionAlgo === "gzip" ? "gz" : "zst"}`,
      size: f.compressedSize,
      sha256: f.sha256,
      compressedSha256: f.compressedSha256,
      compression: f.compressionAlgo,
      domainCount: f.domainCount,
    }
  }

  const manifest: ReleaseManifest = {
    version,
    generatedAt: new Date().toISOString(),
    baseUrl,
    files,
    metadata: {
      totalDomains,
      perCategory,
      duration,
      sourcesProcessed,
    },
  }

  const raw = JSON.stringify(manifest, null, 2)
  await writeFile(join(outputDir, "manifest.json"), raw, "utf-8")
  logger.info(`[MANIFEST] version ${version} written to ${outputDir}/manifest.json`)

  stageEnd("manifest")
  return manifest
}
