export type IOCType = "domain" | "hostname" | "url" | "ipv4" | "ipv6"

export type Category =
  | "malware"
  | "phishing"
  | "ads"
  | "tracker"
  | "spyware"
  | "adware"
  | "botnet"
  | "c2"
  | "ransomware"
  | "cryptominer"
  | "stealer"
  | "scam"
  | "spam"
  | "exploit"
  | "proxy"
  | "vpn"
  | "tor"
  | "malvertising"
  | "fraud"
  | "gambling"
  | "adult"
  | "fake_update"
  | "fake_download"
  | "unwanted"
  | "benign"
  | "unknown"

export const CATEGORIES: Category[] = [
  "malware", "phishing", "ads", "tracker", "spyware", "adware",
  "botnet", "c2", "ransomware", "cryptominer", "stealer", "scam",
  "spam", "exploit", "proxy", "vpn", "tor", "malvertising",
  "fraud", "gambling", "adult", "fake_update", "fake_download",
  "unwanted", "benign", "unknown",
]

export type Severity = "critical" | "high" | "medium" | "low" | "informational"

export interface Classification {
  category: Category
  family: string | null
  severity: Severity
  confidence: number
  tags: string[]
}

export interface EnrichedIOC {
  ioc: string
  iocType: string
  normalized: string
  registrableDomain: string | null
  subdomain: string | null
  tld: string | null
  labels: string[]
  labelCount: number
  depth: number
  hasNumericPrefix: boolean
  hasHyphen: boolean
  hasPunycode: boolean
  hasUnicode: boolean
  containsIPAddress: boolean
  entropy: number
  keywords: string[]
  classification: Classification | null
  source: string
  malicious: boolean
  confidence: number
  threatProfile: string | null
  firstSeen: Date
  lastSeen: Date
  sha256: string
}

export type ThreatPayload = EnrichedIOC

export interface IngestResult {
  listId: string
  listName: string
  total: number
  inserted: number
  ignored: number
  errors: string[]
}
