import { createServer } from 'http'
import { env } from './env'
import express from 'express'
import cors from 'cors'
import { Server } from 'socket.io'
import { authRouter } from './routes/auth.routes'
import { cardsRouter } from './routes/cards.routes'
import { decksRouter } from './routes/decks.routes'
import { setupSwagger } from './config/swagger'
import { socketAuthMiddleware } from './middlewares/socketAuth.middleware'
import {
  createRoom as createRoomInStore,
  getRoomsList,
  getRoom,
  removeRoom,
  validateDeck,
  getNextRoomId,
  getSocketRoomNameExport,
  startGame,
  getGameState,
  getGameStateViewForPlayer,
  applyDrawCards,
  applyPlayCard,
  applyAttack,
  applyEndTurn,
} from './socket/matchmaking'
import { prisma } from './database'

// Create Express app
export const app = express()

// Middlewares
app.use(
  cors({
    origin: true, // Autorise toutes les origines
    credentials: true,
  }),
)

// Middleware pour parser le JSON dans le body
app.use(express.json())

// Sert les fichiers statiques du dossier public
app.use(express.static('public'))

// Configuration Swagger
setupSwagger(app)

// Auth routes
app.use('/api/auth', authRouter)

// Cards routes
app.use('/api/cards', cardsRouter)

// Decks routes
app.use('/api/decks', decksRouter)

// Root endpoint pour y accéder par docker compose
app.get('/', (_req, res) => {
  res.json({
    message: 'TCG Backend API',
    version: '1.0.0',
    endpoints: {
      health: '/api/health',
      auth: '/api/auth',
      cards: '/api/cards',
      decks: '/api/decks',
      docs: '/api-docs',
    },
  })
})

// Health check endpoint
app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok', message: 'TCG Backend Server is running' })
})

// Start server only if this file is run directly (not imported for tests)
if (require.main === module) {
  const httpServer = createServer(app)
  const io = new Server(httpServer)

  io.use(socketAuthMiddleware)
  io.on('connection', (socket) => {
    const userId = socket.data.userId as number
    if (userId == null) return

    socket.on('createRoom', async (payload: { deckId?: number }) => {
      const deckId = payload?.deckId != null ? Number(payload.deckId) : NaN
      const validated = await validateDeck(userId, deckId)
      if (!validated.ok) {
        socket.emit('error', { message: validated.error })
        return
      }

      const user = await prisma.user.findUnique({
        where: { id: userId },
        select: { username: true },
      })
      const hostUsername = user?.username ?? ''

      const roomId = getNextRoomId()
      const socketRoomName = getSocketRoomNameExport(roomId)
      createRoomInStore({
        roomId,
        hostUserId: userId,
        hostUsername,
        hostSocketId: socket.id,
        deckId: validated.deck.id,
      })
      socket.join(socketRoomName)

      socket.emit('roomCreated', {
        id: roomId,
        hostUsername,
        deckId: validated.deck.id,
      })
      io.emit('roomsListUpdated', getRoomsList())
    })

    socket.on('getRooms', () => {
      socket.emit('roomsList', getRoomsList())
    })

    socket.on(
      'joinRoom',
      async (payload: { roomId?: number; deckId?: number }) => {
        const roomId = payload?.roomId != null ? Number(payload.roomId) : NaN
        const deckId = payload?.deckId != null ? Number(payload.deckId) : NaN
        if (isNaN(roomId)) {
          socket.emit('error', { message: 'Room invalide' })
          return
        }

        const validated = await validateDeck(userId, deckId)
        if (!validated.ok) {
          socket.emit('error', { message: validated.error })
          return
        }

        const room = getRoom(roomId)
        if (!room) {
          socket.emit('error', { message: "La room n'existe pas" })
          return
        }
        if (room.hostSocketId === socket.id) {
          socket.emit('error', {
            message: 'Vous êtes déjà le host de cette room',
          })
          return
        }

        const hostDeck = await prisma.deck.findFirst({
          where: { id: room.deckId, userId: room.hostUserId },
          include: { deckCards: { include: { card: true } } },
        })
        if (!hostDeck || hostDeck.deckCards.length !== 10) {
          socket.emit('error', { message: 'Deck du host invalide' })
          return
        }

        const user = await prisma.user.findUnique({
          where: { id: userId },
          select: { username: true },
        })

        const guestUsername = user?.username ?? ''

        const game = startGame({
          roomId,
          socketRoomName: room.socketRoomName,
          hostSocketId: room.hostSocketId,
          hostUserId: room.hostUserId,
          hostUsername: room.hostUsername,
          hostDeckCards: hostDeck.deckCards,
          guestSocketId: socket.id,
          guestUserId: userId,
          guestUsername,
          guestDeckCards: validated.deck.deckCards as { card: unknown }[],
        })

        removeRoom(roomId)
        socket.join(room.socketRoomName)

        const hostSocket = io.sockets.sockets.get(room.hostSocketId)
        if (hostSocket) {
          const hostView = getGameStateViewForPlayer(
            game.roomId,
            room.hostSocketId,
          )
          if (hostView) {
            hostSocket.emit('gameStarted', hostView)
          }
        }

        const guestView = getGameStateViewForPlayer(game.roomId, socket.id)
        if (guestView) {
          socket.emit('gameStarted', guestView)
        }

        io.emit('roomsListUpdated', getRoomsList())
      },
    )

    socket.on('drawCards', (payload: { roomId?: number }) => {
      const roomId = payload?.roomId != null ? Number(payload.roomId) : NaN
      if (Number.isNaN(roomId)) {
        socket.emit('error', { message: 'Room invalide' })
        return
      }

      const result = applyDrawCards(roomId, socket.id)
      if (!result.ok) {
        socket.emit('error', { message: result.error })
        return
      }

      const game = getGameState(roomId)
      if (!game) return

      Object.keys(game.players).forEach((socketId) => {
        const target = io.sockets.sockets.get(socketId)
        const view = getGameStateViewForPlayer(roomId, socketId)
        if (target && view) {
          target.emit('gameStateUpdated', view)
        }
      })
    })

    socket.on(
      'playCard',
      (payload: { roomId?: number; cardIndex?: number }) => {
        const roomId = payload?.roomId != null ? Number(payload.roomId) : NaN
        const cardIndex =
          payload?.cardIndex != null ? Number(payload.cardIndex) : NaN

        if (Number.isNaN(roomId)) {
          socket.emit('error', { message: 'Room invalide' })
          return
        }

        const result = applyPlayCard(roomId, socket.id, cardIndex)
        if (!result.ok) {
          socket.emit('error', { message: result.error })
          return
        }

        const game = getGameState(roomId)
        if (!game) return

        Object.keys(game.players).forEach((socketId) => {
          const target = io.sockets.sockets.get(socketId)
          const view = getGameStateViewForPlayer(roomId, socketId)
          if (target && view) {
            target.emit('gameStateUpdated', view)
          }
        })
      },
    )

    socket.on('attack', (payload: { roomId?: number }) => {
      const roomId = payload?.roomId != null ? Number(payload.roomId) : NaN
      if (Number.isNaN(roomId)) {
        socket.emit('error', { message: 'Room invalide' })
        return
      }

      const result = applyAttack(roomId, socket.id)
      if (!result.ok) {
        socket.emit('error', { message: result.error })
        return
      }

      const game = getGameState(roomId)
      if (!game) return

      Object.keys(game.players).forEach((socketId) => {
        const target = io.sockets.sockets.get(socketId)
        const view = getGameStateViewForPlayer(roomId, socketId)
        if (target && view) {
          target.emit('gameStateUpdated', view)
        }
      })

      if (result.winnerSocketId) {
        Object.keys(game.players).forEach((socketId) => {
          const target = io.sockets.sockets.get(socketId)
          const view = getGameStateViewForPlayer(roomId, socketId)
          if (target && view) {
            target.emit('gameEnded', {
              ...view,
              winnerSocketId: result.winnerSocketId,
            })
          }
        })
      }
    })

    socket.on('endTurn', (payload: { roomId?: number }) => {
      const roomId = payload?.roomId != null ? Number(payload.roomId) : NaN
      if (Number.isNaN(roomId)) {
        socket.emit('error', { message: 'Room invalide' })
        return
      }

      const result = applyEndTurn(roomId, socket.id)
      if (!result.ok) {
        socket.emit('error', { message: result.error })
        return
      }

      const game = getGameState(roomId)
      if (!game) return

      Object.keys(game.players).forEach((socketId) => {
        const target = io.sockets.sockets.get(socketId)
        const view = getGameStateViewForPlayer(roomId, socketId)
        if (target && view) {
          target.emit('gameStateUpdated', view)
        }
      })
    })
  })

  try {
    httpServer.listen(Number(env.PORT), '0.0.0.0', () => {
      console.log(`\n🚀 Server is running on http://0.0.0.0:${env.PORT}`)
      console.log(
        `🧪 Socket.io Test Client available at http://0.0.0.0:${env.PORT}`,
      )
    })
  } catch (error) {
    console.error('Failed to start server:', error)
    process.exit(1)
  }
}
