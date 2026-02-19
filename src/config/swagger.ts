import { readFileSync } from 'fs'
import { join } from 'path'
import yaml from 'js-yaml'
import swaggerUi from 'swagger-ui-express'
import { Express } from 'express'

/**
 * Charge et agrège toutes les documentations Swagger
 * @returns La spécification OpenAPI complète
 */
function loadSwaggerSpec() {
  // Charger la configuration principale
  const configPath = join(__dirname, '../../swagger.config.yml')
  const configContent = readFileSync(configPath, 'utf-8')
  const config = yaml.load(configContent) as any

  // Charger les documentations par module
  const authDocPath = join(__dirname, '../../docs/auth.doc.yml')
  const authDocContent = readFileSync(authDocPath, 'utf-8')
  const authDoc = yaml.load(authDocContent) as any

  const cardDocPath = join(__dirname, '../../docs/card.doc.yml')
  const cardDocContent = readFileSync(cardDocPath, 'utf-8')
  const cardDoc = yaml.load(cardDocContent) as any

  const deckDocPath = join(__dirname, '../../docs/deck.doc.yml')
  const deckDocContent = readFileSync(deckDocPath, 'utf-8')
  const deckDoc = yaml.load(deckDocContent) as any

  // Fusionner les paths
  config.paths = {
    ...authDoc.paths,
    ...cardDoc.paths,
    ...deckDoc.paths,
  }

  return config
}

/**
 * Configure Swagger UI pour l'application Express
 * @param app - L'application Express
 */
export function setupSwagger(app: Express) {
  const swaggerSpec = loadSwaggerSpec()

  // Route pour la spécification OpenAPI en JSON
  app.get('/api-docs.json', (_req, res) => {
    res.setHeader('Content-Type', 'application/json')
    res.send(swaggerSpec)
  })

  // Configuration de Swagger UI
  const swaggerUiOptions = {
    customCss: '.swagger-ui .topbar { display: none }',
    customSiteTitle: 'TCG Backend API Documentation',
  }

  // Route pour Swagger UI
  app.use(
    '/api-docs',
    swaggerUi.serve,
    swaggerUi.setup(swaggerSpec, swaggerUiOptions),
  )
}
