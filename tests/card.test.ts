import { describe, it, expect, beforeEach, vi } from 'vitest'
import request from 'supertest'
import { app } from '../src/index'
import { prismaMock } from './vitest.setup'
import jwt from 'jsonwebtoken'

// Mock de jwt et env
vi.mock('jsonwebtoken')
vi.mock('../src/env', () => ({
  env: {
    JWT_SECRET: 'test-secret',
    PORT: 3001,
    DATABASE_URL: 'test-url',
    NODE_ENV: 'test',
  },
}))

describe('GET /api/cards', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('devrait retourner toutes les cartes triées par pokedexNumber avec 200', async () => {
    // Données de test : cartes triées par pokedexNumber
    const mockCards = [
      {
        id: 1,
        name: 'Bulbasaur',
        hp: 45,
        attack: 49,
        type: 'Grass',
        pokedexNumber: 1,
        imgUrl: 'https://example.com/1.png',
        createdAt: new Date(),
        updatedAt: new Date(),
      },
      {
        id: 2,
        name: 'Charmander',
        hp: 39,
        attack: 52,
        type: 'Fire',
        pokedexNumber: 4,
        imgUrl: 'https://example.com/4.png',
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    ]

    // Mock Prisma : retourner les cartes triées
    prismaMock.card.findMany.mockResolvedValue(mockCards)

    const response = await request(app).get('/api/cards')

    expect(response.status).toBe(200)
    expect(response.body.length).toBe(2)
    // Vérifier les propriétés principales (les dates sont sérialisées en strings par Express)
    expect(response.body[0].id).toBe(mockCards[0].id)
    expect(response.body[0].name).toBe(mockCards[0].name)
    expect(response.body[0].pokedexNumber).toBe(mockCards[0].pokedexNumber)
    expect(response.body[1].id).toBe(mockCards[1].id)
    expect(response.body[1].name).toBe(mockCards[1].name)
    expect(response.body[1].pokedexNumber).toBe(mockCards[1].pokedexNumber)
    // Vérifier que les cartes sont triées par pokedexNumber
    expect(response.body[0].pokedexNumber).toBeLessThanOrEqual(
      response.body[1].pokedexNumber,
    )
  })

  it("devrait retourner une liste vide si aucune carte n'existe", async () => {
    // Mock Prisma : aucune carte
    prismaMock.card.findMany.mockResolvedValue([])

    // Mock jwt : vérifier le token
    vi.mocked(jwt.verify).mockReturnValue({
      userId: 1,
      email: 'test@example.com',
    } as never)

    const response = await request(app)
      .get('/api/cards')
      .set('Authorization', 'Bearer fake_token')

    expect(response.status).toBe(200)
    expect(response.body).toEqual([])
  })

  it("devrait retourner 500 en cas d'erreur serveur", async () => {
    // Mock Prisma : simuler une erreur
    prismaMock.card.findMany.mockRejectedValue(new Error('Database error'))

    const response = await request(app).get('/api/cards')

    expect(response.status).toBe(500)
    expect(response.body).toHaveProperty('error')
  })
})
