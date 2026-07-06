import { Parser } from "./parser.interface.js"

export class TxtParser implements Parser {
  parse(content: string): string[] {
    const lines = content.split("\n")
    const result: string[] = []

    for (const line of lines) {
      const trimmed = line.trim()
      if (!trimmed || trimmed.startsWith("#") || trimmed.startsWith("!")) {
        continue
      }
      result.push(trimmed)
    }

    return result
  }
}
