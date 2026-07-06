import { Parser } from "./parser.interface.js"

const COMMENT_OR_HEADER_RE = /^[!#[\[]/
const WHITELIST_RE = /^@@/
const DOMAIN_MARKER_RE = /^\|\|/
const EXACT_MATCH_RE = /^\|/
const OPTIONS_RE = /[^a-z0-9.-].*$/
const TRAILING_PIPE_RE = /\|$/
const REGEX_RE = /^\/.*\/$/

export class AdblockParser implements Parser {
  parse(content: string): string[] {
    const lines = content.split("\n")
    const result: string[] = []

    for (const line of lines) {
      const trimmed = line.trim()

      if (!trimmed || COMMENT_OR_HEADER_RE.test(trimmed)) {
        continue
      }

      if (REGEX_RE.test(trimmed)) {
        continue
      }

      let domain = trimmed

      domain = domain.replace(WHITELIST_RE, "")
      domain = domain.replace(DOMAIN_MARKER_RE, "")
      domain = domain.replace(EXACT_MATCH_RE, "")
      domain = domain.replace(TRAILING_PIPE_RE, "")
      domain = domain.replace(OPTIONS_RE, "")

      domain = domain.trim()

      if (!domain || domain.length < 2) {
        continue
      }

      result.push(domain)
    }

    return result
  }
}
