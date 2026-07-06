import { createHash } from "node:crypto"
import { parse as parseTld } from "tldts"

const PROTOCOL_RE = /^https?:\/\//i
const PORT_RE = /:\d+$/
const TRAILING_SLASH_RE = /\/+$/
const PATH_AND_QUERY_RE = /[/?#].*$/
const IPV4_RE = /^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}$/
const IPV4_STRICT_RE =
  /^(?:(?:25[0-5]|2[0-4]\d|[01]?\d\d?)\.){3}(?:25[0-5]|2[0-4]\d|[01]?\d\d?)$/
const IPV6_RE =
  /^([0-9a-f]{0,4}:){2,7}([0-9a-f]{0,4})(%[\w.]+)?$/i
const NUMERIC_PREFIX_RE = /^\d+-/
const PUNYCODE_RE = /xn--/i
const UNICODE_RE = /[^\x00-\x7F]/

export function cleanIOC(raw: string): string {
  let d = raw.trim()
  d = d.replace(/^\[/, "")
  d = d.replace(/\]$/, "")
  d = d.replace(/^['"]/, "")
  d = d.replace(/['"],?$/, "")
  d = d.replace(/,$/, "")
  d = d.replace(/^@@/, "")
  d = d.replace(/^\|\|/, "")
  d = d.replace(/^\|/, "")
  d = d.replace(/\|$/, "")
  d = d.replace(/^\+/, "")
  d = d.replace(/[^a-z0-9.-].*$/, "")
  d = d.trim()
  return d
}

export function normalizeIOC(raw: string): string | null {
  let d = cleanIOC(raw).toLowerCase()

  if (!d || d.startsWith("#") || d.startsWith("!")) {
    return null
  }

  d = d.replace(PROTOCOL_RE, "")
  d = d.replace(PATH_AND_QUERY_RE, "")
  d = d.replace(PORT_RE, "")
  d = d.replace(TRAILING_SLASH_RE, "")

  d = d.trim()

  if (!d || d.length < 1) {
    return null
  }

  return d
}

export function detectIOCType(value: string): "domain" | "hostname" | "url" | "ipv4" | "ipv6" {
  if (IPV4_STRICT_RE.test(value)) return "ipv4"
  if (IPV6_RE.test(value)) return "ipv6"
  if (value.startsWith("http://") || value.startsWith("https://")) return "url"
  if (value.includes("/") || value.includes("?") || value.includes("#")) return "url"

  const labels = value.split(".")
  if (labels.length >= 3) return "hostname"
  return "domain"
}

export function computeShannonEntropy(s: string): number {
  const len = s.length
  if (len === 0) return 0

  const freq: Record<string, number> = {}
  for (const ch of s) {
    freq[ch] = (freq[ch] || 0) + 1
  }

  let entropy = 0
  for (const count of Object.values(freq)) {
    const p = count / len
    entropy -= p * Math.log2(p)
  }

  return Math.round(entropy * 100) / 100
}

export function hasNumericPrefix(s: string): boolean {
  return NUMERIC_PREFIX_RE.test(s)
}

export function hasHyphen(s: string): boolean {
  return s.includes("-")
}

export function hasPunycode(s: string): boolean {
  return PUNYCODE_RE.test(s)
}

export function hasUnicode(s: string): boolean {
  return UNICODE_RE.test(s)
}

export function containsIPAddress(s: string): boolean {
  return IPV4_STRICT_RE.test(s) || IPV6_RE.test(s)
}

export function extractLabels(s: string): string[] {
  return s.split(".")
}

export function computeSHA256(s: string): string {
  return createHash("sha256").update(s, "utf-8").digest("hex")
}

export function parseDomain(s: string): {
  registrableDomain: string | null
  subdomain: string | null
  tld: string | null
} {
  if (IPV4_STRICT_RE.test(s) || IPV6_RE.test(s)) {
    return { registrableDomain: null, subdomain: null, tld: null }
  }

  const result = parseTld(s)
  return {
    registrableDomain: result.domain ?? null,
    subdomain: result.subdomain ?? null,
    tld: result.publicSuffix ?? null,
  }
}
