import { readFileSync, writeFileSync } from "node:fs"
import { resolve, dirname, join } from "node:path"
import { fileURLToPath } from "node:url"
import { CheckpointManager, PipelineStage, CheckpointData } from "./checkpoint.manager.js"
import { ChunkBuilder, Chunk } from "./chunk.builder.js"
import { IOCPipeline } from "../services/ioc-pipeline.js"
import { logger } from "../utils/logger.js"
import { PipelineConfig, StageFile } from "../types/pipeline.js"
import { Publisher } from "../publisher/uploader.js"
import { buildMetadata } from "../publisher/metadata.js"

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

function formatTime(ms: number): string {
  const totalSeconds = Math.floor(ms / 1000)
  const minutes = Math.floor(totalSeconds / 60)
  const seconds = totalSeconds % 60
  return `${minutes.toString().padStart(2, '0')}m ${seconds.toString().padStart(2, '0')}s`
}

export class ChunkManager {
  private config: PipelineConfig
  private checkpointManager: CheckpointManager
  private chunkBuilder: ChunkBuilder

  constructor() {
    const configPath = resolve(__dirname, "..", "config", "pipeline.json")
    this.config = JSON.parse(readFileSync(configPath, "utf-8"))
    
    if (process.env.EDGE_FUNCTION_UPLOAD_URL) {
      this.config.publisher.endpoint = process.env.EDGE_FUNCTION_UPLOAD_URL
    }
    
    const outputDir = resolve(__dirname, "..", "..", this.config.outputDir)
    this.checkpointManager = new CheckpointManager(outputDir)
    this.chunkBuilder = new ChunkBuilder()
  }

  async run(): Promise<void> {
    const runId = `release-v${this.config.version}`
    const outputDir = resolve(__dirname, "..", "..", this.config.outputDir)
    let checkpoint = await this.checkpointManager.loadCheckpoint()

    const totalChunksConfig = 4 // As requested in the prompt
    const chunks = this.chunkBuilder.loadAndBuild(totalChunksConfig)

    if (checkpoint && checkpoint.status === "RUNNING") {
      console.log(`\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`)
      console.log(`🔄 RETOMANDO PIPELINE`)
      console.log(`📍 Retomando do Chunk: ${checkpoint.currentChunk} / Stage: ${checkpoint.currentStage}`)
      console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n`)
    } else {
      checkpoint = await this.checkpointManager.createCheckpoint(
        runId,
        this.config.version,
        totalChunksConfig
      )
    }

    const allStageFiles: StageFile[] = []
    let totalSourcesProcessed = 0

    try {
      // Carregar os stageFiles dos chunks que já foram completamente concluídos antes
      for (let i = 1; i < checkpoint.currentChunk; i++) {
        const statePath = join(outputDir, `chunk-${i}-state.json`)
        try {
          const stateData = JSON.parse(readFileSync(statePath, "utf-8"))
          allStageFiles.push(...stateData.stageFiles)
          totalSourcesProcessed += stateData.sourcesLength || 0
        } catch {
          logger.warn(`[MANAGER] Não foi possível carregar o estado do chunk ${i}`)
        }
      }

      for (const chunk of chunks) {
        if (chunk.id < checkpoint.currentChunk) {
          continue
        }
        
        const statePath = join(outputDir, `chunk-${chunk.id}-state.json`)
        let result: { stageFiles: StageFile[], totalDomains: number, perCategory: Record<string, number>, duration: number } | null = null

        const resumingUpload = checkpoint.currentChunk === chunk.id && checkpoint.currentStage === PipelineStage.UPLOAD

        if (resumingUpload) {
          console.log(`\n🟦 ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`)
          console.log(`🚀 RETOMANDO CHUNK ${chunk.id.toString().padStart(2, '0')} DIRETO NO UPLOAD`)
          console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n`)
          try {
            const stateData = JSON.parse(readFileSync(statePath, "utf-8"))
            result = stateData.result
            totalSourcesProcessed += chunk.sources.length
          } catch (err) {
            console.log(`⚠️ Estado do chunk não encontrado, reiniciando chunk ${chunk.id}`)
            await this.checkpointManager.updateStage(checkpoint, PipelineStage.INITIALIZING)
          }
        } else {
          await this.checkpointManager.updateStage(checkpoint, PipelineStage.INITIALIZING)
          console.log(`\n🟦 ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`)
          console.log(`🚀 INICIANDO CHUNK ${chunk.id.toString().padStart(2, '0')}/${totalChunksConfig.toString().padStart(2, '0')}`)
          console.log(`📦 Fontes: ${chunk.sources.length}`)
          console.log(`🆔 Run: ${runId}`)
          console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n`)
        }

        const chunkStart = Date.now()
        
        if (!result) {
          const processor = new IOCPipeline(chunk.id)
          
          await this.checkpointManager.updateStage(checkpoint, PipelineStage.DOWNLOAD)
          result = await processor.run(chunk.sources)
          
          totalSourcesProcessed += chunk.sources.length

          // Salva o estado para caso falhe no UPLOAD e para o Metadata final
          writeFileSync(statePath, JSON.stringify({ result, stageFiles: result.stageFiles, sourcesLength: chunk.sources.length }), "utf-8")
        }

        await this.checkpointManager.updateStage(checkpoint, PipelineStage.UPLOAD)

        // Upload chunk files immediately
        const publisher = new Publisher(this.config)
        
        const tempMetadata = await buildMetadata(
          this.config.version,
          result.stageFiles,
          result.totalDomains,
          outputDir
        )

        const report = await publisher.publishChunkFiles(
          result.stageFiles,
          tempMetadata,
          chunk.id,
          checkpoint,
          this.checkpointManager,
        )
        
        if (!report.success) {
          const failed = report.files.filter(f => !f.success).map(f => f.category)
          throw new Error(`Falha no upload dos arquivos: ${failed.join(', ')}`)
        }

        // Integrity check: confirm all expected files are tracked
        const expectedFiles = result.stageFiles.length
        const uploadedInDB = Object.keys(checkpoint.uploadedFiles || {}).filter(k => k.startsWith(`chunk-${chunk.id}:`)).length
        console.log(`📊 Integridade Chunk ${chunk.id.toString().padStart(2,'0')}: ${uploadedInDB}/${expectedFiles} arquivos registrados no banco`)
        if (uploadedInDB !== expectedFiles) {
          logger.warn(`[INTEGRITY] Chunk ${chunk.id}: esperado ${expectedFiles} arquivos, registrados ${uploadedInDB}`)
        }
        
        await this.checkpointManager.updateStage(checkpoint, PipelineStage.CHECKPOINT)
        await this.checkpointManager.markChunkCompleted(checkpoint, chunk.id)
        
        await this.checkpointManager.updateStage(checkpoint, PipelineStage.CLEANUP)
        // Limpeza
        if (global.gc) {
          global.gc()
        }

        const chunkDuration = Date.now() - chunkStart
        console.log(`\n🟩 ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`)
        console.log(`✅ CHUNK ${chunk.id.toString().padStart(2, '0')} CONCLUÍDO`)
        console.log(`📥 Processados: ${result.totalDomains.toLocaleString("pt-BR")} IOCs`)
        console.log(`📤 Upload: OK`)
        console.log(`⏱ Tempo: ${formatTime(chunkDuration)}`)
        console.log(`💾 Memória liberada`)
        console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n`)

        if (chunk.id < totalChunksConfig) {
          await this.checkpointManager.setNextChunk(checkpoint, chunk.id + 1)
        }
        
        allStageFiles.push(...result.stageFiles)
      }

      await this.checkpointManager.updateStage(checkpoint, PipelineStage.COMPLETED)
      
      // Metadata Final
      console.log(`\n📦 Gerando e publicando Metadata Final...`)
      
      const publisher = new Publisher(this.config)
      const baseUrl = `${this.config.publisher.endpoint}/ioc/v${this.config.version}`
      
      const totalDomains = allStageFiles.reduce((acc, f) => acc + f.domainCount, 0)
      const perCategory: Record<string, number> = {}
      for (const f of allStageFiles) {
        perCategory[f.category] = (perCategory[f.category] || 0) + f.domainCount
      }

      const finalMetadata = await buildMetadata(
        this.config.version,
        allStageFiles,
        totalDomains,
        outputDir
      )
      
      const manifest = {
        version: this.config.version,
        generatedAt: new Date().toISOString(),
        baseUrl: baseUrl,
        files: {},
        metadata: {
          totalDomains,
          perCategory,
          duration: 0,
          sourcesProcessed: totalSourcesProcessed
        }
      }
      
      const finalReport = await publisher.publishManifest(manifest as any, [], finalMetadata)
      if (!finalReport.success) {
        throw new Error("Falha ao publicar Metadata Final.")
      }

      await this.checkpointManager.completeCheckpoint(checkpoint)

      // Final integrity report
      const totalExpected = allStageFiles.length
      const totalRegistered = Object.keys(checkpoint.uploadedFiles || {}).length
      console.log(`\n📋 ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`)
      console.log(`📊 RELATÓRIO DE INTEGRIDADE FINAL`)
      console.log(`📁 Arquivos esperados : ${totalExpected}`)
      console.log(`✅ Registrados no banco: ${totalRegistered}`)
      if (totalRegistered === totalExpected) {
        console.log(`🟢 INTEGRIDADE OK — 1 arquivo = 1 row no banco`)
      } else {
        console.log(`🔴 DIVERGÊNCIA DETECTADA — ${totalExpected - totalRegistered} arquivo(s) faltando`)
      }
      console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`)
      console.log(`\n🎉 Pipeline Finalizado com Sucesso!\n`)

    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      
      console.log(`\n🟥 ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`)
      console.log(`❌ ERRO NO CHUNK ${checkpoint.currentChunk.toString().padStart(2, '0')}`)
      console.log(`📍 Stage: ${checkpoint.currentStage}`)
      console.log(`📝 Motivo: ${msg}`)
      console.log(`💾 Checkpoint salvo`)
      console.log(`🔁 Pipeline pode continuar depois`)
      console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n`)

      await this.checkpointManager.failCheckpoint(checkpoint, msg)
      process.exit(1)
    }
  }
}
