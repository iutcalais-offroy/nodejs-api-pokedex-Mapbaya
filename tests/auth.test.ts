import { describe, it, expect, beforeEach, vi } from 'vitest'
import request from 'supertest'
import { app } from '../src/index'
import { prismaMock } from './vitest.setup'
import bcrypt from 'bcryptjs'
import jwt from 'jsonwebtoken'

// Mock de bcrypt, jwt et env
vi.mock('bcryptjs')
vi.mock('jsonwebtoken')
vi.mock('../src/env', () => ({
  env: {
    JWT_SECRET: 'test-secret',
    PORT: 3001,
    DATABASE_URL: 'test-url',
    NODE_ENV: 'test',
  },
}))

describe('POST /api/auth/sign-up', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('devrait créer un utilisateur avec succès et retourner 201', async () => {
    // Données de test
    const userData = {
      email: 'test@example.com',
      username: 'testuser',
      password: 'password123',
    }

    const hashedPassword = 'hashed_password'
    const token = 'fake_token'
    const createdUser = {
      id: 1,
      email: userData.email,
      username: userData.username,
      password: hashedPassword,
      createdAt: new Date(),
      updatedAt: new Date(),
    }

    // Mock Prisma : vérifier que l'email n'existe pas déjà
    prismaMock.user.findUnique.mockResolvedValue(null)

    // Mock bcrypt : hasher le mot de passe
    vi.mocked(bcrypt.hash).mockResolvedValue(hashedPassword as never)

    // Mock Prisma : créer l'utilisateur
    prismaMock.user.create.mockResolvedValue(createdUser)

    // Mock jwt : générer un token
    vi.mocked(jwt.sign).mockReturnValue(token)

    // Faire la requête
    const response = await request(app).post('/api/auth/sign-up').send(userData)

    // Vérifier la réponse
    expect(response.status).toBe(201)
    expect(response.body).toHaveProperty('token', token)
    expect(response.body).toHaveProperty('user')
    expect(response.body.user).not.toHaveProperty('password')
    expect(response.body.user.email).toBe(userData.email)
    expect(response.body.user.username).toBe(userData.username)
  })

  it('devrait retourner 400 si des données sont manquantes', async () => {
    const response = await request(app).post('/api/auth/sign-up').send({
      email: 'test@example.com',
      // username et password manquants
    })

    expect(response.status).toBe(400)
    expect(response.body).toHaveProperty('error')
  })

  it("devrait retourner 409 si l'email existe déjà", async () => {
    const userData = {
      email: 'existing@example.com',
      username: 'testuser',
      password: 'password123',
    }

    // Mock Prisma : l'email existe déjà
    prismaMock.user.findUnique.mockResolvedValue({
      id: 1,
      email: userData.email,
      username: 'existing',
      password: 'hash',
      createdAt: new Date(),
      updatedAt: new Date(),
    })

    const response = await request(app).post('/api/auth/sign-up').send(userData)

    expect(response.status).toBe(409)
    expect(response.body).toHaveProperty('error')
  })

  it("devrait retourner 500 en cas d'erreur serveur", async () => {
    const userData = {
      email: 'test@example.com',
      username: 'testuser',
      password: 'password123',
    }

    // Mock Prisma : simuler une erreur
    prismaMock.user.findUnique.mockRejectedValue(new Error('Database error'))

    const response = await request(app).post('/api/auth/sign-up').send(userData)

    expect(response.status).toBe(500)
    expect(response.body).toHaveProperty('error')
  })
})

describe('POST /api/auth/sign-in', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('devrait connecter un utilisateur avec succès et retourner 200', async () => {
    const loginData = {
      email: 'test@example.com',
      password: 'password123',
    }

    const hashedPassword = 'hashed_password'
    const token = 'fake_token'
    const user = {
      id: 1,
      email: loginData.email,
      username: 'testuser',
      password: hashedPassword,
      createdAt: new Date(),
      updatedAt: new Date(),
    }

    // Mock Prisma : trouver l'utilisateur
    prismaMock.user.findUnique.mockResolvedValue(user)

    // Mock bcrypt : vérifier que le mot de passe est correct
    vi.mocked(bcrypt.compare).mockResolvedValue(true as never)

    // Mock jwt : générer un token
    vi.mocked(jwt.sign).mockReturnValue(token)

    const response = await request(app)
      .post('/api/auth/sign-in')
      .send(loginData)

    expect(response.status).toBe(200)
    expect(response.body).toHaveProperty('token', token)
    expect(response.body).toHaveProperty('user')
    expect(response.body.user).not.toHaveProperty('password')
  })

  it('devrait retourner 400 si des données sont manquantes', async () => {
    const response = await request(app).post('/api/auth/sign-in').send({
      email: 'test@example.com',
      // password manquant
    })

    expect(response.status).toBe(400)
    expect(response.body).toHaveProperty('error')
  })

  it("devrait retourner 401 si l'email n'existe pas", async () => {
    const loginData = {
      email: 'nonexistent@example.com',
      password: 'password123',
    }

    // Mock Prisma : l'utilisateur n'existe pas
    prismaMock.user.findUnique.mockResolvedValue(null)

    const response = await request(app)
      .post('/api/auth/sign-in')
      .send(loginData)

    expect(response.status).toBe(401)
    expect(response.body).toHaveProperty('error')
  })

  it('devrait retourner 401 si le mot de passe est incorrect', async () => {
    const loginData = {
      email: 'test@example.com',
      password: 'wrongpassword',
    }

    const user = {
      id: 1,
      email: loginData.email,
      username: 'testuser',
      password: 'hashed_password',
      createdAt: new Date(),
      updatedAt: new Date(),
    }

    // Mock Prisma : trouver l'utilisateur
    prismaMock.user.findUnique.mockResolvedValue(user)

    // Mock bcrypt : le mot de passe est incorrect
    vi.mocked(bcrypt.compare).mockResolvedValue(false as never)

    const response = await request(app)
      .post('/api/auth/sign-in')
      .send(loginData)

    expect(response.status).toBe(401)
    expect(response.body).toHaveProperty('error')
  })

  it("devrait retourner 500 en cas d'erreur serveur", async () => {
    const loginData = {
      email: 'test@example.com',
      password: 'password123',
    }

    // Mock Prisma : simuler une erreur
    prismaMock.user.findUnique.mockRejectedValue(new Error('Database error'))

    const response = await request(app)
      .post('/api/auth/sign-in')
      .send(loginData)

    expect(response.status).toBe(500)
    expect(response.body).toHaveProperty('error')
  })
})
