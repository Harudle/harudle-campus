// 14층 방에 거는 하루들 월드 내용: 전시관의 인기 네컷만화, 릴레이 상영관의 최신 화, 오락실의 사용자 퀴즈.
// 월드 서버(world/server/campus.ts)와 하루들 피드 중계(/api/v1/feeds)에서 받는다. three.js 없이 데이터만 다룬다.

export type ShowItem = {
  /** 눌렀을 때 여는 월드 창(world/campus/modal.tsx의 # 값) */
  view: string
  /** 3D 텍스처로 쓸 이미지 주소(같은 주소로 중계). 없으면 글씨만 그린다 */
  image: string | null
  /** 액자 아래 띠에 쓰는 글 */
  caption: string
  /** 가까이 갔을 때 버튼 글 */
  action: string
  /** 앞에서 점프하면 그림 속 게임(#crab)으로 뛰어든다: 메인 전시실에 걸린 꽃게 게임 만화 */
  dive?: boolean
  /** 작가 방명록 판에 쪽지로 붙이는 최근 응원과 전체 수 */
  cheers?: { notes: { nickname: string; message: string }[]; total: number }
  /** 휴대폰 화면(하루들 모바일 피드)에 쓰는 글쓴이 · 분류 · 좋아요 · 댓글 */
  post?: { nickname: string; category: string; likes: number; comments: number }
}

/** work: 메인 전시실 인기순 · a0~a7: 작가 전시실(좋아요 합 순) 작품 · cheer: 작가 방명록 · album: 작가 작품 앨범북(그 작가 만화 전부) · relay · song · drama */
export type ShowSource = string

/** 월드 메인 전시실과 같다: 작가 전시실 8곳, 한 방에 거는 작품 수 상한 */
export const ARTIST_ROOMS = 8
/** 꽃게 게임이 들어 있는 그림(world/src/data/paintingGames.ts의 CRAB_GAME_WORK_ID) */
const CRAB_GAME_WORK_ID = 'bd08fbb7-5aef-4dbc-9820-30344fe8431e'
// 월드 전시관(galleryWorks.ts)처럼 인기순 피드를 몇 쪽 받아 작가별로 묶는다
const PAGE_SIZE = 50
const MAX_PAGES = 6

const TIMEOUT_MS = 8000
/** 방명록 판에 붙이는 최근 응원 쪽지 수 */
const CHEER_NOTES = 3
const ROOM_TITLES = { song: '노래 맞추기', drama: '드라마·영화 맞추기' }

type Work = { id: string; imageUrl: string; authorId: string; nickname: string; likeCount: number; commentCount: number; category: string }

// S3는 harudle.com에서만 이미지를 읽게 해 두어서, 3D 텍스처는 월드 서버의 /s3-image 중계를 거친다
function textureUrl(imageUrl: string | undefined) {
  if (!imageUrl) return null
  try {
    const url = new URL(imageUrl)
    return `/s3-image${url.pathname}${url.search}`
  } catch {
    return null
  }
}

async function getJson(path: string) {
  const response = await fetch(path, { cache: 'no-store', credentials: 'omit', signal: AbortSignal.timeout(TIMEOUT_MS) })
  if (!response.ok) throw new Error(`${path} ${response.status}`)
  return response.json()
}

async function loadAllWorks(): Promise<Work[]> {
  const works: Work[] = []
  let cursor: string | null = null
  for (let page = 0; page < MAX_PAGES; page++) {
    const query = new URLSearchParams({ sort: 'POPULAR', size: String(PAGE_SIZE) })
    if (cursor) query.set('cursor', cursor)
    const data = await getJson(`/api/v1/feeds?${query}`)
    for (const item of data.items ?? []) {
      if (!item.id || !item.imageUrl || !item.shareUrl?.startsWith('https://')) continue
      works.push({ id: item.id, imageUrl: item.imageUrl, authorId: String(item.author?.id ?? item.id), nickname: item.author?.nickname ?? '우리끼리 작가', likeCount: item.likeCount ?? 0, commentCount: item.commentCount ?? 0, category: item.category?.name ?? '우리끼리' })
    }
    if (!data.hasNext) break
    cursor = data.nextCursor
  }
  return works
}

const workItem = (work: Work, caption: string): ShowItem => ({ view: `artwork=${encodeURIComponent(work.id)}`, image: textureUrl(work.imageUrl), caption, action: '만화 크게 보기' })

/** 전시관 전체: 메인 인기순, 작가 전시실, 방명록, 그림 속 게임 */
async function loadGallery(): Promise<Record<string, ShowItem[]>> {
  const works = await loadAllWorks()
  const out: Record<string, ShowItem[]> = {}
  // 월드처럼 꽃게 게임 만화는 메인 전시실에 걸린 자리(순위가 바뀌면 그 자리)에서 점프해 뛰어든다
  out.work = works.slice(0, 40).map((work, index) => {
    const item = { ...workItem(work, `${index + 1}위 · ${work.nickname} ♥${work.likeCount}`), post: { nickname: work.nickname, category: work.category, likes: work.likeCount, comments: work.commentCount } }
    return work.id === CRAB_GAME_WORK_ID ? { ...item, action: '크게 보기 · 점프하면 그림 속으로!', dive: true } : item
  })
  // 월드 buildExhibition과 같은 순서: 받은 좋아요 합이 큰 작가부터
  const byAuthor = new Map<string, Work[]>()
  for (const work of works) byAuthor.set(work.authorId, [...(byAuthor.get(work.authorId) ?? []), work])
  const artists = [...byAuthor.entries()]
    .map(([authorId, list]) => ({ authorId, nickname: list[0].nickname, list, likes: list.reduce((sum, work) => sum + work.likeCount, 0) }))
    .sort((a, b) => b.likes - a.likes || b.list.length - a.list.length)
    .slice(0, ARTIST_ROOMS)
  out.cheer = []
  out.plate = []
  out.album = []
  artists.forEach((artist, index) => {
    out[`a${index}`] = artist.list.map((work) => workItem(work, `${artist.nickname} · ♥${work.likeCount}`))
    const query = `cheers=${encodeURIComponent(artist.authorId)}&name=${encodeURIComponent(artist.nickname)}`
    out.cheer.push({ view: query, image: null, caption: `${artist.nickname} 작가 방명록`, action: '응원 방명록 쓰기', cheers: { notes: [], total: 0 } })
    out.album.push({ view: `album=${encodeURIComponent(artist.authorId)}&name=${encodeURIComponent(artist.nickname)}`, image: null, caption: `${artist.list.length}편 모두 보기`, action: '앨범북 펼쳐 보기' })
    out.plate.push({ view: query, image: null, caption: `${artist.nickname} 작가 작품`, action: '응원 방명록 쓰기' })
  })
  // 방명록마다 최근 응원을 받아 판에 쪽지로 붙인다. 못 받은 방은 빈 판(첫 응원을 기다리는 판)으로 둔다
  await Promise.all(artists.map(async (artist, index) => {
    try {
      const data = await getJson(`/cheers?author=${encodeURIComponent(artist.authorId)}`)
      const notes = (data.items ?? []).slice(0, CHEER_NOTES).map((cheer) => ({ nickname: String(cheer.nickname ?? ''), message: String(cheer.message ?? '') }))
      const total = Number(data.total) || notes.length
      out.cheer[index] = { ...out.cheer[index], caption: total ? `${artist.nickname} 작가 방명록 · 응원 ${total}` : `${artist.nickname} 작가 방명록`, cheers: { notes, total } }
    } catch {
      // 방명록을 못 받아도 판은 그대로 눌러서 쓸 수 있다
    }
  }))
  return out
}

/** 릴레이 상영관: 최신 화부터 거꾸로. 한 화도 없으면 1화 그리기 자리만 둔다 */
async function loadRelay(count: number): Promise<ShowItem[]> {
  const data = await getJson('/relay')
  const episodes = (data.items ?? []).slice(-count).reverse()
  if (!episodes.length) return [{ view: 'relay-new', image: null, caption: '1화를 그려 주세요', action: '1화 이어 그리기' }]
  return episodes.map((episode) => ({
    view: `relay=${episode.number}`,
    image: textureUrl(episode.imageUrl),
    caption: `${episode.number}화 · ${episode.author}`,
    action: `${episode.number}화 보기`,
  }))
}

/** 상영관 좌석에서 보는 영화: 지금까지 올라온 모든 화를 1화부터 차례로 */
export type ReelEpisode = { number: number; author: string; image: string | null }
export async function loadRelayReel(): Promise<ReelEpisode[]> {
  const data = await getJson('/relay')
  return (data.items ?? []).map((episode) => ({ number: episode.number, author: episode.author ?? '', image: textureUrl(episode.imageUrl) }))
}

/** 오락실: 방마다 걸린 사용자 퀴즈. 빈 자리에는 내 문제 걸기 */
async function loadQuizzes(room: 'song' | 'drama', count: number): Promise<ShowItem[]> {
  const data = await getJson(`/quizzes?room=${room}`)
  const quizzes: ShowItem[] = (data.items ?? []).slice(0, count).map((quiz) => ({
    view: `quiz=${quiz.id}&room=${room}`,
    image: textureUrl(quiz.imageUrl),
    caption: `${ROOM_TITLES[room]} · 맞힌 사람 ${quiz.solverCount ?? 0}`,
    action: '퀴즈 풀기',
  }))
  while (quizzes.length < count) quizzes.push({ view: `register=${room}`, image: null, caption: `+ 내 ${ROOM_TITLES[room]} 문제 걸기`, action: '내 문제 걸기' })
  return quizzes
}

/** 자리 수만큼 받아 온다. 받지 못한 곳은 빈 목록으로 두어 액자에 안내 글만 보인다. */
export async function loadShowcase(counts: Record<string, number>) {
  const settle = <T,>(p: Promise<T>, empty: T) => p.catch(() => empty)
  const [gallery, relay, song, drama] = await Promise.all([
    settle(loadGallery(), {} as Record<string, ShowItem[]>),
    settle(loadRelay(counts.relay ?? 1), []),
    settle(loadQuizzes('song', counts.song ?? 1), []),
    settle(loadQuizzes('drama', counts.drama ?? 1), []),
  ])
  return { ...gallery, relay, song, drama } as Record<string, ShowItem[]>
}
