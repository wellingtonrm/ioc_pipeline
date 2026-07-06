import { Parser } from "./parser.interface.js"
import { TxtParser } from "./txt.parser.js"
import { AdblockParser } from "./adblock.parser.js"
import { CsvParser } from "./csv.parser.js"
import { JsonParser } from "./json.parser.js"
import { HostsParser } from "./hosts.parser.js"
import { logger } from "../utils/logger.js"

const parsers: Record<string, () => Parser> = {
  "plain-domain": () => new TxtParser(),
  "adblock": () => new AdblockParser(),
  "txt": () => new TxtParser(),
  "csv": () => new CsvParser(),
  "json": () => new JsonParser(),
  "hosts": () => new HostsParser(),
}

export function getParser(name: string): Parser {
  const factory = parsers[name]
  if (!factory) {
    logger.warn(`Parser "${name}" not found, falling back to TXT`)
    return new TxtParser()
  }
  return factory()
}

export function registerParser(name: string, factory: () => Parser): void {
  parsers[name] = factory
}
