import { describe, it, expect, vi, beforeEach } from 'vitest'
import { socketAuthMiddleware } from '../src/middlewares/socketAuth.middleware'
import jwt from 'jsonwebtoken'
import type { Socket } from 'socket.io'
import type { ExtendedError } from 'socket.io/dist/namespace'

vi.mock('jsonwebtoken')
vi.mock('../src/env', () => ({
  env: { JWT_SECRET: 'test-secret' },
}))

describe('socketAuthMiddleware', () => {
  let mockSocket: Partial<Socket>
  let next: (err?: ExtendedError) => void

  beforeEach(() => {
    vi.clearAllMocks()
    mockSocket = {
      handshake: { auth: {} },
      data: {},
    }
    next = vi.fn()
  })

  it('appelle next avec erreur si pas de token', () => {
    socketAuthMiddleware(mockSocket as Socket, next)
    expect(next).toHaveBeenCalledWith(expect.any(Error))
    expect((next as ReturnType<typeof vi.fn>).mock.calls[0][0].message).toBe(
      'Authentication error',
    )
  })

  it('appelle next avec erreur si token nest pas une string', () => {
    mockSocket.handshake!.auth = { token: 123 }
    socketAuthMiddleware(mockSocket as Socket, next)
    expect(next).toHaveBeenCalledWith(expect.any(Error))
    expect((next as ReturnType<typeof vi.fn>).mock.calls[0][0].message).toBe(
      'Authentication error',
    )
  })

  it('remplit socket.data et appelle next() si token valide', () => {
    mockSocket.handshake!.auth = { token: 'valid-jwt' }
    vi.mocked(jwt.verify).mockReturnValue({
      userId: 42,
      email: 'u@test.com',
    } as never)
    socketAuthMiddleware(mockSocket as Socket, next)
    expect(mockSocket.data!.userId).toBe(42)
    expect(mockSocket.data!.email).toBe('u@test.com')
    expect(next).toHaveBeenCalledWith()
  })

  it('appelle next avec erreur si token invalide ou expiré', () => {
    mockSocket.handshake!.auth = { token: 'bad-jwt' }
    vi.mocked(jwt.verify).mockImplementation(() => {
      throw new Error('invalid')
    })
    socketAuthMiddleware(mockSocket as Socket, next)
    expect(next).toHaveBeenCalledWith(expect.any(Error))
    expect((next as ReturnType<typeof vi.fn>).mock.calls[0][0].message).toBe(
      'Invalid or expired token',
    )
  })
})
