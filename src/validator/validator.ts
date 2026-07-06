import { parse as parseTld } from "tldts"

const MAX_DOMAIN_LENGTH = 253
const MAX_LABEL_LENGTH = 63
const VALID_DOMAIN_RE = /^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)*$/i
const IPV4_RE = /^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}$/
const IPV6_RE = /^([0-9a-f]{0,4}:){2,7}([0-9a-f]{0,4})(%[\w.]+)?$/i
const HTML_TAG_RE = /^<\/?[\w\s="':.-]+>$/i
const TRAILING_ADBLOCK_RE = /[\^]$/

export interface ValidationResult {
  valid: boolean
  error?: string
}

function isHTMLContent(value: string): boolean {
  const lower = value.toLowerCase().trim()
  return HTML_TAG_RE.test(lower) ||
    lower.startsWith("<!doctype") ||
    lower.startsWith("<html") ||
    lower.startsWith("<head") ||
    lower.startsWith("<body") ||
    lower.startsWith("<script") ||
    lower.startsWith("<style") ||
    lower.startsWith("<meta") ||
    lower.startsWith("<link") ||
    lower.startsWith("<title") ||
    lower.startsWith("<div") ||
    lower.startsWith("<span") ||
    lower.startsWith("<a ") ||
    lower.startsWith("<input") ||
    lower.startsWith("<form")
}

function precleanDomain(value: string): string {
  let d = value.trim()
  d = d.replace(/^\|\|/, "")
  d = d.replace(/\^\$/, "")
  if (TRAILING_ADBLOCK_RE.test(d)) {
    d = d.slice(0, -1)
  }
  return d
}

export function validateIOCValue(raw: string): ValidationResult {
  if (!raw || !raw.trim()) {
    return { valid: false, error: "empty value" }
  }

  if (isHTMLContent(raw)) {
    return { valid: false, error: `html content detected in "${raw.slice(0, 50)}"` }
  }

  let d = precleanDomain(raw)

  if (d.length < 3) {
    return { valid: false, error: `too short: "${d}" (min 3 chars)` }
  }

  if (d.length > MAX_DOMAIN_LENGTH) {
    return { valid: false, error: `too long: ${d.length} chars (max ${MAX_DOMAIN_LENGTH})` }
  }

  if (IPV4_RE.test(d) || IPV6_RE.test(d)) {
    return { valid: true }
  }

  if (!VALID_DOMAIN_RE.test(d)) {
    return { valid: false, error: `invalid characters in "${d}"` }
  }

  const labels = d.split(".")
  for (const label of labels) {
    if (label.length > MAX_LABEL_LENGTH) {
      return { valid: false, error: `label exceeds ${MAX_LABEL_LENGTH} chars in "${d}"` }
    }
    if (label.startsWith("-") || label.endsWith("-")) {
      return { valid: false, error: `label starts/ends with hyphen in "${d}"` }
    }
  }

  if (labels.length < 2) {
    return { valid: false, error: `not a fully qualified domain: "${d}"` }
  }

  const tld = labels[labels.length - 1]
  if (tld.length < 2) {
    return { valid: false, error: `invalid TLD in "${d}"` }
  }

  const parsed = parseTld(d)
  if (!parsed.domain) {
    return { valid: false, error: `unrecognizable domain: "${d}"` }
  }

  return { valid: true }
}
