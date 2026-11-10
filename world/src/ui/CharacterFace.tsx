import type { SVGProps } from 'react'
import type { CharacterKind } from '../scene/Characters'

const INK = '#2F2F2F'
const LILAC = '#B9A6EC'

type IconProps = { className?: string }

function Smile({ y = 25 }: { y?: number }) {
  return (
    <g>
      <circle cx="19" cy={y} r="1.9" fill={INK} />
      <circle cx="29" cy={y} r="1.9" fill={INK} />
      <path d={`M19 ${y + 6} Q24 ${y + 11} 29 ${y + 6}`} fill="none" stroke={INK} strokeWidth="2.2" strokeLinecap="round" />
    </g>
  )
}

function HarudleFace() {
  return (
    <>
      <circle cx="24" cy="27" r="14" fill="#fff" stroke={INK} strokeWidth="2.6" />
      <path d="M8.5 16.5C9 8 39 8 39.5 16.5 39 21.5 9 21.5 8.5 16.5Z" fill={LILAC} stroke={INK} strokeWidth="2.6" strokeLinejoin="round" />
      <path d="M24 9V5.5" stroke={INK} strokeWidth="2.6" strokeLinecap="round" />
      <Smile y={26} />
    </>
  )
}

function HaruFace() {
  return (
    <>
      <circle cx="24" cy="28" r="14" fill="#fff" stroke={INK} strokeWidth="2.6" />
      <path
        d="M11 22c-3-3-2-8 2-8 0-4 5-6 7-3 2-4 8-4 9 0 3-3 8-1 7 3 4 0 5 5 1 8"
        fill="none"
        stroke={INK}
        strokeWidth="2.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <Smile y={27} />
    </>
  )
}

function DoodleFace() {
  return (
    <>
      <circle cx="24" cy="26" r="14" fill="#fff" stroke={INK} strokeWidth="2.6" />
      <path d="M12 15C6 13 3 20 6 26c2 3 6 1 6-3Z" fill="#fff" stroke={INK} strokeWidth="2.6" strokeLinejoin="round" />
      <path d="M36 15c6-2 9 5 6 11-2 3-6 1-6-3Z" fill="#fff" stroke={INK} strokeWidth="2.6" strokeLinejoin="round" />
      <circle cx="18.5" cy="23" r="1.9" fill={INK} />
      <circle cx="29.5" cy="23" r="1.9" fill={INK} />
      <ellipse cx="24" cy="28" rx="2.8" ry="2.1" fill={INK} />
      <path d="M24 30v2.5M19.5 33q2.5 2 4.5-.5 2 2.5 4.5.5" fill="none" stroke={INK} strokeWidth="2" strokeLinecap="round" />
    </>
  )
}

const FACES = { harudle: HarudleFace, haru: HaruFace, doodle: DoodleFace }

export function CharacterFace({ kind, ...svgProps }: SVGProps<SVGSVGElement> & { kind: CharacterKind }) {
  const Face = FACES[kind]
  return (
    <svg viewBox="0 0 48 48" aria-hidden="true" {...svgProps}>
      <Face />
    </svg>
  )
}

export function BookSymbol({ className }: IconProps) {
  return (
    <svg viewBox="0 0 48 48" aria-hidden="true" className={className}>
      <g fill="none" stroke={INK} strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round">
        <path d="M36 11l1 26" />
        <path d="M11 12l20-4 1 28-20 3Z" fill="#fff" />
        <path d="M18 25q4 5 8-.5" />
        <path d="M39 6l2-3M42 11l3-1" stroke="#7355DA" />
      </g>
      <circle cx="18.5" cy="19.5" r="1.9" fill={INK} />
      <circle cx="26.5" cy="18.5" r="1.9" fill={INK} />
      <path d="M14 38.5v7l3-2.2 3 2.2v-8Z" fill="#7355DA" stroke={INK} strokeWidth="1.6" strokeLinejoin="round" />
    </svg>
  )
}
