import { readFileSync } from "node:fs"
import { resolve, dirname } from "node:path"
import { fileURLToPath } from "node:url"
import {
  cleanIOC,
  normalizeIOC,
  detectIOCType,
  computeShannonEntropy,
  hasNumericPrefix,
  hasHyphen,
  hasPunycode,
  hasUnicode,
  containsIPAddress,
  extractLabels,
  computeSHA256,
  parseDomain,
} from "../utils/domain.js"
import { EnrichedIOC } from "../types/threat.js"
import { classify } from "../classifier/classifier.js"

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

let _keywords: Set<string> | null = null

function loadKeywords(): Set<string> {
  if (_keywords) return _keywords
  const path = resolve(__dirname, "..", "config", "keywords.json")
  const raw = readFileSync(path, "utf-8")
  const list: string[] = JSON.parse(raw)
  _keywords = new Set(list.map((k) => k.toLowerCase()))
  return _keywords
}

function matchKeywords(value: string): string[] {
  const keywords = loadKeywords()
  const found: string[] = []
  const lower = value.toLowerCase()

  for (const kw of keywords) {
    if (lower.includes(kw)) {
      found.push(kw)
    }
  }

  return found
}

export function enrich(raw: string, source: string, sourceType?: string): EnrichedIOC | null {
  const normalized = normalizeIOC(raw)
  if (!normalized) return null

  const techType = detectIOCType(normalized)
  const labels = extractLabels(normalized)
  const labelCount = labels.length
  const depth = labelCount

  let registrableDomain: string | null = null
  let subdomain: string | null = null
  let tld: string | null = null

  if (techType === "domain" || techType === "hostname") {
    const parsed = parseDomain(normalized)
    registrableDomain = parsed.registrableDomain
    subdomain = parsed.subdomain
    tld = parsed.tld
  }

  const entropy = computeShannonEntropy(normalized)
  const sha256 = computeSHA256(normalized)
  const matchedKeywords = matchKeywords(normalized)
  const classification = classify(normalized, matchedKeywords, source, sourceType as any)
  const now = new Date()

  return {
    ioc: cleanIOC(raw),
    iocType: sourceType || techType,
    normalized,
    registrableDomain: registrableDomain || null,
    subdomain: subdomain || null,
    tld: tld || null,
    labels,
    labelCount,
    depth,
    hasNumericPrefix: hasNumericPrefix(normalized),
    hasHyphen: hasHyphen(normalized),
    hasPunycode: hasPunycode(normalized),
    hasUnicode: hasUnicode(normalized),
    containsIPAddress: containsIPAddress(normalized),
    entropy,
    keywords: matchedKeywords,
    classification,
    source,
    malicious: true,
    confidence: 100,
    threatProfile: null,
    firstSeen: now,
    lastSeen: now,
    sha256,
  }
}

export function enrichBatch(rawItems: string[], source: string, sourceType?: string): EnrichedIOC[] {
  const results: EnrichedIOC[] = []
  for (const raw of rawItems) {
    const enriched = enrich(raw, source, sourceType)
    if (enriched) {
      results.push(enriched)
    }
  }
  return results
}
