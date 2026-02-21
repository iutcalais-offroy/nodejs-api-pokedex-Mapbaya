import type { ExtendedError } from 'socket.io/dist/namespace'
import jwt from 'jsonwebtoken'
import type { Socket } from 'socket.io'
import { env } from '../env'

interface JwtPayload {
  userId: number
  email: string
  iat?: number
  exp?: number
}

/**
 * Middleware d'authentification JWT pour les connexions Socket.io.
 * Vérifie le token dans socket.handshake.auth.token et injecte userId/email dans le socket.
 * Connexion refusée sans token ou avec token invalide.
 */
export function socketAuthMiddleware(
  socket: Socket,
  next: (err?: ExtendedError) => void,
): void {
  const token = socket.handshake.auth?.token

  if (!token || typeof token !== 'string') {
    next(new Error('Authentication error'))
    return
  }

  try {
    const decoded = jwt.verify(token, env.JWT_SECRET) as JwtPayload
    socket.data.userId = decoded.userId
    socket.data.email = decoded.email
    next()
  } catch {
    next(new Error('Invalid or expired token'))
  }
}
