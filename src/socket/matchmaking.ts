import { prisma } from '../database'
import { calculateDamage } from '../utils/rules.util'
import type { PokemonType } from '../generated/prisma/client'

const DECK_SIZE = 10
const HAND_SIZE = 5
const WINNING_SCORE = 3

export interface WaitingRoom {
  id: number
  hostUserId: number
  hostUsername: string
  hostSocketId: string
  deckId: number
  socketRoomName: string
}

export interface GameCard {
  id: number
  name: string
  hp: number
  attack: number
  type: PokemonType
  pokedexNumber: number
  imgUrl: string | null
  currentHp: number
}

export interface PlayerGameState {
  socketId: string
  userId: number
  username: string
  deck: GameCard[]
  hand: GameCard[]
  activeCard: GameCard | null
  score: number
}

export interface GameState {
  roomId: number
  socketRoomName: string
  players: Record<string, PlayerGameState>
  currentPlayerSocketId: string
  winnerSocketId: string | null
}

const rooms = new Map<number, WaitingRoom>()
const gameStates = new Map<number, GameState>()
let nextRoomId = 1

/** Réinitialise l'état du matchmaking et des parties (pour les tests). */
export function resetMatchmakingState(): void {
  rooms.clear()
  gameStates.clear()
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

function deckCardsToGameCards(deckCards: { card: unknown }[]): GameCard[] {
  return deckCards.map((dc) => {
    const card = dc.card as {
      id: number
      name: string
      hp: number
      attack: number
      type: PokemonType
      pokedexNumber: number
      imgUrl: string | null
    }

    return {
      id: card.id,
      name: card.name,
      hp: card.hp,
      attack: card.attack,
      type: card.type,
      pokedexNumber: card.pokedexNumber,
      imgUrl: card.imgUrl,
      currentHp: card.hp,
    }
  })
}

export function getGameState(roomId: number): GameState | undefined {
  return gameStates.get(roomId)
}

function requireGameAndPlayer(
  roomId: number,
  playerSocketId: string,
): { game: GameState; player: PlayerGameState; opponent: PlayerGameState } | {
  error: string
} {
  const game = gameStates.get(roomId)
  if (!game) {
    return { error: 'La partie nexiste pas' }
  }

  const player = game.players[playerSocketId]
  if (!player) {
    return { error: 'Vous ne participez pas à cette partie' }
  }

  const opponentEntry = Object.values(game.players).find(
    (p) => p.socketId !== playerSocketId,
  )
  if (!opponentEntry) {
    return { error: 'Adversaire introuvable pour cette partie' }
  }

  return { game, player, opponent: opponentEntry }
}

export function startGame(options: {
  roomId: number
  socketRoomName: string
  hostSocketId: string
  hostUserId: number
  hostUsername: string
  hostDeckCards: { card: unknown }[]
  guestSocketId: string
  guestUserId: number
  guestUsername: string
  guestDeckCards: { card: unknown }[]
}): GameState {
  const hostDeck = shuffle(deckCardsToGameCards(options.hostDeckCards))
  const guestDeck = shuffle(deckCardsToGameCards(options.guestDeckCards))

  const hostHand = hostDeck.splice(0, HAND_SIZE)
  const guestHand = guestDeck.splice(0, HAND_SIZE)

  const hostPlayer: PlayerGameState = {
    socketId: options.hostSocketId,
    userId: options.hostUserId,
    username: options.hostUsername,
    deck: hostDeck,
    hand: hostHand,
    activeCard: null,
    score: 0,
  }

  const guestPlayer: PlayerGameState = {
    socketId: options.guestSocketId,
    userId: options.guestUserId,
    username: options.guestUsername,
    deck: guestDeck,
    hand: guestHand,
    activeCard: null,
    score: 0,
  }

  const game: GameState = {
    roomId: options.roomId,
    socketRoomName: options.socketRoomName,
    players: {
      [hostPlayer.socketId]: hostPlayer,
      [guestPlayer.socketId]: guestPlayer,
    },
    currentPlayerSocketId: hostPlayer.socketId,
    winnerSocketId: null,
  }

  gameStates.set(options.roomId, game)
  return game
}

export interface PublicGameStateView {
  roomId: number
  currentPlayerSocketId: string
  you: {
    socketId: string
    username: string
    score: number
    hand: GameCard[]
    activeCard: GameCard | null
    deckCount: number
  }
  opponent: {
    socketId: string
    username: string
    score: number
    activeCard: GameCard | null
    handCount: number
    deckCount: number
  }
}

export function getGameStateViewForPlayer(
  roomId: number,
  viewerSocketId: string,
): PublicGameStateView | null {
  const game = gameStates.get(roomId)
  if (!game) return null

  const viewer = game.players[viewerSocketId]
  if (!viewer) return null

  const opponent = Object.values(game.players).find(
    (p) => p.socketId !== viewerSocketId,
  )
  if (!opponent) return null

  return {
    roomId: game.roomId,
    currentPlayerSocketId: game.currentPlayerSocketId,
    you: {
      socketId: viewer.socketId,
      username: viewer.username,
      score: viewer.score,
      hand: viewer.hand,
      activeCard: viewer.activeCard,
      deckCount: viewer.deck.length,
    },
    opponent: {
      socketId: opponent.socketId,
      username: opponent.username,
      score: opponent.score,
      activeCard: opponent.activeCard,
      handCount: opponent.hand.length,
      deckCount: opponent.deck.length,
    },
  }
}

export function applyDrawCards(
  roomId: number,
  playerSocketId: string,
): { ok: true } | { ok: false; error: string } {
  const result = requireGameAndPlayer(roomId, playerSocketId)
  if ('error' in result) {
    return { ok: false, error: result.error }
  }

  const { game, player } = result

  if (game.winnerSocketId) {
    return { ok: false, error: 'La partie est déjà terminée' }
  }

  if (game.currentPlayerSocketId !== playerSocketId) {
    return { ok: false, error: "Ce n'est pas votre tour" }
  }

  while (player.hand.length < HAND_SIZE && player.deck.length > 0) {
    const card = player.deck.shift() as GameCard
    player.hand.push(card)
  }

  return { ok: true }
}

export function applyPlayCard(
  roomId: number,
  playerSocketId: string,
  cardIndex: number,
): { ok: true } | { ok: false; error: string } {
  const result = requireGameAndPlayer(roomId, playerSocketId)
  if ('error' in result) {
    return { ok: false, error: result.error }
  }

  const { game, player } = result

  if (game.winnerSocketId) {
    return { ok: false, error: 'La partie est déjà terminée' }
  }

  if (game.currentPlayerSocketId !== playerSocketId) {
    return { ok: false, error: "Ce n'est pas votre tour" }
  }

  if (
    Number.isNaN(cardIndex) ||
    cardIndex < 0 ||
    cardIndex >= player.hand.length
  ) {
    return { ok: false, error: 'Index de carte invalide' }
  }

  const [card] = player.hand.splice(cardIndex, 1)
  if (player.activeCard) {
    // Remet l'ancienne carte active dans la main pour respecter la limite de 1 carte sur le terrain
    player.hand.push(player.activeCard)
  }

  player.activeCard = card
  return { ok: true }
}

export function applyEndTurn(
  roomId: number,
  playerSocketId: string,
): { ok: true } | { ok: false; error: string } {
  const result = requireGameAndPlayer(roomId, playerSocketId)
  if ('error' in result) {
    return { ok: false, error: result.error }
  }

  const { game, player, opponent } = result

  if (game.winnerSocketId) {
    return { ok: false, error: 'La partie est déjà terminée' }
  }

  if (game.currentPlayerSocketId !== playerSocketId) {
    return { ok: false, error: "Ce n'est pas votre tour" }
  }

  game.currentPlayerSocketId = opponent.socketId
  return { ok: true }
}

export function applyAttack(
  roomId: number,
  playerSocketId: string,
): { ok: true; winnerSocketId?: string } | { ok: false; error: string } {
  const result = requireGameAndPlayer(roomId, playerSocketId)
  if ('error' in result) {
    return { ok: false, error: result.error }
  }

  const { game, player, opponent } = result

  if (game.winnerSocketId) {
    return { ok: false, error: 'La partie est déjà terminée' }
  }

  if (game.currentPlayerSocketId !== playerSocketId) {
    return { ok: false, error: "Ce n'est pas votre tour" }
  }

  if (!player.activeCard) {
    return { ok: false, error: "Vous n'avez pas de carte active" }
  }

  if (!opponent.activeCard) {
    return { ok: false, error: "L'adversaire n'a pas de carte active" }
  }

  const damage = calculateDamage(
    player.activeCard.attack,
    player.activeCard.type,
    opponent.activeCard.type,
  )

  opponent.activeCard.currentHp -= damage

  if (opponent.activeCard.currentHp <= 0) {
    player.score += 1
    opponent.activeCard = null

    if (player.score >= WINNING_SCORE) {
      game.winnerSocketId = player.socketId
      return { ok: true, winnerSocketId: player.socketId }
    }
  }

  game.currentPlayerSocketId = opponent.socketId
  return { ok: true }
}
