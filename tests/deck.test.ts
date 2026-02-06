import {describe, it, expect, beforeEach, vi} from "vitest";
import request from "supertest";
import {app} from "../src/index";
import {prismaMock} from "./vitest.setup";
import jwt from "jsonwebtoken";
import {Request, Response} from "express";

// Mock de jwt et env
vi.mock("jsonwebtoken");
vi.mock("../src/env", () => ({
    env: {
        JWT_SECRET: "test-secret",
        PORT: 3001,
        DATABASE_URL: "test-url",
        NODE_ENV: "test",
    },
}));

// Mock du middleware authMiddleware pour permettre de tester les lignes défensives
vi.mock("../src/middlewares/auth.middleware", async () => {
    const actual = await vi.importActual<typeof import("../src/middlewares/auth.middleware")>("../src/middlewares/auth.middleware");
    return {
        ...actual,
        authMiddleware: vi.fn((req: Request, res: Response, next: () => void) => {
            // Par défaut, on remplit req.user comme le vrai middleware
            // Mais on peut override dans les tests spécifiques
            if (req.header("Authorization")?.startsWith("Bearer ")) {
                req.user = {
                    userId: 1,
                    email: "test@example.com",
                };
            }
            next();
        }),
    };
});

describe("POST /api/decks", () => {
    beforeEach(async () => {
        vi.clearAllMocks();
        // Réinitialiser le mock du middleware pour qu'il remplisse req.user par défaut
        const {authMiddleware} = await import("../src/middlewares/auth.middleware");
        vi.mocked(authMiddleware).mockImplementation((req: Request, res: Response, next: () => void) => {
            if (req.header("Authorization")?.startsWith("Bearer ")) {
                req.user = {
                    userId: 1,
                    email: "test@example.com",
                };
            }
            next();
        });
    });

    it("devrait créer un deck avec 10 cartes valides et retourner 201", async () => {
        const deckData = {
            name: "My Starter Deck",
            cards: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10],
        };

        // Mock des cartes existantes
        const mockCards = deckData.cards.map((id) => ({
            id,
            name: `Card ${id}`,
            hp: 50,
            attack: 30,
            type: "Normal",
            pokedexNumber: id,
            imgUrl: null,
            createdAt: new Date(),
            updatedAt: new Date(),
        }));

        const createdDeck = {
            id: 1,
            name: deckData.name,
            userId: 1,
            createdAt: new Date(),
            updatedAt: new Date(),
            deckCards: mockCards.map((card) => ({
                id: 1,
                deckId: 1,
                cardId: card.id,
                card,
                createdAt: new Date(),
                updatedAt: new Date(),
            })),
        };

        // Mock jwt : vérifier le token
        vi.mocked(jwt.verify).mockReturnValue({
            userId: 1,
            email: "test@example.com",
        } as never);

        // Mock Prisma : vérifier que les cartes existent
        prismaMock.card.findMany.mockResolvedValue(mockCards);

        // Mock Prisma : créer le deck
        prismaMock.deck.create.mockResolvedValue(createdDeck);

        const response = await request(app)
            .post("/api/decks")
            .set("Authorization", "Bearer fake_token")
            .send(deckData);

        expect(response.status).toBe(201);
        expect(response.body).toHaveProperty("id");
        expect(response.body.name).toBe(deckData.name);
        expect(response.body.deckCards).toHaveLength(10);
    });

    it("devrait retourner 400 si le nom est manquant", async () => {
        vi.mocked(jwt.verify).mockReturnValue({
            userId: 1,
            email: "test@example.com",
        } as never);

        const response = await request(app)
            .post("/api/decks")
            .set("Authorization", "Bearer fake_token")
            .send({
                cards: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10],
            });

        expect(response.status).toBe(400);
        expect(response.body).toHaveProperty("error");
    });

    it("devrait retourner 400 si il n'y a pas exactement 10 cartes", async () => {
        vi.mocked(jwt.verify).mockReturnValue({
            userId: 1,
            email: "test@example.com",
        } as never);

        const response = await request(app)
            .post("/api/decks")
            .set("Authorization", "Bearer fake_token")
            .send({
                name: "My Deck",
                cards: [1, 2, 3], // Seulement 3 cartes
            });

        expect(response.status).toBe(400);
        expect(response.body).toHaveProperty("error");
    });

    it("devrait retourner 400 si certaines cartes n'existent pas", async () => {
        vi.mocked(jwt.verify).mockReturnValue({
            userId: 1,
            email: "test@example.com",
        } as never);

        // Mock Prisma : seulement 5 cartes trouvées sur 10
        prismaMock.card.findMany.mockResolvedValue([
            {id: 1, name: "Card 1", hp: 50, attack: 30, type: "Normal", pokedexNumber: 1, imgUrl: null, createdAt: new Date(), updatedAt: new Date()},
            {id: 2, name: "Card 2", hp: 50, attack: 30, type: "Normal", pokedexNumber: 2, imgUrl: null, createdAt: new Date(), updatedAt: new Date()},
            {id: 3, name: "Card 3", hp: 50, attack: 30, type: "Normal", pokedexNumber: 3, imgUrl: null, createdAt: new Date(), updatedAt: new Date()},
            {id: 4, name: "Card 4", hp: 50, attack: 30, type: "Normal", pokedexNumber: 4, imgUrl: null, createdAt: new Date(), updatedAt: new Date()},
            {id: 5, name: "Card 5", hp: 50, attack: 30, type: "Normal", pokedexNumber: 5, imgUrl: null, createdAt: new Date(), updatedAt: new Date()},
        ]);

        const response = await request(app)
            .post("/api/decks")
            .set("Authorization", "Bearer fake_token")
            .send({
                name: "My Deck",
                cards: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10],
            });

        expect(response.status).toBe(400);
        expect(response.body).toHaveProperty("error");
    });

    it("devrait retourner 401 si aucun token n'est fourni", async () => {
        const response = await request(app).post("/api/decks").send({
            name: "My Deck",
            cards: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10],
        });

        expect(response.status).toBe(401);
    });

    it("devrait retourner 500 en cas d'erreur serveur", async () => {
        vi.mocked(jwt.verify).mockReturnValue({
            userId: 1,
            email: "test@example.com",
        } as never);

        prismaMock.card.findMany.mockRejectedValue(new Error("Database error"));

        const response = await request(app)
            .post("/api/decks")
            .set("Authorization", "Bearer fake_token")
            .send({
                name: "My Deck",
                cards: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10],
            });

        expect(response.status).toBe(500);
    });

});

describe("GET /api/decks/mine", () => {
    beforeEach(async () => {
        vi.clearAllMocks();
        const {authMiddleware} = await import("../src/middlewares/auth.middleware");
        vi.mocked(authMiddleware).mockImplementation((req: Request, res: Response, next: () => void) => {
            if (req.header("Authorization")?.startsWith("Bearer ")) {
                req.user = {
                    userId: 1,
                    email: "test@example.com",
                };
            }
            next();
        });
    });

    it("devrait retourner tous les decks de l'utilisateur avec 200", async () => {
        const mockDecks = [
            {
                id: 1,
                name: "Deck 1",
                userId: 1,
                createdAt: new Date(),
                updatedAt: new Date(),
                deckCards: [],
            },
            {
                id: 2,
                name: "Deck 2",
                userId: 1,
                createdAt: new Date(),
                updatedAt: new Date(),
                deckCards: [],
            },
        ];

        vi.mocked(jwt.verify).mockReturnValue({
            userId: 1,
            email: "test@example.com",
        } as never);

        prismaMock.deck.findMany.mockResolvedValue(mockDecks);

        const response = await request(app)
            .get("/api/decks/mine")
            .set("Authorization", "Bearer fake_token");

        expect(response.status).toBe(200);
        expect(response.body.length).toBe(2);
        // Vérifier les propriétés principales (les dates sont sérialisées en strings par Express)
        expect(response.body[0].id).toBe(mockDecks[0].id);
        expect(response.body[0].name).toBe(mockDecks[0].name);
        expect(response.body[0].userId).toBe(mockDecks[0].userId);
        expect(response.body[1].id).toBe(mockDecks[1].id);
        expect(response.body[1].name).toBe(mockDecks[1].name);
        expect(response.body[1].userId).toBe(mockDecks[1].userId);
    });

    it("devrait retourner une liste vide si l'utilisateur n'a pas de decks", async () => {
        vi.mocked(jwt.verify).mockReturnValue({
            userId: 1,
            email: "test@example.com",
        } as never);

        prismaMock.deck.findMany.mockResolvedValue([]);

        const response = await request(app)
            .get("/api/decks/mine")
            .set("Authorization", "Bearer fake_token");

        expect(response.status).toBe(200);
        expect(response.body).toEqual([]);
    });

    it("devrait retourner 401 si aucun token n'est fourni", async () => {
        const response = await request(app).get("/api/decks/mine");

        expect(response.status).toBe(401);
    });

    it("devrait retourner 500 en cas d'erreur serveur", async () => {
        vi.mocked(jwt.verify).mockReturnValue({
            userId: 1,
            email: "test@example.com",
        } as never);

        prismaMock.deck.findMany.mockRejectedValue(new Error("Database error"));

        const response = await request(app)
            .get("/api/decks/mine")
            .set("Authorization", "Bearer fake_token");

        expect(response.status).toBe(500);
    });

});

describe("GET /api/decks/:id", () => {
    beforeEach(async () => {
        vi.clearAllMocks();
        const {authMiddleware} = await import("../src/middlewares/auth.middleware");
        vi.mocked(authMiddleware).mockImplementation((req: Request, res: Response, next: () => void) => {
            if (req.header("Authorization")?.startsWith("Bearer ")) {
                req.user = {
                    userId: 1,
                    email: "test@example.com",
                };
            }
            next();
        });
    });

    it("devrait retourner un deck spécifique avec 200", async () => {
        const mockDeck = {
            id: 1,
            name: "My Deck",
            userId: 1,
            createdAt: new Date(),
            updatedAt: new Date(),
            deckCards: [],
        };

        vi.mocked(jwt.verify).mockReturnValue({
            userId: 1,
            email: "test@example.com",
        } as never);

        prismaMock.deck.findUnique.mockResolvedValue(mockDeck);

        const response = await request(app)
            .get("/api/decks/1")
            .set("Authorization", "Bearer fake_token");

        expect(response.status).toBe(200);
        // Vérifier les propriétés principales (les dates sont sérialisées en strings par Express)
        expect(response.body.id).toBe(mockDeck.id);
        expect(response.body.name).toBe(mockDeck.name);
        expect(response.body.userId).toBe(mockDeck.userId);
        expect(response.body.deckCards).toEqual(mockDeck.deckCards);
    });

    it("devrait retourner 404 si le deck n'existe pas", async () => {
        vi.mocked(jwt.verify).mockReturnValue({
            userId: 1,
            email: "test@example.com",
        } as never);

        prismaMock.deck.findUnique.mockResolvedValue(null);

        const response = await request(app)
            .get("/api/decks/999")
            .set("Authorization", "Bearer fake_token");

        expect(response.status).toBe(404);
        expect(response.body).toHaveProperty("error");
    });

    it("devrait retourner 403 si le deck n'appartient pas à l'utilisateur", async () => {
        const mockDeck = {
            id: 1,
            name: "Other User Deck",
            userId: 2, // Autre utilisateur
            createdAt: new Date(),
            updatedAt: new Date(),
            deckCards: [],
        };

        vi.mocked(jwt.verify).mockReturnValue({
            userId: 1, // Utilisateur connecté
            email: "test@example.com",
        } as never);

        prismaMock.deck.findUnique.mockResolvedValue(mockDeck);

        const response = await request(app)
            .get("/api/decks/1")
            .set("Authorization", "Bearer fake_token");

        expect(response.status).toBe(403);
        expect(response.body).toHaveProperty("error");
    });

    it("devrait retourner 400 si l'ID est invalide", async () => {
        vi.mocked(jwt.verify).mockReturnValue({
            userId: 1,
            email: "test@example.com",
        } as never);

        const response = await request(app)
            .get("/api/decks/invalid")
            .set("Authorization", "Bearer fake_token");

        expect(response.status).toBe(400);
        expect(response.body).toHaveProperty("error");
    });

    it("devrait retourner 401 si aucun token n'est fourni", async () => {
        const response = await request(app).get("/api/decks/1");

        expect(response.status).toBe(401);
    });

    it("devrait retourner 500 en cas d'erreur serveur", async () => {
        vi.mocked(jwt.verify).mockReturnValue({
            userId: 1,
            email: "test@example.com",
        } as never);

        prismaMock.deck.findUnique.mockRejectedValue(new Error("Database error"));

        const response = await request(app)
            .get("/api/decks/1")
            .set("Authorization", "Bearer fake_token");

        expect(response.status).toBe(500);
    });

});

describe("PATCH /api/decks/:id", () => {
    beforeEach(async () => {
        vi.clearAllMocks();
        const {authMiddleware} = await import("../src/middlewares/auth.middleware");
        vi.mocked(authMiddleware).mockImplementation((req: Request, res: Response, next: () => void) => {
            if (req.header("Authorization")?.startsWith("Bearer ")) {
                req.user = {
                    userId: 1,
                    email: "test@example.com",
                };
            }
            next();
        });
    });

    it("devrait modifier un deck avec succès et retourner 200", async () => {
        const existingDeck = {
            id: 1,
            name: "Old Name",
            userId: 1,
            createdAt: new Date(),
            updatedAt: new Date(),
        };

        const updatedDeck = {
            id: 1,
            name: "New Name",
            userId: 1,
            createdAt: new Date(),
            updatedAt: new Date(),
            deckCards: [],
        };

        vi.mocked(jwt.verify).mockReturnValue({
            userId: 1,
            email: "test@example.com",
        } as never);

        prismaMock.deck.findUnique.mockResolvedValue(existingDeck);
        prismaMock.deck.update.mockResolvedValue(updatedDeck);

        const response = await request(app)
            .patch("/api/decks/1")
            .set("Authorization", "Bearer fake_token")
            .send({
                name: "New Name",
            });

        expect(response.status).toBe(200);
        expect(response.body.name).toBe("New Name");
    });

    it("devrait modifier les cartes d'un deck avec succès", async () => {
        const existingDeck = {
            id: 1,
            name: "My Deck",
            userId: 1,
            createdAt: new Date(),
            updatedAt: new Date(),
        };

        const mockCards = [11, 12, 13, 14, 15, 16, 17, 18, 19, 20].map((id) => ({
            id,
            name: `Card ${id}`,
            hp: 50,
            attack: 30,
            type: "Normal",
            pokedexNumber: id,
            imgUrl: null,
            createdAt: new Date(),
            updatedAt: new Date(),
        }));

        const updatedDeck = {
            id: 1,
            name: "My Deck",
            userId: 1,
            createdAt: new Date(),
            updatedAt: new Date(),
            deckCards: mockCards.map((card) => ({
                id: 1,
                deckId: 1,
                cardId: card.id,
                card,
                createdAt: new Date(),
                updatedAt: new Date(),
            })),
        };

        vi.mocked(jwt.verify).mockReturnValue({
            userId: 1,
            email: "test@example.com",
        } as never);

        prismaMock.deck.findUnique.mockResolvedValue(existingDeck);
        prismaMock.card.findMany.mockResolvedValue(mockCards);
        prismaMock.deckCard.deleteMany.mockResolvedValue({count: 10});
        prismaMock.deck.update.mockResolvedValue(updatedDeck);

        const response = await request(app)
            .patch("/api/decks/1")
            .set("Authorization", "Bearer fake_token")
            .send({
                cards: [11, 12, 13, 14, 15, 16, 17, 18, 19, 20],
            });

        expect(response.status).toBe(200);
        expect(response.body.deckCards).toHaveLength(10);
    });

    it("devrait retourner 400 si moins de 10 cartes sont fournies", async () => {
        const existingDeck = {
            id: 1,
            name: "My Deck",
            userId: 1,
            createdAt: new Date(),
            updatedAt: new Date(),
        };

        vi.mocked(jwt.verify).mockReturnValue({
            userId: 1,
            email: "test@example.com",
        } as never);

        prismaMock.deck.findUnique.mockResolvedValue(existingDeck);

        const response = await request(app)
            .patch("/api/decks/1")
            .set("Authorization", "Bearer fake_token")
            .send({
                cards: [1, 2, 3], // Seulement 3 cartes
            });

        expect(response.status).toBe(400);
        expect(response.body).toHaveProperty("error");
    });

    it("devrait retourner 404 si le deck n'existe pas", async () => {
        vi.mocked(jwt.verify).mockReturnValue({
            userId: 1,
            email: "test@example.com",
        } as never);

        prismaMock.deck.findUnique.mockResolvedValue(null);

        const response = await request(app)
            .patch("/api/decks/999")
            .set("Authorization", "Bearer fake_token")
            .send({
                name: "New Name",
            });

        expect(response.status).toBe(404);
    });

    it("devrait retourner 403 si le deck n'appartient pas à l'utilisateur", async () => {
        const existingDeck = {
            id: 1,
            name: "Other User Deck",
            userId: 2,
            createdAt: new Date(),
            updatedAt: new Date(),
        };

        vi.mocked(jwt.verify).mockReturnValue({
            userId: 1,
            email: "test@example.com",
        } as never);

        prismaMock.deck.findUnique.mockResolvedValue(existingDeck);

        const response = await request(app)
            .patch("/api/decks/1")
            .set("Authorization", "Bearer fake_token")
            .send({
                name: "New Name",
            });

        expect(response.status).toBe(403);
    });

    it("devrait retourner 500 en cas d'erreur serveur", async () => {
        vi.mocked(jwt.verify).mockReturnValue({
            userId: 1,
            email: "test@example.com",
        } as never);

        prismaMock.deck.findUnique.mockRejectedValue(new Error("Database error"));

        const response = await request(app)
            .patch("/api/decks/1")
            .set("Authorization", "Bearer fake_token")
            .send({
                name: "New Name",
            });

        expect(response.status).toBe(500);
    });

    it("devrait retourner 400 si l'ID est invalide dans PATCH", async () => {
        vi.mocked(jwt.verify).mockReturnValue({
            userId: 1,
            email: "test@example.com",
        } as never);

        const response = await request(app)
            .patch("/api/decks/invalid")
            .set("Authorization", "Bearer fake_token")
            .send({
                name: "New Name",
            });

        expect(response.status).toBe(400);
        expect(response.body).toHaveProperty("error");
    });

    it("devrait retourner 400 si certaines cartes sont invalides lors de la modification", async () => {
        const existingDeck = {
            id: 1,
            name: "My Deck",
            userId: 1,
            createdAt: new Date(),
            updatedAt: new Date(),
        };

        vi.mocked(jwt.verify).mockReturnValue({
            userId: 1,
            email: "test@example.com",
        } as never);

        prismaMock.deck.findUnique.mockResolvedValue(existingDeck);
        // Mock : seulement 5 cartes trouvées sur 10
        prismaMock.card.findMany.mockResolvedValue([
            {id: 1, name: "Card 1", hp: 50, attack: 30, type: "Normal", pokedexNumber: 1, imgUrl: null, createdAt: new Date(), updatedAt: new Date()},
            {id: 2, name: "Card 2", hp: 50, attack: 30, type: "Normal", pokedexNumber: 2, imgUrl: null, createdAt: new Date(), updatedAt: new Date()},
            {id: 3, name: "Card 3", hp: 50, attack: 30, type: "Normal", pokedexNumber: 3, imgUrl: null, createdAt: new Date(), updatedAt: new Date()},
            {id: 4, name: "Card 4", hp: 50, attack: 30, type: "Normal", pokedexNumber: 4, imgUrl: null, createdAt: new Date(), updatedAt: new Date()},
            {id: 5, name: "Card 5", hp: 50, attack: 30, type: "Normal", pokedexNumber: 5, imgUrl: null, createdAt: new Date(), updatedAt: new Date()},
        ]);

        const response = await request(app)
            .patch("/api/decks/1")
            .set("Authorization", "Bearer fake_token")
            .send({
                cards: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10],
            });

        expect(response.status).toBe(400);
        expect(response.body).toHaveProperty("error");
    });

    it("devrait retourner 401 si req.user est undefined dans PATCH (ligne défensive 179)", async () => {
        const {authMiddleware} = await import("../src/middlewares/auth.middleware");
        vi.mocked(authMiddleware).mockImplementation((req, res, next) => {
            // On appelle next() mais sans remplir req.user pour tester la ligne défensive
            next();
        });

        const response = await request(app)
            .patch("/api/decks/1")
            .set("Authorization", "Bearer fake_token")
            .send({
                name: "New Name",
            });

        expect(response.status).toBe(401);
        expect(response.body).toHaveProperty("error");
    });

});

describe("DELETE /api/decks/:id", () => {
    beforeEach(async () => {
        vi.clearAllMocks();
        const {authMiddleware} = await import("../src/middlewares/auth.middleware");
        vi.mocked(authMiddleware).mockImplementation((req: Request, res: Response, next: () => void) => {
            if (req.header("Authorization")?.startsWith("Bearer ")) {
                req.user = {
                    userId: 1,
                    email: "test@example.com",
                };
            }
            next();
        });
    });

    it("devrait supprimer un deck avec succès et retourner 200", async () => {
        const existingDeck = {
            id: 1,
            name: "My Deck",
            userId: 1,
            createdAt: new Date(),
            updatedAt: new Date(),
        };

        vi.mocked(jwt.verify).mockReturnValue({
            userId: 1,
            email: "test@example.com",
        } as never);

        prismaMock.deck.findUnique.mockResolvedValue(existingDeck);
        prismaMock.deck.delete.mockResolvedValue(existingDeck);

        const response = await request(app)
            .delete("/api/decks/1")
            .set("Authorization", "Bearer fake_token");

        expect(response.status).toBe(200);
        expect(response.body).toHaveProperty("message");
    });

    it("devrait retourner 404 si le deck n'existe pas", async () => {
        vi.mocked(jwt.verify).mockReturnValue({
            userId: 1,
            email: "test@example.com",
        } as never);

        prismaMock.deck.findUnique.mockResolvedValue(null);

        const response = await request(app)
            .delete("/api/decks/999")
            .set("Authorization", "Bearer fake_token");

        expect(response.status).toBe(404);
    });

    it("devrait retourner 403 si le deck n'appartient pas à l'utilisateur", async () => {
        const existingDeck = {
            id: 1,
            name: "Other User Deck",
            userId: 2,
            createdAt: new Date(),
            updatedAt: new Date(),
        };

        vi.mocked(jwt.verify).mockReturnValue({
            userId: 1,
            email: "test@example.com",
        } as never);

        prismaMock.deck.findUnique.mockResolvedValue(existingDeck);

        const response = await request(app)
            .delete("/api/decks/1")
            .set("Authorization", "Bearer fake_token");

        expect(response.status).toBe(403);
    });

    it("devrait retourner 401 si aucun token n'est fourni", async () => {
        const response = await request(app).delete("/api/decks/1");

        expect(response.status).toBe(401);
    });

    it("devrait retourner 500 en cas d'erreur serveur", async () => {
        vi.mocked(jwt.verify).mockReturnValue({
            userId: 1,
            email: "test@example.com",
        } as never);

        prismaMock.deck.findUnique.mockRejectedValue(new Error("Database error"));

        const response = await request(app)
            .delete("/api/decks/1")
            .set("Authorization", "Bearer fake_token");

        expect(response.status).toBe(500);
    });

    it("devrait retourner 400 si l'ID est invalide dans DELETE", async () => {
        vi.mocked(jwt.verify).mockReturnValue({
            userId: 1,
            email: "test@example.com",
        } as never);

        const response = await request(app)
            .delete("/api/decks/invalid")
            .set("Authorization", "Bearer fake_token");

        expect(response.status).toBe(400);
        expect(response.body).toHaveProperty("error");
    });

});
