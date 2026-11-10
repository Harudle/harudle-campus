// 캠퍼스 전용: 하루들 월드 서버(server/index.ts)를 대신해 캠퍼스 워커(app.js)에 월드 기능을 붙인다.
// npm run build가 dist-server/world.mjs로 묶고, app.js가 불러 쓴다.
// 월드 서버는 node:sqlite를 쓰므로 Node 22.13 이상이 필요하다. 그보다 낮으면 app.js가 월드 없이 캠퍼스만 띄운다.
import type { IncomingMessage, Server, ServerResponse } from 'node:http'
import { join } from 'node:path'
import { createChatLog } from './chatLog.ts'
import { createCheersHandler } from './cheers.ts'
import { createCrabRankingHandler } from './crabRanking.ts'
import { createEaselStore } from './easelStore.ts'
import { createHarudleProxy } from './harudleProxy.ts'
import { createQuizzesHandler } from './quizzes.ts'
import { attachRealtime } from './realtime.ts'
import { createRelayHandler } from './relay.ts'

export type WorldOptions = {
  /** DB를 둘 폴더. 배포 때 지워지지 않는 곳이어야 한다. */
  dataDir: string
  /** 브라우저 접속을 허용할 주소 */
  allowedOrigins: string[]
  trustProxy?: boolean
  maxPlayers?: number
  /** 요청의 하루들 로그인 사용자(캠퍼스 로그인). 없으면 릴레이 만화를 올리거나, 퀴즈를 풀거나 걸 수 없다 */
  userOf?: (request: IncomingMessage) => Promise<{ id: string; nickname?: string } | null>
}

export const WORLD_WS_PATH = '/world/ws'

/** 월드 실시간 접속(/world/ws)과 월드 API를 server에 붙인다. handle이 true를 돌려주면 월드가 응답한 요청이다. */
export function startWorld(server: Server, { dataDir, allowedOrigins, trustProxy = false, maxPlayers = 150, userOf }: WorldOptions) {
  const allowed = new Set(allowedOrigins)
  const isOriginAllowed = (origin: string | undefined) => origin !== undefined && allowed.has(origin)
  const db = (name: string) => join(dataDir, `${name}.db`)

  const chatLog = createChatLog(db('chats'))
  const easelStore = createEaselStore(db('easel'))
  const handlers = [
    createCheersHandler({ databasePath: db('cheers'), isOriginAllowed, trustProxy }),
    createQuizzesHandler({ databasePath: db('quizzes'), isOriginAllowed, trustProxy, userOf }),
    createRelayHandler({ databasePath: db('relay'), isOriginAllowed, trustProxy, userOf }),
    createCrabRankingHandler({ databasePath: db('crabgame'), isOriginAllowed, trustProxy }),
  ]
  const proxyHarudle = createHarudleProxy({ trustProxy })
  const realtime = attachRealtime(server, { path: WORLD_WS_PATH, maxPlayers, isOriginAllowed, chatLog, easelStore })

  return {
    handle(request: IncomingMessage, response: ServerResponse) {
      if (request.url === '/easel/art' && request.method === 'GET') {
        // 캠퍼스 14층 이젤 판에 그릴 지금 그림과 붓 상태
        const [brush, art] = realtime.easelSnapshot()
        response.writeHead(200, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' })
        response.end(JSON.stringify({ holder: brush?.holder ?? null, segs: art?.segs ?? [] }))
        return true
      }
      return handlers.some((handler) => handler.handle(request, response)) || easelStore.handle(request, response) || proxyHarudle(request, response)
    },
    playerCount: realtime.playerCount,
    /** 접속자에게 재접속 신호를 보내고 DB를 닫는다. */
    close() {
      realtime.close()
      for (const handler of handlers) handler.close()
      chatLog.close()
      easelStore.close()
    },
  }
}
