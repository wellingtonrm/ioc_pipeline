import { ChunkManager } from "./orchestration/chunk.manager.js"
import { logger } from "./utils/logger.js"
import { config } from "dotenv"

config()

async function main(): Promise<void> {
  const manager = new ChunkManager()

  try {
    await manager.run()
    logger.info("Pipeline completed successfully through ChunkManager")
  } catch (err) {
    logger.error("Fatal pipeline error", err)
    process.exit(1)
  }
}

main()
