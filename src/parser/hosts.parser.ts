import { Parser } from "./parser.interface.js"

const HOSTS_LINE_RE = /^\s*(?:0\.0\.0\.0|127\.0\.0\.1|::1)\s+(\S+)/i

export class HostsParser implements Parser {
  parse(content: string): string[] {
    const lines = content.split("\n")
    const result: string[] = []

    for (const line of lines) {
      const trimmed = line.trim()
      if (!trimmed || trimmed.startsWith("#") || trimmed.startsWith("!")) {
        continue
      }

      const match = HOSTS_LINE_RE.exec(trimmed)
      if (match) {
        result.push(match[1])
      }
    }

    return result
  }
}
