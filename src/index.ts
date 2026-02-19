import { createServer } from 'http'
import { env } from './env'
import express from 'express'
import cors from 'cors'
import { authRouter } from './routes/auth.routes'
import { cardsRouter } from './routes/cards.routes'
import { decksRouter } from './routes/decks.routes'
import { setupSwagger } from './config/swagger'

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
  // Create HTTP server
  const httpServer = createServer(app)

  // Start server
  try {
    httpServer.listen(env.PORT, '0.0.0.0', () => {
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
