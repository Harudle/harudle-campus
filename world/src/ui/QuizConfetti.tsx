import { useState, type CSSProperties } from 'react'

const COUNT = 60
const PIECE_COLORS = ['#7355DA', '#FFD97A', '#FFA9BD', '#5CC8F2', '#8B6FE8', '#D5EFE3']

function createPieces() {
  return Array.from({ length: COUNT }, (_, index) => ({
    left: Math.random() * 100,
    color: PIECE_COLORS[index % PIECE_COLORS.length],
    style: {
      '--duration': `${1.2 + Math.random() * 1}s`,
      '--delay': `${Math.random() * 0.25}s`,
      '--drift': `${(Math.random() - 0.5) * 160}px`,
      '--spin': `${360 + Math.random() * 720}deg`,
    } as CSSProperties,
  }))
}

/** dialog 안에 fixed로 띄워야 최상위 레이어에서 모달 위로 보인다. 다시 터뜨리려면 key를 바꾼다. */
export function QuizConfetti() {
  const [pieces] = useState(createPieces)
  return (
    <div aria-hidden="true" className="pointer-events-none fixed inset-0 z-50 overflow-hidden">
      {pieces.map((piece, index) => (
        <span
          key={index}
          className="quiz-confetti"
          style={{ ...piece.style, left: `${piece.left}%`, backgroundColor: piece.color }}
        />
      ))}
    </div>
  )
}
