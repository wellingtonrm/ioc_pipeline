import { Parser } from "./parser.interface.js"

export class CsvParser implements Parser {
  private columnIndex: number

  constructor(columnIndex = 0) {
    this.columnIndex = columnIndex
  }

  parse(content: string): string[] {
    const lines = content.split("\n")
    const result: string[] = []

    for (let i = 0; i < lines.length; i++) {
      const trimmed = lines[i].trim()
      if (!trimmed || trimmed.startsWith("#") || trimmed.startsWith("!")) {
        continue
      }
      const columns = trimmed.split(",")
      const value = columns[this.columnIndex]?.trim()
      if (value) {
        result.push(value)
      }
    }

    return result
  }
}
