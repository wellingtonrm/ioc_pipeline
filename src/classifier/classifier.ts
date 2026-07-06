import { Classification, Category, Severity } from "../types/threat.js"

interface Rule {
  keywords: string[]
  category: Category
  tags: string[]
  severity: Severity
  family?: string
  confidence?: number
}

const RULES: Rule[] = [
  {
    keywords: ["phishing", "login", "signin", "sign-in", "account", "password", "verify",
               "authentication", "2fa", "mfa", "secure", "bank", "paypal", "chase",
               "wellsfargo", "hsbc", "bradesco", "itau", "santander", "nubank",
               "credential", "recover", "reset-password", "forgot-password"],
    category: "phishing",
    tags: ["credential-theft"],
    severity: "high",
  },
  {
    keywords: ["wallet", "metamask", "trustwallet", "phantom", "rainbow", "coinbase",
               "blockchain", "ethereum", "solana", "bnb", "arbitrum", "polygon",
               "avalanche", "seed", "seedphrase", "private-key", "keystore",
               "ledger", "trezor", "debank", "zapper", "revoke", "approve",
               "swap", "bridge", "stake", "claim", "airdrop"],
    category: "phishing",
    tags: ["crypto", "wallet-drainer"],
    severity: "critical",
  },
  {
    keywords: ["analytics", "tracker", "pixel", "telemetry", "metrics", "gtag",
               "google-analytics", "googleadservices", "googlesyndication",
               "facebook-tracking", "fbcdn", "adsystem", "adserver",
               "doubleclick", "scorecardresearch", "quantserve"],
    category: "tracker",
    tags: ["analytics", "telemetry"],
    severity: "low",
  },
  {
    keywords: ["adserver", "advertising", "adservice", "ad-tech", "adnxs",
               "openx", "rubicon", "criteo", "taboola", "outbrain",
               "revcontent", "popads", "propellerads", "exoclick",
               "trafficjunky", "adsterra", "adcash"],
    category: "ads",
    tags: ["advertising"],
    severity: "low",
  },
  {
    keywords: ["c2", "command", "control", "panel", "gate", "redirect",
               "payload", "shell", "backconnect", "reverse-shell",
               "bind-shell", "meterpreter", "empire", "cobaltstrike",
               "beacon", "agent", "implant"],
    category: "c2",
    tags: ["command-and-control", "payload"],
    severity: "critical",
  },
  {
    keywords: ["bot", "botnet", "ddos", "flood", "attack", "stresser",
               "booter", "amplification", "reflection", "ntp", "dns",
               "memcached", "ssdp"],
    category: "botnet",
    tags: ["ddos"],
    severity: "high",
  },
  {
    keywords: ["cryptominer", "miner", "coinhive", "monero", "xmr", "cryptonight",
               "coindrop", "mining-pool", "miningpool", "stratum",
               "cryptoloot", "minero", "webmine"],
    category: "cryptominer",
    tags: ["mining"],
    severity: "medium",
  },
  {
    keywords: ["exploit", "vulnerability", "cve-", "rce", "sqli", "xss", "lfi",
               "rfi", "shellcode", "0day", "zero-day", "exploit-kit",
               "rig", "magnitude", "angler", "nuclear", "sundown"],
    category: "exploit",
    tags: ["exploit-kit"],
    severity: "critical",
  },
  {
    keywords: ["ransom", "locky", "wannacry", "notpetya", "badrabbit",
               "cryptolocker", "cryptowall", "teslacrypt", "jigsaw",
               "gandcrab", "ryuk", "conti", "revil", "blackcat",
               "lockbit", "hive", "blackbasta", "clop", "darkside"],
    category: "ransomware",
    tags: ["ransom"],
    severity: "critical",
  },
  {
    keywords: ["stealer", "infostealer", "redline", "lumma", "vidar",
               "racoon", "stealc", "risepro", "mystic", "priv8",
               "azorult", "taurit", "formbook", "snakekeylogger"],
    category: "stealer",
    tags: ["infostealer"],
    severity: "high",
  },
  {
    keywords: ["trojan", "rat", "remote-access", "njrat", "quasar",
               "asyncrat", "darkgate", "agenttesla", "nanocore",
               "orcus", "xvpn", "remcos", "warzone"],
    category: "malware",
    tags: ["trojan", "rat"],
    severity: "high",
  },
  {
    keywords: ["scam", "fraud", "fake", "counterfeit", "counterfeiting",
               "pharmacy", "viagra", "cialis", "prescription", "pills",
               "casino", "gambling", "bet", "lottery", "prize", "winner",
               "inheritance", "investment", "forex", "binary-options"],
    category: "scam",
    tags: [],
    severity: "high",
  },
  {
    keywords: ["spam", "bulk", "mailer", "maillist", "newsletter",
               "marketing", "promo", "advertise"],
    category: "spam",
    tags: ["bulk-email"],
    severity: "low",
  },
  {
    keywords: ["proxy", "proxyserver", "proxylist", "socks", "http-proxy",
               "https-proxy", "elite-proxy", "anonymous-proxy"],
    category: "proxy",
    tags: ["proxy"],
    severity: "medium",
  },
  {
    keywords: ["vpn", "wireguard", "openvpn", "softether", "vpnserver",
               "pptp", "l2tp", "ikev2"],
    category: "vpn",
    tags: ["vpn"],
    severity: "medium",
  },
  {
    keywords: ["tor", "onion", "torproject", "tor-exit", "tor-relay",
               "tor-bridge", "darknet", "darkweb", "silkroad",
               "alphabay", "hydra", "dread"],
    category: "tor",
    tags: ["tor", "darknet"],
    severity: "medium",
  },
  {
    keywords: ["adult", "porn", "xxx", "sex", "erotic", "escort",
               "dating", "cam", "onlyfans"],
    category: "adult",
    tags: [],
    severity: "informational",
  },
  {
    keywords: ["gambling", "casino", "poker", "slot", "blackjack",
               "roulette", "baccarat", "craps", "bingo"],
    category: "gambling",
    tags: [],
    severity: "informational",
  },
  {
    keywords: ["update", "upgrade", "flash", "player", "plugin",
               "codec", "javafx", "silverlight"],
    category: "fake_update",
    tags: ["fake-update"],
    severity: "high",
  },
  {
    keywords: ["download", "setup", "installer", "setup.exe", "setup.msi",
               "crack", "keygen", "patch", "serial", "license-key"],
    category: "fake_download",
    tags: ["fake-download"],
    severity: "high",
  },
  {
    keywords: ["spyware", "keylogger", "monitor", "spy", "tracking-software",
               "parental-control", "screen-capture", "keystroke"],
    category: "spyware",
    tags: ["spyware"],
    severity: "high",
  },
  {
    keywords: ["adware", "ad-supported", "popup", "pop-up", "ad-injection",
               "browser-hijack", "toolbar"],
    category: "adware",
    tags: ["adware"],
    severity: "medium",
  },
  {
    keywords: ["malvertising", "malicious-ad", "drive-by", "malvertisement",
               "ad-malware"],
    category: "malvertising",
    tags: ["malvertising"],
    severity: "critical",
  },
  {
    keywords: ["fraud", "chargeback", "refund", "claim", "dispute",
               "identity-theft", "identity-fraud"],
    category: "fraud",
    tags: ["financial-fraud"],
    severity: "high",
  },
  {
    keywords: ["malware", "virus", "worm", "backdoor", "rootkit",
               "bootkit", "dropper", "downloader", "loader",
               "obfuscated", "packed", "crypted"],
    category: "malware",
    tags: ["malware"],
    severity: "high",
  },
  {
    keywords: ["unwanted", "pup", "pua", "potentially-unwanted",
               "bundleware", "bundled"],
    category: "unwanted",
    tags: ["pup"],
    severity: "low",
  },
]

export function classify(
  normalized: string,
  keywords: string[],
  source: string,
  sourceType?: Category,
): Classification {
  let category: Category = (sourceType as Category) || "malware"
  let severity: Severity = "high"
  let confidence = 85
  let family: string | null = null
  const tagSet = new Set<string>()

  const matchedFamilies = new Set<string>()

  for (const rule of RULES) {
    const matched = rule.keywords.some((kw) => {
      if (rule.category === "phishing" || rule.category === "scam") {
        return keywords.includes(kw) || normalized.includes(kw)
      }
      if (rule.category === "tracker" || rule.category === "ads") {
        return keywords.includes(kw) || normalized.includes(kw)
      }
      return keywords.includes(kw)
    })

    if (!matched) continue

    if (rule.severity === "critical") {
      severity = "critical"
    } else if (rule.severity === "high" && severity !== "critical") {
      severity = "high"
    } else if (severity !== "critical" && severity !== "high") {
      severity = rule.severity
    }

    if (rule.confidence && rule.confidence > confidence) {
      confidence = rule.confidence
    } else {
      confidence = Math.min(confidence + 5, 100)
    }

    for (const tag of rule.tags) {
      tagSet.add(tag)
    }

    category = rule.category

    if (rule.family) {
      matchedFamilies.add(rule.family)
    }
  }

  if (matchedFamilies.size === 1) {
    family = matchedFamilies.values().next().value!
  }

  for (const kw of keywords) {
    for (const rule of RULES) {
      if (rule.family && rule.keywords.includes(kw)) {
        matchedFamilies.add(rule.family)
      }
    }
  }

  if (matchedFamilies.size === 1) {
    family = matchedFamilies.values().next().value!
  }

  return {
    category,
    family,
    severity,
    confidence,
    tags: Array.from(tagSet),
  }
}
