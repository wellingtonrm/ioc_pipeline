import { Category } from "./threat.js"

export interface RawIOC {
  value: string
  source: string
  sourceType: string
}

export interface NormalizedIOC {
  raw: string
  normalized: string
  domain: string
  iocType: string
  sha256: string
  category: Category
  shardIndex: number
}

export interface ShardConfig {
  totalShards: number
  algorithm: "fnv1a" | "murmur"
}

export interface ShardState {
  index: number
  domainCount: number
  dedupHits: number
  buffer: NormalizedIOC[]
}

export interface StageFile {
  category: Category
  path: string
  tmpPath: string
  domainCount: number
  sha256: string
  originalSize: number
  compressedSize: number
  compressedSha256: string
  compressionAlgo: string
}

export interface ReleaseManifest {
  version: number
  generatedAt: string
  baseUrl: string
  files: Record<string, {
    url: string
    size: number
    sha256: string
    compressedSha256: string
    compression: string
    domainCount: number
  }>
  metadata: {
    totalDomains: number
    perCategory: Record<string, number>
    duration: number
    sourcesProcessed: number
  }
}

export interface PipelineMetrics {
  startedAt: number
  stageTimings: Record<string, number>
  throughput: number
  memoryUsage: number
  shardStats: ShardState[]
  totalDomains: number
  dedupHits: number
  errors: string[]
}

export interface PublisherConfig {
  endpoint: string
  retryMax: number
  retryDelay: number
  timeout: number
  concurrency: number
}

export interface PipelineConfig {
  version: number
  shards: number
  bufferSize: number
  compression: {
    priority: string[]
    level: Record<string, number>
  }
  outputDir: string
  tmpDir: string
  publisher: PublisherConfig
  sources: {
    concurrency: number
  }
}
