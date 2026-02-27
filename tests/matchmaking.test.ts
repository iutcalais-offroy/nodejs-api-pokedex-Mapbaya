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
  startGame,
  getGameState,
  getGameStateViewForPlayer,
  applyDrawCards,
  applyPlayCard,
  applyAttack,
  applyEndTurn,
} from '../src/socket/matchmaking'
import { prismaMock } from './vitest.setup'
import { PokemonType } from '../src/generated/prisma/client'

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
        expect(result.error).toBe('Le deck doit contenir exactement 10 cartes')
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
        expect(result.error).toBe('Le deck doit contenir exactement 10 cartes')
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

  describe('game logic', () => {
    const roomId = 99
    const hostSocketId = 'host-socket'
    const guestSocketId = 'guest-socket'

    function createDeckCards(): { card: unknown }[] {
      return Array.from({ length: 10 }, (_, i) => ({
        card: {
          id: i + 1,
          name: `Card${i + 1}`,
          hp: 50,
          attack: 10,
          type: PokemonType.Fire,
          pokedexNumber: i + 1,
          imgUrl: null,
        },
      }))
    }

    function createGame() {
      const hostDeckCards = createDeckCards()
      const guestDeckCards = createDeckCards()

      return startGame({
        roomId,
        socketRoomName: 'room-99',
        hostSocketId,
        hostUserId: 1,
        hostUsername: 'host',
        hostDeckCards,
        guestSocketId,
        guestUserId: 2,
        guestUsername: 'guest',
        guestDeckCards,
      })
    }

    it('startGame initialise les mains, decks, scores et joueur courant', () => {
      const game = createGame()
      expect(game.roomId).toBe(roomId)
      const host = game.players[hostSocketId]
      const guest = game.players[guestSocketId]
      expect(host).toBeDefined()
      expect(guest).toBeDefined()
      expect(host.hand).toHaveLength(5)
      expect(guest.hand).toHaveLength(5)
      expect(host.deck.length).toBe(5)
      expect(guest.deck.length).toBe(5)
      expect(host.score).toBe(0)
      expect(guest.score).toBe(0)
      expect(game.currentPlayerSocketId).toBe(hostSocketId)
    })

    it('getGameStateViewForPlayer masque la main et le deck adverses', () => {
      createGame()
      const hostView = getGameStateViewForPlayer(roomId, hostSocketId)
      const guestView = getGameStateViewForPlayer(roomId, guestSocketId)

      expect(hostView).not.toBeNull()
      expect(guestView).not.toBeNull()

      expect(hostView!.you.hand.length).toBeLessThanOrEqual(5)
      expect(hostView!.opponent.handCount).toBeLessThanOrEqual(5)
      expect((hostView!.opponent as unknown as { hand?: unknown }).hand).toBe(
        undefined,
      )

      expect(guestView!.you.hand.length).toBeLessThanOrEqual(5)
      expect(guestView!.opponent.handCount).toBeLessThanOrEqual(5)
      expect((guestView!.opponent as unknown as { hand?: unknown }).hand).toBe(
        undefined,
      )
    })

    it('applyDrawCards pioche jusquà 5 cartes et respecte le tour', () => {
      const game = createGame()
      const host = game.players[hostSocketId]
      // Réduire la main pour tester la pioche
      host.hand.splice(0, 3)
      const initialDeckSize = host.deck.length
      const missingCards = 5 - host.hand.length

      const notTurn = applyDrawCards(roomId, guestSocketId)
      expect(notTurn.ok).toBe(false)

      const result = applyDrawCards(roomId, hostSocketId)
      expect(result.ok).toBe(true)

      const updated = getGameState(roomId)!
      const updatedHost = updated.players[hostSocketId]
      expect(updatedHost.hand.length).toBe(5)
      expect(updatedHost.deck.length).toBe(initialDeckSize - missingCards)
    })

    it('applyDrawCards retourne une erreur si la partie nexiste pas ou que le joueur est inconnu', () => {
      const resNoGame = applyDrawCards(1234, hostSocketId)
      expect(resNoGame.ok).toBe(false)

      createGame()
      const resUnknown = applyDrawCards(roomId, 'unknown-socket')
      expect(resUnknown.ok).toBe(false)

      const endTurnNoGame = applyEndTurn(1234, hostSocketId)
      expect(endTurnNoGame.ok).toBe(false)

      const attackNoGame = applyAttack(1234, hostSocketId)
      expect(attackNoGame.ok).toBe(false)

      const playNoGame = applyPlayCard(1234, hostSocketId, 0)
      expect(playNoGame.ok).toBe(false)
    })

    it('applyPlayCard joue une carte valide et met à jour la carte active', () => {
      const game = createGame()
      const host = game.players[hostSocketId]
      const initialHandSize = host.hand.length

      const result = applyPlayCard(roomId, hostSocketId, 0)
      expect(result.ok).toBe(true)

      const updated = getGameState(roomId)!
      const updatedHost = updated.players[hostSocketId]
      expect(updatedHost.activeCard).not.toBeNull()
      expect(updatedHost.hand.length).toBe(initialHandSize - 1)
    })

    it("applyPlayCard remet l'ancienne carte active dans la main en cas de remplacement", () => {
      const game = createGame()
      const host = game.players[hostSocketId]
      host.activeCard = host.hand[0] ?? null
      const initialHandSize = host.hand.length

      const res = applyPlayCard(roomId, hostSocketId, 1)
      expect(res.ok).toBe(true)

      const updated = getGameState(roomId)!
      const updatedHost = updated.players[hostSocketId]
      expect(updatedHost.activeCard).not.toBeNull()
      expect(updatedHost.hand.length).toBe(initialHandSize)
    })

    it('applyPlayCard retourne une erreur si index invalide ou ce nest pas le tour', () => {
      createGame()
      const invalidIndex = applyPlayCard(roomId, hostSocketId, 999)
      expect(invalidIndex.ok).toBe(false)

      const notTurn = applyPlayCard(roomId, guestSocketId, 0)
      expect(notTurn.ok).toBe(false)
    })

    it('applyEndTurn alterne le joueur courant et bloque si ce nest pas le tour', () => {
      const game = createGame()
      expect(game.currentPlayerSocketId).toBe(hostSocketId)

      const notTurn = applyEndTurn(roomId, guestSocketId)
      expect(notTurn.ok).toBe(false)

      const res = applyEndTurn(roomId, hostSocketId)
      expect(res.ok).toBe(true)

      const updated = getGameState(roomId)!
      expect(updated.currentPlayerSocketId).toBe(guestSocketId)
    })

    it('applyAttack applique les dégâts, peut mettre KO et donner la victoire', () => {
      const game = createGame()
      const host = game.players[hostSocketId]
      const guest = game.players[guestSocketId]

      // Préparer les cartes actives
      host.activeCard = host.hand.shift() ?? null
      guest.activeCard = guest.hand.shift() ?? null

      if (!host.activeCard || !guest.activeCard) {
        throw new Error('Cartes actives manquantes pour le test')
      }

      // Rendre lattaque létale
      host.activeCard.attack = 100
      guest.activeCard.currentHp = 10

      // Donner déjà 2 points à lhost pour tester la condition de victoire
      host.score = 2

      const res = applyAttack(roomId, hostSocketId)
      expect(res.ok).toBe(true)
      expect(res.winnerSocketId).toBe(hostSocketId)

      const updated = getGameState(roomId)!
      const updatedHost = updated.players[hostSocketId]
      const updatedGuest = updated.players[guestSocketId]

      expect(updatedHost.score).toBe(3)
      expect(updatedGuest.activeCard).toBeNull()
      expect(updated.winnerSocketId).toBe(hostSocketId)
    })

    it('applyAttack peut mettre KO sans atteindre immédiatement le score de victoire', () => {
      const game = createGame()
      const host = game.players[hostSocketId]
      const guest = game.players[guestSocketId]

      host.activeCard = host.hand.shift() ?? null
      guest.activeCard = guest.hand.shift() ?? null

      if (!host.activeCard || !guest.activeCard) {
        throw new Error('Cartes actives manquantes pour le test KO non gagnant')
      }

      host.activeCard.attack = 100
      guest.activeCard.currentHp = 10
      host.score = 0

      const res = applyAttack(roomId, hostSocketId)
      expect(res.ok).toBe(true)
      expect(res.winnerSocketId).toBeUndefined()

      const updated = getGameState(roomId)!
      const updatedHost = updated.players[hostSocketId]
      const updatedGuest = updated.players[guestSocketId]

      expect(updatedHost.score).toBe(1)
      expect(updatedGuest.activeCard).toBeNull()
      expect(updated.winnerSocketId).toBeNull()
    })

    it('applyAttack change le tour si la partie continue sans victoire', () => {
      const game = createGame()
      const host = game.players[hostSocketId]
      const guest = game.players[guestSocketId]

      host.activeCard = host.hand.shift() ?? null
      guest.activeCard = guest.hand.shift() ?? null

      if (!host.activeCard || !guest.activeCard) {
        throw new Error('Cartes actives manquantes pour le test non létal')
      }

      host.activeCard.attack = 5
      guest.activeCard.currentHp = 100

      const res = applyAttack(roomId, hostSocketId)
      expect(res.ok).toBe(true)
      expect(res.winnerSocketId).toBeUndefined()

      const updated = getGameState(roomId)!
      expect(updated.currentPlayerSocketId).toBe(guestSocketId)
      expect(updated.players[guestSocketId].activeCard).not.toBeNull()
    })

    it("applyAttack retourne des erreurs si pas de carte active ou si ce n'est pas le tour", () => {
      const game = createGame()
      const host = game.players[hostSocketId]
      const guest = game.players[guestSocketId]

      // Aucun joueur na de carte active
      const noActive = applyAttack(roomId, hostSocketId)
      expect(noActive.ok).toBe(false)

      // Donner une carte active au joueur mais pas à ladversaire
      host.activeCard = host.hand.shift() ?? null
      const noOpponentActive = applyAttack(roomId, hostSocketId)
      expect(noOpponentActive.ok).toBe(false)

      // Donner aussi une carte active à ladversaire, mais changer le joueur courant
      guest.activeCard = guest.hand.shift() ?? null
      game.currentPlayerSocketId = guestSocketId
      const notTurn = applyAttack(roomId, hostSocketId)
      expect(notTurn.ok).toBe(false)
    })

    it('les actions refusent de modifier une partie déjà terminée', () => {
      const game = createGame()
      game.winnerSocketId = hostSocketId

      const drawRes = applyDrawCards(roomId, hostSocketId)
      const playRes = applyPlayCard(roomId, hostSocketId, 0)
      const endTurnRes = applyEndTurn(roomId, hostSocketId)
      const attackRes = applyAttack(roomId, hostSocketId)

      expect(drawRes.ok).toBe(false)
      expect(playRes.ok).toBe(false)
      expect(endTurnRes.ok).toBe(false)
      expect(attackRes.ok).toBe(false)
    })

    it("getGameStateViewForPlayer retourne null si la partie ou le joueur n'existent pas", () => {
      const noGameView = getGameStateViewForPlayer(1234, hostSocketId)
      expect(noGameView).toBeNull()

      createGame()
      const unknownPlayerView = getGameStateViewForPlayer(
        roomId,
        'someone-else',
      )
      expect(unknownPlayerView).toBeNull()

      const game = getGameState(roomId)!
      // Supprimer l'adversaire pour déclencher la branche 'opponent introuvable'
      // eslint-disable-next-line @typescript-eslint/no-dynamic-delete
      delete game.players[guestSocketId]
      const brokenView = getGameStateViewForPlayer(roomId, hostSocketId)
      expect(brokenView).toBeNull()

      const endTurnBroken = applyEndTurn(roomId, hostSocketId)
      expect(endTurnBroken.ok).toBe(false)
    })
  })
})
