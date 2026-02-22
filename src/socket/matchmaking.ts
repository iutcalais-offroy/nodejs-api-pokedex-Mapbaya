import { prisma } from '../database'

const DECK_SIZE = 10
const HAND_SIZE = 5

export interface WaitingRoom {
  id: number
  hostUserId: number
  hostUsername: string
  hostSocketId: string
  deckId: number
  socketRoomName: string
}

const rooms = new Map<number, WaitingRoom>()
let nextRoomId = 1

/** Réinitialise l'état du matchmaking (pour les tests). */
export function resetMatchmakingState(): void {
  rooms.clear()
  nextRoomId = 1
}

function getSocketRoomName(id: number): string {
  return `room-${id}`
}

export function getRoomsList(): Array<{
  id: number
  hostUsername: string
  deckId: number
}> {
  return Array.from(rooms.values()).map((r) => ({
    id: r.id,
    hostUsername: r.hostUsername,
    deckId: r.deckId,
  }))
}

export function getRoom(roomId: number): WaitingRoom | undefined {
  return rooms.get(roomId)
}

export function removeRoom(roomId: number): void {
  rooms.delete(roomId)
}

export async function validateDeck(
  userId: number,
  deckId: number,
): Promise<
  | { ok: true; deck: { id: number; deckCards: { card: unknown }[] } }
  | { ok: false; error: string }
> {
  const deckIdNum = typeof deckId === 'string' ? parseInt(deckId, 10) : deckId
  if (isNaN(deckIdNum)) {
    return { ok: false, error: 'Deck invalide' }
  }

  const deck = await prisma.deck.findFirst({
    where: { id: deckIdNum, userId },
    include: {
      deckCards: {
        include: { card: true },
      },
    },
  })

  if (!deck) {
    return {
      ok: false,
      error: "Le deck n'appartient pas à l'utilisateur ou n'existe pas",
    }
  }

  if (deck.deckCards.length !== DECK_SIZE) {
    return { ok: false, error: 'Le deck doit contenir exactement 10 cartes' }
  }

  return {
    ok: true,
    deck: deck as { id: number; deckCards: { card: unknown }[] },
  }
}

function shuffle<T>(arr: T[]): T[] {
  const out = [...arr]
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[out[i], out[j]] = [out[j], out[i]]
  }
  return out
}

export function createRoom(data: {
  roomId: number
  hostUserId: number
  hostUsername: string
  hostSocketId: string
  deckId: number
}): WaitingRoom {
  const room: WaitingRoom = {
    id: data.roomId,
    hostUserId: data.hostUserId,
    hostUsername: data.hostUsername,
    hostSocketId: data.hostSocketId,
    deckId: data.deckId,
    socketRoomName: getSocketRoomName(data.roomId),
  }
  rooms.set(room.id, room)
  return room
}

export function getNextRoomId(): number {
  return nextRoomId++
}

export function buildInitialHands(
  deckCards1: { card: unknown }[],
  deckCards2: { card: unknown }[],
): {
  hand1: unknown[]
  hand2: unknown[]
} {
  const cards1 = shuffle(deckCards1)
    .map((dc) => dc.card)
    .slice(0, HAND_SIZE)
  const cards2 = shuffle(deckCards2)
    .map((dc) => dc.card)
    .slice(0, HAND_SIZE)
  return { hand1: cards1, hand2: cards2 }
}

export function getSocketRoomNameExport(id: number): string {
  return getSocketRoomName(id)
}
