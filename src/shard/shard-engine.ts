import { createHash } from "node:crypto"
import { ShardState, NormalizedIOC, ShardConfig } from "../types/pipeline.js"
import { addDedupHit } from "../observability/metrics.js"

export class ShardEngine {
  private shards: Map<number, Set<string>>
  private states: Map<number, ShardState>
  private totalShards: number

  constructor(config: ShardConfig) {
    this.totalShards = config.totalShards
    this.shards = new Map()
    this.states = new Map()

    for (let i = 0; i < this.totalShards; i++) {
      this.shards.set(i, new Set())
      this.states.set(i, { index: i, domainCount: 0, dedupHits: 0, buffer: [] })
    }
  }

  private hashDomain(domain: string): number {
    const hash = createHash("sha256").update(domain.toLowerCase()).digest()
    return hash.readUInt32BE(0) % this.totalShards
  }

  assignShard(ioc: NormalizedIOC): number {
    return this.hashDomain(ioc.normalized)
  }

  tryAdd(shardIndex: number, ioc: NormalizedIOC): boolean {
    const set = this.shards.get(shardIndex)
    const state = this.states.get(shardIndex)
    if (!set || !state) return false

    if (set.has(ioc.sha256)) {
      state.dedupHits++
      addDedupHit()
      return false
    }

    set.add(ioc.sha256)
    state.domainCount++
    state.buffer.push(ioc)
    return true
  }

  drainShard(shardIndex: number): NormalizedIOC[] {
    const state = this.states.get(shardIndex)
    if (!state) return []
    const batch = state.buffer
    state.buffer = []
    return batch
  }

  drainAll(): Map<number, NormalizedIOC[]> {
    const result = new Map<number, NormalizedIOC[]>()
    for (const [index, state] of this.states) {
      if (state.buffer.length > 0) {
        result.set(index, state.buffer)
        state.buffer = []
      }
    }
    return result
  }

  getState(index: number): ShardState | undefined {
    return this.states.get(index)
  }

  getAllStates(): ShardState[] {
    return Array.from(this.states.values())
  }

  totalDomains(): number {
    let total = 0
    for (const state of this.states.values()) {
      total += state.domainCount
    }
    return total
  }

  totalDedupHits(): number {
    let total = 0
    for (const state of this.states.values()) {
      total += state.dedupHits
    }
    return total
  }

  clearHashes(): void {
    for (const set of this.shards.values()) {
      set.clear()
    }
  }

  reset(): void {
    this.shards.clear()
    this.states.clear()
  }
}
