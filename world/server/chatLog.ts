import { randomUUID } from 'node:crypto'
import { mkdirSync } from 'node:fs'
import { dirname } from 'node:path'
import { DatabaseSync } from 'node:sqlite'

const RETENTION_DAYS = 30
const DAY_MS = 86_400_000
const PURGE_INTERVAL_MS = 3_600_000
const HISTORY_SIZE = 30

export type ChatLogEntry = { id: number | null; nickname: string; text: string; at: number }

type ChatRow = { player_id: number; run: string; nickname: string; text: string; created_at: number }

/**
 * 공간별 채팅 기록. 닉네임과 글만 저장하고 IP는 저장하지 않으며, 30일이 지나면 지운다.
 * 방문자 번호는 서버가 다시 뜨면 처음부터 다시 매겨지므로, 같은 실행 중에 쓴 글에만 번호를 돌려준다.
 */
export function createChatLog(databasePath: string) {
  mkdirSync(dirname(databasePath), { recursive: true })
  const db = new DatabaseSync(databasePath)
  db.exec(`
    PRAGMA journal_mode = WAL;
    PRAGMA busy_timeout = 2000;
    CREATE TABLE IF NOT EXISTS chat_messages (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      room TEXT NOT NULL,
      player_id INTEGER NOT NULL,
      run TEXT NOT NULL,
      nickname TEXT NOT NULL,
      text TEXT NOT NULL,
      created_at INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS chat_messages_room ON chat_messages (room, id);
    CREATE INDEX IF NOT EXISTS chat_messages_created ON chat_messages (created_at);
  `)
  const run = randomUUID()
  const insert = db.prepare('INSERT INTO chat_messages (room, player_id, run, nickname, text, created_at) VALUES (?, ?, ?, ?, ?, ?)')
  const select = db.prepare('SELECT player_id, run, nickname, text, created_at FROM chat_messages WHERE room = ? AND created_at >= ? ORDER BY id DESC LIMIT ?')
  const remove = db.prepare('DELETE FROM chat_messages WHERE created_at < ?')

  const cutoff = () => Date.now() - RETENTION_DAYS * DAY_MS
  const purge = () => {
    try {
      remove.run(cutoff())
    } catch (error) {
      console.error('채팅 기록 정리 실패', error)
    }
  }
  purge()
  const purgeTimer = setInterval(purge, PURGE_INTERVAL_MS)
  purgeTimer.unref()

  return {
    /** 저장에 실패해도 대화는 끊기지 않게 기록만 건너뛴다. */
    add(room: string, playerId: number, nickname: string, text: string) {
      try {
        insert.run(room, playerId, run, nickname, text, Date.now())
      } catch (error) {
        console.error('채팅 저장 실패', error)
      }
    },
    /** 이 공간의 최근 대화를 오래된 순서로 돌려준다. */
    recent(room: string): ChatLogEntry[] {
      try {
        const rows = select.all(room, cutoff(), HISTORY_SIZE) as ChatRow[]
        return rows.reverse().map((row) => ({
          id: row.run === run ? row.player_id : null,
          nickname: row.nickname,
          text: row.text,
          at: row.created_at,
        }))
      } catch (error) {
        console.error('채팅 기록 읽기 실패', error)
        return []
      }
    },
    close() {
      clearInterval(purgeTimer)
      db.close()
    },
  }
}

export type ChatLog = ReturnType<typeof createChatLog>
