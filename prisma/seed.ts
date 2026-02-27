import bcrypt from 'bcryptjs'
import { readFileSync } from 'fs'
import { join } from 'path'
import { PrismaClient } from '../src/generated/prisma/client'
import { PrismaPg } from '@prisma/adapter-pg'
import dotenv from 'dotenv'

dotenv.config()

// Create Prisma client for seed
const adapter = new PrismaPg({
  connectionString: process.env.DATABASE_URL,
})
const prisma = new PrismaClient({ adapter })

import { CardModel } from '../src/generated/prisma/models/Card'
import { PokemonType } from '../src/generated/prisma/enums'

async function main() {
  console.log('Starting database seed...')

  await prisma.card.deleteMany()
  await prisma.user.deleteMany()
  await prisma.deckCard.deleteMany()
  await prisma.deck.deleteMany()

  const hashedPassword = await bcrypt.hash('password123', 10)

  await prisma.user.createMany({
    data: [
      {
        username: 'red',
        email: 'red@example.com',
        password: hashedPassword,
      },
      {
        username: 'blue',
        email: 'blue@example.com',
        password: hashedPassword,
      },
    ],
  })

  const redUser = await prisma.user.findUnique({
    where: { email: 'red@example.com' },
  })
  const blueUser = await prisma.user.findUnique({
    where: { email: 'blue@example.com' },
  })

  if (!redUser || !blueUser) {
    throw new Error('Failed to create users')
  }

  console.log('Created users:', redUser.username, blueUser.username)

  // Try multiple paths for pokemon.json (works in both local and Docker environments)
  const possiblePaths = [
    join(__dirname, 'data', 'pokemon.json'),
    join(process.cwd(), 'prisma', 'data', 'pokemon.json'),
    join(process.cwd(), 'data', 'pokemon.json'),
  ]
  let pokemonDataPath: string | null = null
  for (const path of possiblePaths) {
    try {
      readFileSync(path, 'utf-8')
      pokemonDataPath = path
      break
    } catch {
      // Continue to next path
    }
  }
  if (!pokemonDataPath) {
    throw new Error(
      `pokemon.json not found. Tried: ${possiblePaths.join(', ')}`,
    )
  }
  const pokemonJson = readFileSync(pokemonDataPath, 'utf-8')
  const pokemonData: CardModel[] = JSON.parse(pokemonJson)

  const createdCards = await Promise.all(
    pokemonData.map((pokemon) =>
      prisma.card.create({
        data: {
          name: pokemon.name,
          hp: pokemon.hp,
          attack: pokemon.attack,
          type: PokemonType[pokemon.type as keyof typeof PokemonType],
          pokedexNumber: pokemon.pokedexNumber,
          imgUrl: `https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/other/official-artwork/${pokemon.pokedexNumber}.png`,
        },
      }),
    ),
  )

  console.log(`Created ${pokemonData.length} Pokemon cards`)

  // Fonction générique pour sélectionner aléatoirement un certain nombre de cartes
  function getRandomCards<T>(cards: T[], count: number): T[] {
    const shuffled = [...cards].sort(() => Math.random() - 0.5)
    return shuffled.slice(0, count)
  }

  // Créer un deck "Starter Deck" pour red
  const redDeck = await prisma.deck.create({
    data: {
      name: 'Starter Deck',
      userId: redUser.id,
    },
  })

  const redCards = getRandomCards(createdCards, 10)
  await prisma.deckCard.createMany({
    data: redCards.map((card) => ({
      deckId: redDeck.id,
      cardId: card.id,
    })),
  })

  console.log(`Created "Starter Deck" for ${redUser.username} with 10 cards`)

  // Créer un deck "Starter Deck" pour blue
  const blueDeck = await prisma.deck.create({
    data: {
      name: 'Starter Deck',
      userId: blueUser.id,
    },
  })

  const blueCards = getRandomCards(createdCards, 10)
  await prisma.deckCard.createMany({
    data: blueCards.map((card) => ({
      deckId: blueDeck.id,
      cardId: card.id,
    })),
  })

  console.log(`Created "Starter Deck" for ${blueUser.username} with 10 cards`)

  console.log('Database seeding completed.')
}

main()
  .catch((e) => {
    console.error('❌ Error seeding database:', e)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
