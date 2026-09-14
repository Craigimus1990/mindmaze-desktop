import { directionOffset } from '../model/Direction'
import type { Maze } from '../model/Maze'
import { TREASURE_GATE_ID } from './constants'

export const isSolvable = (maze: Maze): boolean => bfsWithKeys(maze)

const bfsWithKeys = (maze: Maze): boolean => {
  // Cap keys at the total key count to bound the state space.
  let maxKeys = 0
  for (const room of maze.rooms.values()) {
    if (room.pickup.type === 'Key') maxKeys++
  }

  const key = (roomId: number, keys: number) => `${roomId}:${keys}`
  const visited = new Set<string>()
  const queue: Array<{ roomId: number; keys: number }> = [
    { roomId: maze.startId, keys: 0 },
  ]

  while (queue.length > 0) {
    const current = queue.shift()!
    const stateKey = key(current.roomId, current.keys)
    if (visited.has(stateKey)) continue
    visited.add(stateKey)

    if (current.roomId === maze.treasureId) return true

    const room = maze.rooms.get(current.roomId)
    if (!room) continue

    const keys =
      room.pickup.type === 'Key'
        ? Math.min(current.keys + 1, maxKeys)
        : current.keys

    for (const [dir, exit] of room.exits) {
      const neighborId = current.roomId + directionOffset(dir)
      if (!maze.rooms.has(neighborId)) continue

      switch (exit.type) {
        case 'Absent':
          continue
        case 'Door':
          if (exit.state === 'OPEN' || exit.state === 'CLOSED') {
            queue.push({ roomId: neighborId, keys })
          } else if (keys > 0) {
            queue.push({ roomId: neighborId, keys: keys - 1 })
          }
          break
        case 'Gate':
          if (exit.open) {
            queue.push({ roomId: neighborId, keys })
          } else if (
            // The treasure gate is raised by visiting the windlass rooms, which the generator
            // guarantees are reachable without crossing it. Treating it as a wall declared every
            // HARD maze unsolvable — sending generation through all 40 retries and its fallback
            // on every attempt, at 149 SECONDS per maze.
            exit.pairId === TREASURE_GATE_ID &&
            maze.treasureLock.type === 'Barred'
          ) {
            queue.push({ roomId: neighborId, keys })
          }
          break
      }
    }
  }
  return false
}
