import { ShardState, PipelineMetrics } from "../types/pipeline.js"

const startTimes = new Map<string, number>()
let _startedAt = 0
let _totalDomains = 0
let _dedupHits = 0
const _errors: string[] = []

export function resetMetrics(): void {
  startTimes.clear()
  _startedAt = Date.now()
  _totalDomains = 0
  _dedupHits = 0
  _errors.length = 0
}

export function stageStart(stage: string): void {
  startTimes.set(stage, Date.now())
}

export function stageEnd(stage: string): number {
  const start = startTimes.get(stage)
  if (!start) return 0
  const elapsed = Date.now() - start
  return elapsed
}

export function addDomain(count: number): void {
  _totalDomains += count
}

export function addDedupHit(): void {
  _dedupHits++
}

export function addError(error: string): void {
  _errors.push(error)
}

export function buildMetrics(
  shardStates: ShardState[],
  stageTimings: Record<string, number>,
): PipelineMetrics {
  const elapsed = Date.now() - _startedAt
  const mem = process.memoryUsage()

  return {
    startedAt: _startedAt,
    stageTimings,
    throughput: elapsed > 0 ? Math.round(_totalDomains / (elapsed / 1000)) : 0,
    memoryUsage: Math.round(mem.heapUsed / 1024 / 1024),
    shardStats: shardStates,
    totalDomains: _totalDomains,
    dedupHits: _dedupHits,
    errors: _errors,
  }
}

export function formatBytes(bytes: number): string {
  if (bytes === 0) return "0 B"
  const units = ["B", "KB", "MB", "GB", "TB"]
  const i = Math.floor(Math.log(bytes) / Math.log(1024))
  return `${(bytes / Math.pow(1024, i)).toFixed(1)} ${units[i]}`
}

export function printMetrics(m: PipelineMetrics): void {
  const elapsed = ((Date.now() - m.startedAt) / 1000).toFixed(2)
  console.log("=".repeat(60))
  console.log("PIPELINE METRICS")
  console.log("=".repeat(60))
  console.log(`  Duration:      ${elapsed}s`)
  console.log(`  Total Domains: ${m.totalDomains.toLocaleString("pt-BR")}`)
  console.log(`  Dedup Hits:    ${m.dedupHits.toLocaleString("pt-BR")}`)
  console.log(`  Throughput:    ${m.throughput.toLocaleString("pt-BR")} IOC/s`)
  console.log(`  Memory:        ${formatBytes(m.memoryUsage * 1024 * 1024)}`)
  console.log("")
  console.log("Stage Timings:")
  for (const [stage, ms] of Object.entries(m.stageTimings)) {
    console.log(`  ${stage}: ${(ms / 1000).toFixed(2)}s`)
  }
  console.log("")
  console.log("Shard Stats:")
  for (const s of m.shardStats) {
    console.log(`  Shard #${s.index}: ${s.domainCount.toLocaleString("pt-BR")} domains, ${s.dedupHits} dedup hits`)
  }
  if (m.errors.length > 0) {
    console.log("")
    console.log(`Errors (${m.errors.length}):`)
    for (const e of m.errors) {
      console.log(`  ✗ ${e}`)
    }
  }
  console.log("=".repeat(60))
}
