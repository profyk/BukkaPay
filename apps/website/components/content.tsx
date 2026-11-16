import type { ReactNode } from "react"
import { CtaBand, Feature, Grid, PageHero, Section } from "@/components/site"

export type Block =
  | { kind: "features"; eyebrow?: string; title: string; intro?: string; items: [string, string][]; cols?: 2 | 3 | 4 }
  | { kind: "steps"; eyebrow?: string; title: string; intro?: string; items: [string, string][] }
  | { kind: "note"; title: string; body: ReactNode }
  | { kind: "custom"; node: ReactNode }

export function ContentPage({ eyebrow, title, intro, actions, blocks, cta = true }: {
  eyebrow: string; title: string; intro: string; actions?: ReactNode; blocks: Block[]; cta?: boolean
}) {
  return (
    <>
      <PageHero eyebrow={eyebrow} title={title} intro={intro}>{actions}</PageHero>
      {blocks.map((b, i) => {
        const shade = i % 2 === 1 ? "bg-surface" : ""
        if (b.kind === "features") {
          return (
            <div key={i} className={shade}>
              <Section eyebrow={b.eyebrow} title={b.title} intro={b.intro}>
                <Grid cols={b.cols ?? 3}>{b.items.map(([t, d]) => <Feature key={t} title={t}>{d}</Feature>)}</Grid>
              </Section>
            </div>
          )
        }
        if (b.kind === "steps") {
          return (
            <div key={i} className={shade}>
              <Section eyebrow={b.eyebrow} title={b.title} intro={b.intro}>
                <ol className="grid gap-5 md:grid-cols-2">
                  {b.items.map(([t, d], n) => (
                    <li key={t} className="flex gap-4 rounded-2xl border border-line bg-white p-6">
                      <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-brand-600 font-semibold text-white">{n + 1}</span>
                      <div><p className="font-semibold">{t}</p><p className="mt-1 text-sm text-ink-soft">{d}</p></div>
                    </li>
                  ))}
                </ol>
              </Section>
            </div>
          )
        }
        if (b.kind === "note") {
          return (
            <div key={i} className={shade}>
              <Section>
                <div className="rounded-2xl border border-brand-200 bg-brand-50 p-6">
                  <p className="font-semibold text-brand-900">{b.title}</p>
                  <div className="mt-2 text-sm text-ink-soft">{b.body}</div>
                </div>
              </Section>
            </div>
          )
        }
        return <div key={i} className={shade}>{b.node}</div>
      })}
      {cta && <CtaBand />}
    </>
  )
}
