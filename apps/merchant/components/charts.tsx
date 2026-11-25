"use client"

/** Small dependency-free SVG charts (validated reference palette: slot 1
 *  blue; recessive grid; 2px lines; 4px rounded bar ends; hover tooltips). */
import { useState } from "react"

export const SERIES = "#2a78d6"
const GRID = "#e1e0d9"
const AXIS = "#898781"

type Point = { label: string; value: number; tip?: string }

export function BarChart({ data, height = 180, format = (v: number) => String(v), every = 1 }: {
  data: Point[]; height?: number; format?: (v: number) => string; every?: number
}) {
  const [hover, setHover] = useState<number | null>(null)
  const w = 640, pad = { l: 44, r: 8, t: 10, b: 24 }
  const max = Math.max(1, ...data.map((d) => d.value))
  const ih = height - pad.t - pad.b, iw = w - pad.l - pad.r
  const step = iw / Math.max(1, data.length), bw = Math.max(2, Math.min(18, step - 2))
  const ticks = [0, max / 2, max]
  return (
    <div className="relative">
      <svg viewBox={`0 0 ${w} ${height}`} className="w-full h-auto" role="img" onMouseLeave={() => setHover(null)}>
        {ticks.map((t) => {
          const y = pad.t + ih - (t / max) * ih
          return <g key={t}><line x1={pad.l} x2={w - pad.r} y1={y} y2={y} stroke={GRID} strokeWidth={1} />
            <text x={pad.l - 6} y={y + 4} textAnchor="end" fontSize={10} fill={AXIS}>{format(t)}</text></g>
        })}
        {data.map((d, i) => {
          const h = (d.value / max) * ih, x = pad.l + i * step + (step - bw) / 2, y = pad.t + ih - h
          return (
            <g key={i} onMouseEnter={() => setHover(i)}>
              <rect x={pad.l + i * step} y={pad.t} width={step} height={ih} fill="transparent" />
              {h > 0 && <path d={roundedTop(x, y, bw, h, Math.min(4, bw / 2))} fill={SERIES} opacity={hover === null || hover === i ? 1 : 0.55} />}
              {i % every === 0 && <text x={x + bw / 2} y={height - 6} textAnchor="middle" fontSize={10} fill={AXIS}>{d.label}</text>}
            </g>
          )
        })}
      </svg>
      {hover !== null && data[hover] && (
        <div className="pointer-events-none absolute top-0 rounded-lg bg-ink px-2 py-1 text-xs text-white shadow"
             style={{ left: `${((pad.l + hover * step + step / 2) / w) * 100}%`, transform: "translateX(-50%)" }}>
          {data[hover].tip ?? `${data[hover].label}: ${format(data[hover].value)}`}
        </div>
      )}
    </div>
  )
}

export function AreaChart({ data, height = 200, format = (v: number) => String(v), every = 5 }: {
  data: Point[]; height?: number; format?: (v: number) => string; every?: number
}) {
  const [hover, setHover] = useState<number | null>(null)
  const w = 640, pad = { l: 52, r: 8, t: 10, b: 24 }
  const max = Math.max(1, ...data.map((d) => d.value))
  const ih = height - pad.t - pad.b, iw = w - pad.l - pad.r
  const x = (i: number) => pad.l + (data.length <= 1 ? iw / 2 : (i / (data.length - 1)) * iw)
  const y = (v: number) => pad.t + ih - (v / max) * ih
  const line = data.map((d, i) => `${i ? "L" : "M"}${x(i)},${y(d.value)}`).join(" ")
  const area = `${line} L${x(data.length - 1)},${pad.t + ih} L${x(0)},${pad.t + ih} Z`
  return (
    <div className="relative">
      <svg viewBox={`0 0 ${w} ${height}`} className="w-full h-auto" role="img"
           onMouseMove={(e) => {
             const r = (e.currentTarget as SVGSVGElement).getBoundingClientRect()
             const px = ((e.clientX - r.left) / r.width) * w
             setHover(Math.max(0, Math.min(data.length - 1, Math.round(((px - pad.l) / iw) * (data.length - 1)))))
           }}
           onMouseLeave={() => setHover(null)}>
        <defs><linearGradient id="area" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor={SERIES} stopOpacity={0.22} /><stop offset="100%" stopColor={SERIES} stopOpacity={0} /></linearGradient></defs>
        {[0, max / 2, max].map((t) => (
          <g key={t}><line x1={pad.l} x2={w - pad.r} y1={y(t)} y2={y(t)} stroke={GRID} />
            <text x={pad.l - 6} y={y(t) + 4} textAnchor="end" fontSize={10} fill={AXIS}>{format(t)}</text></g>
        ))}
        {data.length > 0 && <><path d={area} fill="url(#area)" /><path d={line} fill="none" stroke={SERIES} strokeWidth={2} strokeLinejoin="round" /></>}
        {data.map((d, i) => i % every === 0 && <text key={i} x={x(i)} y={height - 6} textAnchor="middle" fontSize={10} fill={AXIS}>{d.label}</text>)}
        {hover !== null && data[hover] && <>
          <line x1={x(hover)} x2={x(hover)} y1={pad.t} y2={pad.t + ih} stroke={AXIS} strokeDasharray="3 3" />
          <circle cx={x(hover)} cy={y(data[hover].value)} r={4} fill={SERIES} stroke="#fff" strokeWidth={2} />
        </>}
      </svg>
      {hover !== null && data[hover] && (
        <div className="pointer-events-none absolute top-0 rounded-lg bg-ink px-2 py-1 text-xs text-white shadow"
             style={{ left: `${(x(hover) / w) * 100}%`, transform: "translateX(-50%)" }}>
          {data[hover].tip ?? `${data[hover].label}: ${format(data[hover].value)}`}
        </div>
      )}
    </div>
  )
}

function roundedTop(x: number, y: number, w: number, h: number, r: number) {
  const rr = Math.min(r, h)
  return `M${x},${y + h} L${x},${y + rr} Q${x},${y} ${x + rr},${y} L${x + w - rr},${y} Q${x + w},${y} ${x + w},${y + rr} L${x + w},${y + h} Z`
}
