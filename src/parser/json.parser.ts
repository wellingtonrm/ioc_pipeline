import { Parser } from "./parser.interface.js"

export class JsonParser implements Parser {
  private field: string

  constructor(field = "domain") {
    this.field = field
  }

  parse(content: string): string[] {
    try {
      const data = JSON.parse(content)
      const items = Array.isArray(data) ? data : [data]
      const result: string[] = []

      for (const item of items) {
        if (typeof item === "string") {
          result.push(item)
        } else if (item && typeof item[this.field] === "string") {
          result.push(item[this.field])
        }
      }

      return result
    } catch {
      return []
    }
  }
}
