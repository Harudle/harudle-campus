import { worldApiUrl } from '../lib/worldApi'
import type { EaselSegment } from './easel'

/** 스케치북 한 장. at은 새 종이로 넘긴 시각이다. */
export type EaselPageInfo = { id: number; at: number }

const TIMEOUT_MS = 10_000

/** 스케치북의 장 목록을 오래된 장부터 돌려준다. 받지 못하면 null. */
export async function fetchEaselPages(): Promise<EaselPageInfo[] | null> {
  try {
    const response = await fetch(worldApiUrl('/easel/pages'), { cache: 'no-store', signal: AbortSignal.timeout(TIMEOUT_MS) })
    if (!response.ok) return null
    const data = await response.json()
    return (data.items as EaselPageInfo[]).slice().reverse()
  } catch {
    return null
  }
}

/** 한 장에 그린 선. 받지 못하면 null. */
export async function fetchEaselPage(id: number, signal?: AbortSignal): Promise<EaselSegment[] | null> {
  try {
    const response = await fetch(worldApiUrl(`/easel/pages/${id}`), { signal: signal ?? AbortSignal.timeout(TIMEOUT_MS) })
    if (!response.ok) return null
    const data = await response.json()
    return data.segs as EaselSegment[]
  } catch {
    return null
  }
}
