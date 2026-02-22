import { describe, it, expect } from 'vitest'
import request from 'supertest'
import { app } from '../src/index'

describe('GET /api-docs.json', () => {
  it('retourne la spec OpenAPI en JSON', async () => {
    const res = await request(app)
      .get('/api-docs.json')
      .expect(200)
      .expect('Content-Type', /json/)
    expect(res.body).toBeTypeOf('object')
    expect(res.body).toHaveProperty('paths')
  })
})
