import { chromium, Browser, Page } from "playwright"
import { logger } from "../utils/logger.js"

export class CrawlerService {
  private browser: Browser | null = null

  async init(): Promise<void> {
    logger.info("Inicializando Playwright...")
    this.browser = await chromium.launch({ headless: true })
  }

  async fetch(url: string): Promise<string> {
    try {
      return await this.fetchWithPlaywright(url)
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      if (
        msg.includes("Download is starting") ||
        msg.includes("Page.captureSnapshot") ||
        msg.includes("Protocol error")
      ) {
        logger.warn(`[CRAWL] Playwright falhou para ${url}, tentando fetch direto...`)
        return await this.fetchDirect(url)
      }
      throw err
    }
  }

  private async fetchWithPlaywright(url: string): Promise<string> {
    if (!this.browser) {
      throw new Error("Crawler não inicializado. Chame init() primeiro.")
    }

    const context = await this.browser.newContext()
    const page: Page = await context.newPage()

    try {
      const response = await page.goto(url, {
        waitUntil: "domcontentloaded",
        timeout: 60000,
      })

      if (!response) {
        throw new Error("Nenhuma resposta recebida")
      }

      if (!response.ok()) {
        throw new Error(`HTTP ${response.status()} ${response.statusText()}`)
      }

      return await response.text()
    } finally {
      await context.close()
    }
  }

  private async fetchDirect(url: string): Promise<string> {
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 60000)

    try {
      const response = await fetch(url, {
        signal: controller.signal,
        redirect: "follow",
        headers: {
          "User-Agent":
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
          Accept: "text/plain, text/csv, application/json, text/*, */*",
        },
      })

      if (!response.ok) {
        throw new Error(`HTTP ${response.status} ${response.statusText}`)
      }

      return await response.text()
    } finally {
      clearTimeout(timeout)
    }
  }

  async close(): Promise<void> {
    if (this.browser) {
      await this.browser.close()
      this.browser = null
    }
  }
}
