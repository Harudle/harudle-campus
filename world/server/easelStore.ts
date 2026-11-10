import { mkdirSync } from 'node:fs'
import type { IncomingMessage, ServerResponse } from 'node:http'
import { dirname } from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import { EASEL_MAX_POINTS, sanitizeSegment, segmentPoints, type EaselSegment } from '../src/data/easel.ts'

// 스케치북에는 최근 장만 남기고 오래된 장부터 지운다.
const MAX_PAGES = 500
// 지난 장은 바뀌지 않으므로 잠깐 캐시해도 된다. 가린 장이 늦게 사라지는 정도만 늦어진다.
const PAGE_CACHE_SECONDS = 300

type SegmentRow = { color: number; width: number; points: string }
type PageRow = { id: number; segments: string; created_at: number }

const toSegments = (raw: unknown[]) => {
  const segments: EaselSegment[] = []
  let pointCount = 0
  for (const item of raw) {
    const segment = sanitizeSegment(item)
    if (!segment || pointCount + segmentPoints(segment) > EASEL_MAX_POINTS) continue
    segments.push(segment)
    pointCount += segmentPoints(segment)
  }
  return segments
}

/**
 * 이젤 그림판의 저장소. 지금 그리는 선은 조각마다 저장해 서버가 다시 떠도 남고,
 * 새 종이를 누르면 그때까지의 그림을 스케치북 한 장으로 넘겨 /easel/pages에서 다시 볼 수 있다.
 * 누가 그렸는지는 저장하지 않는다. 문제가 있는 장은 DB에서 hidden = 1로 가린다.
 */
export function createEaselStore(databasePath: string) {
  mkdirSync(dirname(databasePath), { recursive: true })
  const db = new DatabaseSync(databasePath)
  db.exec(`
    PRAGMA journal_mode = WAL;
    PRAGMA busy_timeout = 2000;
    CREATE TABLE IF NOT EXISTS easel_segments (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      color INTEGER NOT NULL,
      width INTEGER NOT NULL,
      points TEXT NOT NULL,
      created_at INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS easel_pages (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      segments TEXT NOT NULL,
      created_at INTEGER NOT NULL,
      hidden INTEGER NOT NULL DEFAULT 0
    );
  `)
  const insert = db.prepare('INSERT INTO easel_segments (color, width, points, created_at) VALUES (?, ?, ?, ?)')
  const selectAll = db.prepare('SELECT color, width, points FROM easel_segments ORDER BY id')
  const removeAll = db.prepare('DELETE FROM easel_segments')
  const insertPage = db.prepare('INSERT INTO easel_pages (segments, created_at) VALUES (?, ?)')
  const trimPages = db.prepare('DELETE FROM easel_pages WHERE id <= (SELECT id FROM easel_pages ORDER BY id DESC LIMIT 1 OFFSET ?)')
  const listPages = db.prepare('SELECT id, created_at FROM easel_pages WHERE hidden = 0 ORDER BY id DESC LIMIT ?')
  const findPage = db.prepare('SELECT id, segments, created_at FROM easel_pages WHERE id = ? AND hidden = 0')

  return {
    /** 저장된 선을 그린 순서대로 돌려준다. 맞지 않는 줄은 건너뛰고, 한 장에 그릴 수 있는 만큼만 읽는다. */
    load(): EaselSegment[] {
      try {
        const rows = selectAll.all() as SegmentRow[]
        return toSegments(rows.map((row) => ({ c: row.color, w: row.width, p: JSON.parse(row.points) })))
      } catch (error) {
        console.error('그림판 읽기 실패', error)
        return []
      }
    },
    /** 저장에 실패해도 그리기는 끊기지 않게 기록만 건너뛴다. */
    add(segment: EaselSegment) {
      try {
        insert.run(segment.c, segment.w, JSON.stringify(segment.p), Date.now())
      } catch (error) {
        console.error('그림판 저장 실패', error)
      }
    },
    /** 지금 그림을 스케치북 한 장으로 넘기고 종이를 비운다. 빈 종이는 넘기지 않는다. */
    clear(segments: readonly EaselSegment[]) {
      try {
        db.exec('BEGIN')
        if (segments.length > 0) {
          insertPage.run(JSON.stringify(segments), Date.now())
          trimPages.run(MAX_PAGES)
        }
        removeAll.run()
        db.exec('COMMIT')
      } catch (error) {
        try {
          db.exec('ROLLBACK')
        } catch {
          // BEGIN부터 실패했으면 되돌릴 것이 없다.
        }
        console.error('그림판 넘기기 실패', error)
      }
    },

    /** GET /easel/pages(최근 장 목록), GET /easel/pages/:id(한 장의 선). 처리했으면 true. */
    handle(request: IncomingMessage, response: ServerResponse) {
      const url = new URL(request.url ?? '/', 'http://localhost')
      const match = /^\/easel\/pages(?:\/(\d{1,15}))?$/.exec(url.pathname)
      if (!match) return false
      const respond = (status: number, body: unknown, cacheSeconds = 0) => {
        response.writeHead(status, {
          'Cache-Control': cacheSeconds > 0 ? `public, max-age=${cacheSeconds}` : 'no-store',
          'X-Content-Type-Options': 'nosniff',
          'Access-Control-Allow-Origin': '*',
          'Content-Type': 'application/json; charset=utf-8',
        })
        response.end(JSON.stringify(body))
      }
      if (request.method !== 'GET') {
        respond(405, { code: 'method' })
        return true
      }
      try {
        if (!match[1]) {
          const rows = listPages.all(MAX_PAGES) as Omit<PageRow, 'segments'>[]
          respond(200, { items: rows.map((row) => ({ id: row.id, at: row.created_at })) })
        } else {
          const row = findPage.get(Number(match[1])) as PageRow | undefined
          if (!row) respond(404, { code: 'not_found' })
          else respond(200, { id: row.id, at: row.created_at, segs: toSegments(JSON.parse(row.segments)) }, PAGE_CACHE_SECONDS)
        }
      } catch (error) {
        console.error('스케치북 읽기 실패', error)
        if (!response.headersSent) respond(500, { code: 'failed' })
      }
      return true
    },

    close() {
      db.close()
    },
  }
}

export type EaselStore = ReturnType<typeof createEaselStore>
