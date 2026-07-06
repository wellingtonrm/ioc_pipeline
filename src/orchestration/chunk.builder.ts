import { Source } from "../types/source.js"
import { readFileSync } from "node:fs"
import { resolve, dirname } from "node:path"
import { fileURLToPath } from "node:url"

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

export interface Chunk {
  id: number
  sources: Source[]
}

export class ChunkBuilder {
  private sourcesFile: string

  constructor() {
    this.sourcesFile = resolve(__dirname, "..", "config", "sources.json")
  }

  loadAndBuild(totalChunks: number): Chunk[] {
    const data = readFileSync(this.sourcesFile, "utf-8")
    const allSources = JSON.parse(data) as Source[]
    
    // Filter enabled sources first
    const sources = allSources.filter((s) => s.enabled)
    
    // Validating
    if (sources.length === 0) {
      throw new Error("No enabled sources found.")
    }
    if (totalChunks <= 0) {
      throw new Error("Total chunks must be greater than 0.")
    }

    const chunks: Chunk[] = []
    const baseSize = Math.floor(sources.length / totalChunks)
    let remainder = sources.length % totalChunks

    let startIndex = 0

    for (let i = 1; i <= totalChunks; i++) {
      let size = baseSize
      
      // Last chunk takes all the rest
      if (i === totalChunks) {
        size += remainder
      }
      
      const chunkSources = sources.slice(startIndex, startIndex + size)
      chunks.push({
        id: i,
        sources: chunkSources,
      })
      
      startIndex += size
    }

    return chunks
  }
}
