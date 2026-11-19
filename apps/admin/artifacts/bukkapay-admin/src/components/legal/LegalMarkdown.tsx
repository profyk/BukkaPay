import type { ReactNode } from "react"

/** Renders the small Markdown subset used by legal documents:
 *  ## / ### headings, paragraphs (single newlines become line breaks),
 *  "- " and "1. " lists, "> " notes, **bold** and [links](url).
 *  No raw HTML is ever rendered — text goes through React, so admin-entered
 *  content cannot inject markup or scripts. Copy of apps/website/components/LegalMarkdown.tsx
 *  so the admin preview matches the website exactly - keep them in sync. */
export function LegalMarkdown({ source }: { source: string }) {
  return <>{blocks(source)}</>
}

type Block =
  | { kind: "h2" | "h3" | "p" | "quote"; text: string }
  | { kind: "ul" | "ol"; items: string[] }

function parse(source: string): Block[] {
  const out: Block[] = []
  let para: string[] = []
  let list: { kind: "ul" | "ol"; items: string[] } | null = null
  let quote: string[] = []
  const flush = () => {
    if (para.length) out.push({ kind: "p", text: para.join("\n") })
    if (list) out.push(list)
    if (quote.length) out.push({ kind: "quote", text: quote.join("\n") })
    para = []; list = null; quote = []
  }
  for (const raw of source.replace(/\r\n/g, "\n").split("\n")) {
    const line = raw.trimEnd()
    if (!line.trim()) { flush(); continue }
    let m: RegExpMatchArray | null
    if ((m = line.match(/^(#{2,3})\s+(.*)$/))) { flush(); out.push({ kind: m[1] === "##" ? "h2" : "h3", text: m[2] }); continue }
    if ((m = line.match(/^\s*[-*]\s+(.*)$/))) {
      if (!list || list.kind !== "ul") { flush(); list = { kind: "ul", items: [] } }
      list.items.push(m[1]); continue
    }
    if ((m = line.match(/^\s*\d+[.)]\s+(.*)$/))) {
      if (!list || list.kind !== "ol") { flush(); list = { kind: "ol", items: [] } }
      list.items.push(m[1]); continue
    }
    if ((m = line.match(/^>\s?(.*)$/))) {
      if (!quote.length) flush()
      quote.push(m[1]); continue
    }
    if (list) { list.items[list.items.length - 1] += " " + line.trim(); continue }
    if (quote.length) flush()
    para.push(line)
  }
  flush()
  return out
}

function blocks(source: string): ReactNode[] {
  return parse(source).map((b, i) => {
    switch (b.kind) {
      case "h2": return <h2 key={i} id={anchor(b.text)}>{inline(b.text)}</h2>
      case "h3": return <h3 key={i}>{inline(b.text)}</h3>
      case "p": return <p key={i}>{lines(b.text)}</p>
      case "quote": return <blockquote key={i}>{lines(b.text)}</blockquote>
      case "ul": return <ul key={i}>{b.items.map((t, j) => <li key={j}>{inline(t)}</li>)}</ul>
      case "ol": return <ol key={i}>{b.items.map((t, j) => <li key={j}>{inline(t)}</li>)}</ol>
    }
  })
}

function lines(text: string): ReactNode[] {
  return text.split("\n").flatMap((l, i) => (i ? [<br key={`br${i}`} />, ...inline(l, `l${i}`)] : inline(l, `l${i}`)))
}

const TOKEN = /(\*\*[^*]+\*\*|\[[^\]]+\]\([^)\s]+\))/g

function inline(text: string, prefix = ""): ReactNode[] {
  return text.split(TOKEN).filter(Boolean).map((part, i) => {
    const key = `${prefix}${i}`
    if (part.startsWith("**") && part.endsWith("**")) return <strong key={key}>{part.slice(2, -2)}</strong>
    const link = part.match(/^\[([^\]]+)\]\(([^)\s]+)\)$/)
    if (link) {
      const href = safeHref(link[2])
      if (!href) return link[1]
      const external = /^https?:/i.test(href)
      return <a key={key} href={href} {...(external ? { target: "_blank", rel: "noopener noreferrer" } : {})}>{link[1]}</a>
    }
    return part
  })
}

/** Only site-relative paths, https/http and mailto links are allowed. */
function safeHref(href: string): string | null {
  if (href.startsWith("/") && !href.startsWith("//")) return href
  if (/^(https?:|mailto:)/i.test(href)) return href
  return null
}

export function anchor(text: string): string {
  return text.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "")
}

/** Headings for an on-page table of contents. */
export function headings(source: string): { id: string; text: string }[] {
  return parse(source).filter((b): b is { kind: "h2"; text: string } => b.kind === "h2")
    .map((b) => ({ id: anchor(b.text), text: b.text.replace(/\*\*/g, "") }))
}
