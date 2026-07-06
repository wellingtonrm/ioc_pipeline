import { createGzip, createBrotliCompress, constants } from "node:zlib"
import { createReadStream, createWriteStream } from "node:fs"
import { rename, rm } from "node:fs/promises"
import { pipeline as streamPipeline } from "node:stream/promises"
import { extname } from "node:path"

interface CompressionResult {
  compressedPath: string
  algorithm: string
  compressedSize: number
}

interface CompressionConfig {
  priority: string[]
  level: Record<string, number>
}

export async function compressFile(
  sourcePath: string,
  targetBasePath: string,
  config: CompressionConfig,
): Promise<CompressionResult> {
  // Move o arquivo temporário para o path final (json sem compressão)
  await rename(sourcePath, targetBasePath)

  for (const algo of config.priority) {
    switch (algo) {
      case "zstd":
        try {
          return await compressZstd(targetBasePath, targetBasePath)
        } catch {
          continue
        }
      case "brotli":
        return await compressBrotli(targetBasePath, targetBasePath, config.level.brotli || 11)
      case "gzip":
        return await compressGzip(targetBasePath, targetBasePath, config.level.gzip || 9)
    }
  }

  return compressGzip(targetBasePath, targetBasePath, 9)
}

async function compressZstd(sourcePath: string, targetBasePath: string): Promise<CompressionResult> {
  const zstd = await tryLoadZstd()
  if (!zstd) throw new Error("zstd not available")

  const compressedPath = targetBasePath.replace(/\.json$/, "") + ".zst"
  const source = createReadStream(sourcePath)
  const dest = createWriteStream(compressedPath)

  await new Promise<void>((resolve, reject) => {
    dest.on("finish", resolve)
    dest.on("error", reject)
    source.on("error", reject)
    source.pipe(zstd.compress()).pipe(dest)
  })

  return { compressedPath, algorithm: "zstd", compressedSize: 0 }
}

async function compressBrotli(
  sourcePath: string,
  targetBasePath: string,
  level: number,
): Promise<CompressionResult> {
  const compressedPath = targetBasePath.replace(/\.json$/, "") + ".br"
  const source = createReadStream(sourcePath)
  const dest = createWriteStream(compressedPath)

  const brotli = createBrotliCompress({
    params: {
      [constants.BROTLI_PARAM_QUALITY]: level,
      [constants.BROTLI_PARAM_MODE]: constants.BROTLI_MODE_TEXT,
    },
  })

  await streamPipeline(source, brotli, dest)

  return { compressedPath, algorithm: "br", compressedSize: 0 }
}

async function compressGzip(
  sourcePath: string,
  targetBasePath: string,
  level: number,
): Promise<CompressionResult> {
  const compressedPath = targetBasePath.replace(/\.json$/, "") + ".gz"
  const source = createReadStream(sourcePath)
  const dest = createWriteStream(compressedPath)

  const gzip = createGzip({ level })

  await streamPipeline(source, gzip, dest)

  return { compressedPath, algorithm: "gzip", compressedSize: 0 }
}

let _zstdModule: any = null

async function tryLoadZstd(): Promise<{ compress: () => NodeJS.ReadWriteStream } | null> {
  if (_zstdModule) return _zstdModule
  try {
    _zstdModule = await Function('return import("@bokuhealth/zstd-codec")')() as any
    return _zstdModule
  } catch {
    return null
  }
}
