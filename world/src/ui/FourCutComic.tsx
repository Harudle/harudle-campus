import type { ReactNode } from 'react'

const INK = '#2B2140'
const FACE = '#FFF4E8'
const HAIR = '#6A50C9'

export function Panel({ x, y, bg, children }: { x: number; y: number; bg: string; children: ReactNode }) {
  return (
    <svg x={x} y={y} width={300} height={300} viewBox="0 0 300 300">
      <rect width="300" height="300" fill={bg} />
      {children}
      <rect x="2" y="2" width="296" height="296" fill="none" stroke={INK} strokeWidth="4" />
    </svg>
  )
}

export function Bubble({ x, y, w, h, tailX, tailY, lines }: {
  x: number
  y: number
  w: number
  h: number
  tailX: number
  tailY: number
  lines: string[]
}) {
  const baseX = Math.min(Math.max(tailX, x + 24), x + w - 34)
  const centerY = y + h / 2 - ((lines.length - 1) * 26) / 2
  return (
    <g>
      <path d={`M${baseX} ${y + h - 3} L${tailX} ${tailY} L${baseX + 22} ${y + h - 3} Z`} fill="#fff" stroke={INK} strokeWidth="3" strokeLinejoin="round" />
      <rect x={x} y={y} width={w} height={h} rx="18" fill="#fff" stroke={INK} strokeWidth="3" />
      <rect x={baseX + 2} y={y + h - 6} width="18" height="6" fill="#fff" />
      <text x={x + w / 2} y={centerY} textAnchor="middle" dominantBaseline="central" fontFamily="Jua, sans-serif" fontSize="23" fill={INK}>
        {lines.map((line, index) => (
          <tspan key={line} x={x + w / 2} dy={index === 0 ? 0 : 26}>
            {line}
          </tspan>
        ))}
      </text>
    </g>
  )
}

function Clock({ x, y, r, time, tilt = 0 }: { x: number; y: number; r: number; time: string; tilt?: number }) {
  return (
    <g transform={`translate(${x} ${y}) rotate(${tilt})`}>
      <circle cx={-r * 0.62} cy={-r * 0.92} r={r * 0.32} fill="#FFD97A" stroke={INK} strokeWidth="3" />
      <circle cx={r * 0.62} cy={-r * 0.92} r={r * 0.32} fill="#FFD97A" stroke={INK} strokeWidth="3" />
      <path d={`M${-r * 0.7} ${r * 0.8} L${-r * 0.9} ${r * 1.15} M${r * 0.7} ${r * 0.8} L${r * 0.9} ${r * 1.15}`} stroke={INK} strokeWidth="4" strokeLinecap="round" />
      <circle r={r} fill="#fff" stroke={INK} strokeWidth="4" />
      <text textAnchor="middle" dominantBaseline="central" fontFamily="Jua, sans-serif" fontSize={r * 0.56} fill={INK}>
        {time}
      </text>
    </g>
  )
}

function Bed({ y = 215 }: { y?: number }) {
  return (
    <g>
      <rect x="18" y={y - 32} width="20" height="90" rx="6" fill="#8B6FE8" stroke={INK} strokeWidth="3" />
      <rect x="28" y={y} width="244" height="44" rx="10" fill="#fff" stroke={INK} strokeWidth="3" />
      <rect x="262" y={y - 12} width="20" height="70" rx="6" fill="#8B6FE8" stroke={INK} strokeWidth="3" />
    </g>
  )
}

function Head({ x, y, children }: { x: number; y: number; children?: ReactNode }) {
  return (
    <g transform={`translate(${x} ${y})`}>
      <circle r="38" fill={FACE} stroke={INK} strokeWidth="3.5" />
      <path d="M-37 -6 C-40 -50 40 -52 37 -6 C24 -24 4 -28 -6 -22 C-16 -18 -28 -18 -37 -6 Z" fill={HAIR} stroke={INK} strokeWidth="3.5" strokeLinejoin="round" />
      {children}
    </g>
  )
}

function FirstCut() {
  return (
    <Panel x={0} y={0} bg="#4A3596">
      <circle cx="248" cy="48" r="26" fill="#FFD97A" />
      <circle cx="238" cy="42" r="23" fill="#4A3596" />
      <g fill="#fff">
        <circle cx="30" cy="125" r="3" />
        <circle cx="270" cy="125" r="3" />
        <circle cx="200" cy="130" r="2.5" />
      </g>
      <Bed />
      <Head x={100} y={168}>
        <circle cx="-13" cy="4" r="4.5" fill={INK} />
        <circle cx="13" cy="4" r="4.5" fill={INK} />
        <path d="M-10 17 Q0 28 10 17" fill="#FF8FA8" stroke={INK} strokeWidth="3" strokeLinejoin="round" />
      </Head>
      <path d="M50 205 H272 V246 Q160 258 50 246 Z" fill="#C3B3F8" stroke={INK} strokeWidth="3.5" strokeLinejoin="round" />
      <Bubble x={14} y={14} w={204} h={82} tailX={100} tailY={132} lines={['내일부터 진짜', '6시 기상!!']} />
    </Panel>
  )
}

function SecondCut() {
  return (
    <Panel x={306} y={0} bg="#EDE7FF">
      <path d="M150 12 L172 42 L208 24 L212 62 L252 62 L232 94 L268 116 L228 130 L238 168 L198 158 L182 192 L150 168 L118 192 L102 158 L62 168 L72 130 L32 116 L68 94 L48 62 L88 62 L92 24 L128 42 Z" fill="#FFD97A" stroke={INK} strokeWidth="3.5" strokeLinejoin="round" />
      <Clock x={150} y={102} r={50} time="6:00" tilt={-7} />
      <Bed y={228} />
      <path d="M46 226 C60 190 240 190 262 226 V252 H46 Z" fill="#C3B3F8" stroke={INK} strokeWidth="3.5" strokeLinejoin="round" />
      <text x="14" y="42" fontFamily="Jua, sans-serif" fontSize="34" fill="#7355DA" stroke="#fff" strokeWidth="7" strokeLinejoin="round" paintOrder="stroke" transform="rotate(-10 14 42)">
        따르릉!!
      </text>
    </Panel>
  )
}

function ThirdCut() {
  return (
    <Panel x={0} y={306} bg="#D9CEFC">
      <Bed y={228} />
      <path d="M46 226 C50 150 250 150 262 226 V252 H46 Z" fill="#C3B3F8" stroke={INK} strokeWidth="3.5" strokeLinejoin="round" />
      <path d="M96 175 C80 160 78 142 86 126" fill="none" stroke={INK} strokeWidth="16" strokeLinecap="round" />
      <path d="M96 175 C80 160 78 142 86 126" fill="none" stroke={FACE} strokeWidth="9" strokeLinecap="round" />
      <Clock x={86} y={94} r={30} time="6:00" />
      <circle cx="86" cy="124" r="11" fill={FACE} stroke={INK} strokeWidth="3" />
      <g fontFamily="Jua, sans-serif" fill="#7355DA">
        <text x="228" y="150" fontSize="22">Z</text>
        <text x="246" y="122" fontSize="28">Z</text>
        <text x="266" y="88" fontSize="34">Z</text>
      </g>
      <Bubble x={124} y={50} w={116} h={56} tailX={176} tailY={160} lines={['5분만…']} />
    </Panel>
  )
}

function FourthCut() {
  return (
    <Panel x={306} y={306} bg="#FFF3C9">
      <circle cx="42" cy="44" r="28" fill="#FFB84D" stroke={INK} strokeWidth="3.5" />
      <g stroke={INK} strokeWidth="4" strokeLinecap="round">
        <path d="M84 30 L102 22 M84 56 L104 62 M48 86 L52 106" />
      </g>
      <Clock x={240} y={160} r={38} time="11:47" />
      <Head x={118} y={190}>
        <circle cx="-13" cy="3" r="9" fill="#fff" stroke={INK} strokeWidth="3" />
        <circle cx="13" cy="3" r="9" fill="#fff" stroke={INK} strokeWidth="3" />
        <circle cx="-13" cy="3" r="2.5" fill={INK} />
        <circle cx="13" cy="3" r="2.5" fill={INK} />
        <ellipse cy="23" rx="6" ry="4" fill="none" stroke={INK} strokeWidth="3" />
        <path d="M31 -24 C38 -14 42 -8 36 -4 C29 -2 25 -12 31 -24 Z" fill="#8FD3FF" stroke={INK} strokeWidth="2.5" />
      </Head>
      <path d="M76 300 C80 236 156 236 160 300 Z" fill="#fff" stroke={INK} strokeWidth="3.5" />
      <Bubble x={112} y={12} w={176} h={72} tailX={126} tailY={146} lines={['…점심이', '미라클이네']} />
    </Panel>
  )
}

export function FourCutComic({ description }: { description: string }) {
  return (
    <figure>
      <svg viewBox="0 0 606 606" role="img" aria-label={description} className="block w-full">
        <FirstCut />
        <SecondCut />
        <ThirdCut />
        <FourthCut />
      </svg>
    </figure>
  )
}
