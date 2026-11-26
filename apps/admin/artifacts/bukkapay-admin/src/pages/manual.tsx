import { useMemo, useState } from "react"
import { Input } from "@/components/ui/input"
import { Page } from "@/components/network/kit"
import manual from "@/content/owner-manual.md?raw"

type Block = { kind: "h1" | "h2" | "h3" | "p" | "ul" | "ol" | "table"; lines: string[] }

function parse(md: string): Block[] {
  const out: Block[] = []
  const lines = md.replace(/\r\n/g, "\n").split("\n")
  for (let i = 0; i < lines.length; i++) {
    const l = lines[i]
    if (!l.trim()) continue
    const h = /^(#{1,3}) (.*)$/.exec(l)
    if (h) { out.push({ kind: (`h${h[1].length}`) as Block["kind"], lines: [h[2]] }); continue }
    const group = (test: (s: string) => boolean, kind: Block["kind"], strip: (s: string) => string) => {
      const acc: string[] = []
      while (i < lines.length && test(lines[i])) acc.push(strip(lines[i++]))
      i--; out.push({ kind, lines: acc })
    }
    if (l.startsWith("|")) group((s) => s.startsWith("|"), "table", (s) => s)
    else if (/^- /.test(l)) group((s) => /^- /.test(s), "ul", (s) => s.slice(2))
    else if (/^\d+\. /.test(l)) group((s) => /^\d+\. /.test(s), "ol", (s) => s.replace(/^\d+\. /, ""))
    else group((s) => !!s.trim() && !/^(#|- |\d+\. |\|)/.test(s), "p", (s) => s)
  }
  return out
}

/** **bold** and `code` only — the manual is plain prose. */
function Inline({ text }: { text: string }) {
  const parts = text.split(/(\*\*[^*]+\*\*|`[^`]+`)/g)
  return <>{parts.map((p, i) => p.startsWith("**") ? <strong key={i}>{p.slice(2, -2)}</strong>
    : p.startsWith("`") ? <code key={i} className="px-1 rounded bg-muted text-[0.9em]">{p.slice(1, -1)}</code> : p)}</>
}

const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, "-")

export default function ManualPage() {
  const blocks = useMemo(() => parse(manual), [])
  const [q, setQ] = useState("")
  const sections = blocks.filter((b) => b.kind === "h2")
  // Search: show only sections containing the text.
  const visible = useMemo(() => {
    if (!q.trim()) return blocks
    const res: Block[] = []; let cur: Block[] = []; let hit = false
    const flush = () => { if (hit) res.push(...cur); cur = []; hit = false }
    for (const b of blocks) {
      if (b.kind === "h2") flush()
      cur.push(b)
      if (b.lines.join(" ").toLowerCase().includes(q.toLowerCase())) hit = true
    }
    flush(); return res
  }, [blocks, q])

  return (
    <Page title="Owner's Manual" subtitle="How BukkaPay works, what to check and when, and how to fix things.">
      <div className="grid lg:grid-cols-[220px_1fr] gap-6 items-start">
        <nav className="lg:sticky lg:top-4 space-y-1 text-sm">
          <Input placeholder="Search the manual" value={q} onChange={(e) => setQ(e.target.value)} className="mb-2" />
          {sections.map((s) => <a key={s.lines[0]} href={`#${slug(s.lines[0])}`} className="block px-2 py-1 rounded hover:bg-muted text-muted-foreground hover:text-foreground">{s.lines[0]}</a>)}
        </nav>
        <article className="bg-card border border-border rounded-2xl p-6 space-y-3 max-w-3xl leading-relaxed">
          {visible.length === 0 && <p className="text-muted-foreground">Nothing in the manual matches "{q}".</p>}
          {visible.map((b, i) => {
            if (b.kind === "h1") return null
            if (b.kind === "h2") return <h2 key={i} id={slug(b.lines[0])} className="text-xl font-semibold pt-4 scroll-mt-4">{b.lines[0]}</h2>
            if (b.kind === "h3") return <h3 key={i} className="text-base font-semibold pt-2">{b.lines[0]}</h3>
            if (b.kind === "p") return <p key={i}><Inline text={b.lines.join(" ")} /></p>
            if (b.kind === "ul") return <ul key={i} className="list-disc pl-5 space-y-1">{b.lines.map((l, j) => <li key={j}><Inline text={l} /></li>)}</ul>
            if (b.kind === "ol") return <ol key={i} className="list-decimal pl-5 space-y-1">{b.lines.map((l, j) => <li key={j}><Inline text={l} /></li>)}</ol>
            const rows = b.lines.filter((l) => !/^\|[\s|:-]+\|$/.test(l)).map((l) => l.slice(1, -1).split("|").map((c) => c.trim()))
            const [head, ...body] = rows
            return (
              <div key={i} className="overflow-x-auto">
                <table className="w-full text-sm border-collapse">
                  <thead><tr>{head.map((c, j) => <th key={j} className="text-left font-semibold border-b border-border py-2 pr-3">{c}</th>)}</tr></thead>
                  <tbody>{body.map((r, j) => <tr key={j} className="border-b border-border/60 align-top">{r.map((c, k) => <td key={k} className="py-2 pr-3"><Inline text={c} /></td>)}</tr>)}</tbody>
                </table>
              </div>
            )
          })}
        </article>
      </div>
    </Page>
  )
}
