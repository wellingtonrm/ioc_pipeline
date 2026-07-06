const timestamp = (): string =>
  new Date().toLocaleTimeString("pt-BR")

export const logger = {
  info: (message: string): void =>
    console.log(`[${timestamp()}] INFO  ${message}`),

  warn: (message: string): void =>
    console.warn(`[${timestamp()}] WARN  ${message}`),

  error: (message: string, err?: unknown): void => {
    console.error(`[${timestamp()}] ERROR ${message}`)
    if (err instanceof Error) {
      console.error(`[${timestamp()}] ERROR Stack: ${err.stack}`)
    }
  },

  divider: (): void =>
    console.log("─".repeat(60)),
}
