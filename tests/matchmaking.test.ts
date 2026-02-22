import { describe, it, expect, beforeEach, vi } from 'vitest'
import {
  getRoomsList,
  getRoom,
  removeRoom,
  validateDeck,
  createRoom,
  getNextRoomId,
  buildInitialHands,
  getSocketRoomNameExport,
  resetMatchmakingState,
} from '../src/socket/matchmaking'
import { prismaMock } from './vitest.setup'

describe('matchmaking', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    resetMatchmakingState()
  })

  describe('getRoomsList', () => {
    it('retourne une liste vide quand aucune room', () => {
      expect(getRoomsList()).toEqual([])
    })

    it('retourne les rooms avec id, hostUsername, deckId', () => {
      createRoom({
        roomId: 1,
        hostUserId: 1,
        hostUsername: 'alice',
        hostSocketId: 's1',
        deckId: 10,
      })
      expect(getRoomsList()).toEqual([
        { id: 1, hostUsername: 'alice', deckId: 10 },
      ])
    })
  })

  describe('getRoom', () => {
    it('retourne undefined pour un id inconnu', () => {
      expect(getRoom(99)).toBeUndefined()
    })

    it('retourne la room existante', () => {
      createRoom({
        roomId: 2,
        hostUserId: 1,
        hostUsername: 'bob',
        hostSocketId: 's2',
        deckId: 20,
      })
      const room = getRoom(2)
      expect(room).toBeDefined()
      expect(room?.id).toBe(2)
      expect(room?.hostUsername).toBe('bob')
      expect(room?.socketRoomName).toBe('room-2')
    })
  })

  describe('removeRoom', () => {
    it('supprime la room', () => {
      createRoom({
        roomId: 3,
        hostUserId: 1,
        hostUsername: 'charlie',
        hostSocketId: 's3',
        deckId: 30,
      })
      expect(getRoom(3)).toBeDefined()
      removeRoom(3)
      expect(getRoom(3)).toBeUndefined()
      expect(getRoomsList()).toEqual([])
    })
  })

  describe('validateDeck', () => {
    it('retourne erreur si deckId est invalide (string NaN)', async () => {
      const result = await validateDeck(1, 'abc' as unknown as number)
      expect(result.ok).toBe(false)
      if (!result.ok) expect(result.error).toBe('Deck invalide')
    })

    it('retourne erreur si deckId est NaN', async () => {
      const result = await validateDeck(1, NaN)
      expect(result.ok).toBe(false)
      if (!result.ok) expect(result.error).toBe('Deck invalide')
    })

    it("retourne erreur si le deck n'existe pas ou n'appartient pas à l'utilisateur", async () => {
      prismaMock.deck.findFirst.mockResolvedValue(null)
      const result = await validateDeck(1, 42)
      expect(result.ok).toBe(false)
      if (!result.ok)
        expect(result.error).toBe(
          "Le deck n'appartient pas à l'utilisateur ou n'existe pas",
        )
    })

    it('retourne erreur si le deck na pas 10 cartes', async () => {
      prismaMock.deck.findFirst.mockResolvedValue({
        id: 42,
        userId: 1,
        name: 'Deck',
        createdAt: new Date(),
        updatedAt: new Date(),
        deckCards: Array(5).fill({ card: { id: 1 } }),
      } as never)
      const result = await validateDeck(1, 42)
      expect(result.ok).toBe(false)
      if (!result.ok)
        expect(result.error).toBe(
          'Le deck doit contenir exactement 10 cartes',
        )
    })

    it('retourne erreur si le deck a plus de 10 cartes', async () => {
      prismaMock.deck.findFirst.mockResolvedValue({
        id: 42,
        userId: 1,
        name: 'Deck',
        createdAt: new Date(),
        updatedAt: new Date(),
        deckCards: Array(12).fill({ card: { id: 1 } }),
      } as never)
      const result = await validateDeck(1, 42)
      expect(result.ok).toBe(false)
      if (!result.ok)
        expect(result.error).toBe(
          'Le deck doit contenir exactement 10 cartes',
        )
    })

    it('retourne ok et le deck si valide (10 cartes, bon user)', async () => {
      const deckCards = Array.from({ length: 10 }, (_, i) => ({
        card: { id: i + 1, name: `Card${i + 1}` },
      }))
      prismaMock.deck.findFirst.mockResolvedValue({
        id: 42,
        userId: 1,
        name: 'Valid Deck',
        createdAt: new Date(),
        updatedAt: new Date(),
        deckCards,
      } as never)
      const result = await validateDeck(1, 42)
      expect(result.ok).toBe(true)
      if (result.ok) {
        expect(result.deck.id).toBe(42)
        expect(result.deck.deckCards).toHaveLength(10)
      }
    })

    it('accepte deckId en string numérique', async () => {
      prismaMock.deck.findFirst.mockResolvedValue(null)
      await validateDeck(1, '99' as unknown as number)
      expect(prismaMock.deck.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 99, userId: 1 },
        }),
      )
    })
  })

  describe('createRoom', () => {
    it('ajoute une room et retourne lobjet room', () => {
      const room = createRoom({
        roomId: 5,
        hostUserId: 1,
        hostUsername: 'host',
        hostSocketId: 's5',
        deckId: 1,
      })
      expect(room.id).toBe(5)
      expect(room.socketRoomName).toBe('room-5')
      expect(getRoom(5)).toEqual(room)
    })
  })

  describe('getNextRoomId', () => {
    it('incrémente et retourne un nouvel id à chaque appel', () => {
      const a = getNextRoomId()
      const b = getNextRoomId()
      expect(b).toBe(a + 1)
    })
  })

  describe('buildInitialHands', () => {
    it('retourne deux mains de 5 cartes chacune', () => {
      const deckCards1 = Array.from({ length: 10 }, (_, i) => ({
        card: { id: i + 1 },
      }))
      const deckCards2 = Array.from({ length: 10 }, (_, i) => ({
        card: { id: 100 + i },
      }))
      const { hand1, hand2 } = buildInitialHands(deckCards1, deckCards2)
      expect(hand1).toHaveLength(5)
      expect(hand2).toHaveLength(5)
      expect(hand1.every((c) => typeof c === 'object')).toBe(true)
      expect(hand2.every((c) => typeof c === 'object')).toBe(true)
    })
  })

  describe('getSocketRoomNameExport', () => {
    it('retourne room-{id}', () => {
      expect(getSocketRoomNameExport(1)).toBe('room-1')
      expect(getSocketRoomNameExport(42)).toBe('room-42')
    })
  })
})
