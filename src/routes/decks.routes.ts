import {Router, Request, Response} from "express";
import {StatusCodes} from "http-status-codes";
import {prisma} from "../database";
import {authMiddleware} from "../middlewares/auth.middleware";

const decksRouter = Router();

interface CreateDeckBody {
    name: string;
    cards: number[];
}

interface UpdateDeckBody {
    name?: string;
    cards?: number[];
}

// Va créer un nouveau deck
decksRouter.post("/", authMiddleware, async (req: Request, res: Response) => {
    try {
        const {name, cards} = req.body as CreateDeckBody;
        const userId = req.user?.userId;

        if (!userId) {
            return res
                .status(StatusCodes.UNAUTHORIZED)
                .json({error: "Vous n'êtes pas autorisé à accéder à cette route"});
        }

        if (!name) {
            return res
                .status(StatusCodes.BAD_REQUEST)
                .json({error: "Le nom est requis"});
        }

        if (!cards || cards.length !== 10) {
            return res
                .status(StatusCodes.BAD_REQUEST)
                .json({error: "Les cartes doivent contenir exactement 10 IDs"});
        }

        // Vérifier que toutes les cartes existent
        const existingCards = await prisma.card.findMany({
            where: {
                id: {
                    in: cards,
                },
            },
        });

        if (existingCards.length !== 10) {
            return res
                .status(StatusCodes.BAD_REQUEST)
                .json({error: "Certaines cartes sont invalides ou n'existent pas"});
        }

        // Créer le deck avec ses cartes
        const deck = await prisma.deck.create({
            data: {
                name,
                userId,
                deckCards: {
                    create: cards.map((cardId) => ({
                        cardId,
                    })),
                },
            },
            include: {
                deckCards: {
                    include: {
                        card: true,
                    },
                },
            },
        });

        return res.status(StatusCodes.CREATED).json(deck);
    } catch (error) {
        console.error("Error in POST /api/decks:", error);
        return res
            .status(StatusCodes.INTERNAL_SERVER_ERROR)
            .json({error: "Une erreur est survenue lors de la création du deck"});
    }
});

// Va lister tous les decks de l'utilisateur connecté
decksRouter.get("/mine", authMiddleware, async (req: Request, res: Response) => {
    try {
        const userId = req.user?.userId;

        if (!userId) {
            return res
                .status(StatusCodes.UNAUTHORIZED)
                .json({error: "Vous n'êtes pas autorisé à accéder à cette route"});
        }

        const decks = await prisma.deck.findMany({
            where: {
                userId,
            },
            include: {
                deckCards: {
                    include: {
                        card: true,
                    },
                },
            },
        });

        return res.status(StatusCodes.OK).json(decks);
    } catch (error) {
        console.error("Error in GET /api/decks/mine:", error);
        return res
            .status(StatusCodes.INTERNAL_SERVER_ERROR)
            .json({error: "Une erreur est survenue lors de la récupération des decks"});
    }
});

// Va consulter un deck spécifique
decksRouter.get("/:id", authMiddleware, async (req: Request, res: Response) => {
    try {
        const deckId = parseInt(req.params.id, 10);
        const userId = req.user?.userId;

        if (!userId) {
            return res
                .status(StatusCodes.UNAUTHORIZED)
                .json({error: "Vous n'êtes pas autorisé à accéder à cette route"});
        }

        if (isNaN(deckId)) {
            return res
                .status(StatusCodes.BAD_REQUEST)
                .json({error: "ID de deck invalide"});
        }

        const deck = await prisma.deck.findUnique({
            where: {
                id: deckId,
            },
            include: {
                deckCards: {
                    include: {
                        card: true,
                    },
                },
            },
        });

        if (!deck) {
            return res
                .status(StatusCodes.NOT_FOUND)
                .json({error: "Le deck n'a pas été trouvé"});
        }

        if (deck.userId !== userId) {
            return res
                .status(StatusCodes.FORBIDDEN)
                .json({error: "Vous n'avez pas accès à ce deck"});
        }

        return res.status(StatusCodes.OK).json(deck);
    } catch (error) {
        console.error("Error in GET /api/decks/:id:", error);
        return res
            .status(StatusCodes.INTERNAL_SERVER_ERROR)
            .json({error: "Une erreur est survenue lors de la consultation du deck"});
    }
});

// Va modifier un deck
decksRouter.patch("/:id", authMiddleware, async (req: Request, res: Response) => {
    try {
        const deckId = parseInt(req.params.id, 10);
        const userId = req.user?.userId;
        const {name, cards} = req.body as UpdateDeckBody;

        if (!userId) {
            return res
                .status(StatusCodes.UNAUTHORIZED)
                .json({error: "Vous n'êtes pas autorisé à accéder à cette route"});
        }

        if (isNaN(deckId)) {
            return res
                .status(StatusCodes.BAD_REQUEST)
                .json({error: "ID de deck invalide"});
        }

        // Vérifier que le deck existe et appartient à l'utilisateur
        const existingDeck = await prisma.deck.findUnique({
            where: {
                id: deckId,
            },
        });

        if (!existingDeck) {
            return res
                .status(StatusCodes.NOT_FOUND)
                .json({error: "Le deck n'a pas été trouvé"});
        }

        if (existingDeck.userId !== userId) {
            return res
                .status(StatusCodes.FORBIDDEN)
                .json({error: "Vous n'avez pas accès à ce deck"});
        }

        // Si les cartes sont modifiées, vérifier qu'il y en a 10
        if (cards !== undefined) {
            if (cards.length !== 10) {
                return res
                    .status(StatusCodes.BAD_REQUEST)
                    .json({error: "Les cartes doivent contenir exactement 10 IDs"});
            }

            // Vérifier que toutes les cartes existent
            const existingCards = await prisma.card.findMany({
                where: {
                    id: {
                        in: cards,
                    },
                },
            });

            if (existingCards.length !== 10) {
                return res
                    .status(StatusCodes.BAD_REQUEST)
                    .json({error: "Certaines cartes sont invalides ou n'existent pas"});
            }
        }

        // Supprimer les anciennes associations de cartes si les cartes changent
        if (cards !== undefined) {
            await prisma.deckCard.deleteMany({
                where: {
                    deckId,
                },
            });
        }

        // Mettre à jour le deck
        const updateData: {name?: string; deckCards?: {create: {cardId: number}[]}} = {};

        if (name !== undefined) {
            updateData.name = name;
        }

        if (cards !== undefined) {
            updateData.deckCards = {
                create: cards.map((cardId) => ({
                    cardId,
                })),
            };
        }

        const deck = await prisma.deck.update({
            where: {
                id: deckId,
            },
            data: updateData,
            include: {
                deckCards: {
                    include: {
                        card: true,
                    },
                },
            },
        });

        return res.status(StatusCodes.OK).json(deck);
    } catch (error) {
        console.error("Error in PATCH /api/decks/:id:", error);
        return res
            .status(StatusCodes.INTERNAL_SERVER_ERROR)
            .json({error: "Une erreur est survenue lors de la modification du deck"});
    }
});

// Va supprimer un deck
decksRouter.delete("/:id", authMiddleware, async (req: Request, res: Response) => {
    try {
        const deckId = parseInt(req.params.id, 10);
        const userId = req.user?.userId;

        if (!userId) {
            return res
                .status(StatusCodes.UNAUTHORIZED)
                .json({error: "Vous n'êtes pas autorisé à accéder à cette route"});
        }

        if (isNaN(deckId)) {
            return res
                .status(StatusCodes.BAD_REQUEST)
                .json({error: "ID de deck invalide"});
        }

        // Vérifier que le deck existe et appartient à l'utilisateur
        const deck = await prisma.deck.findUnique({
            where: {
                id: deckId,
            },
        });

        if (!deck) {
            return res
                .status(StatusCodes.NOT_FOUND)
                .json({error: "Le deck n'a pas été trouvé"});
        }

        if (deck.userId !== userId) {
            return res
                .status(StatusCodes.FORBIDDEN)
                .json({error: "Vous n'avez pas accès à ce deck"});
        }

        // Supprimer le deck (les deckCards seront supprimées en cascade)
        await prisma.deck.delete({
            where: {
                id: deckId,
            },
        });

        return res.status(StatusCodes.OK).json({message: "Le deck a été supprimé avec succès"});
    } catch (error) {
        console.error("Error in DELETE /api/decks/:id:", error);
        return res
            .status(StatusCodes.INTERNAL_SERVER_ERROR)
            .json({error: "Une erreur est survenue lors de la suppression du deck"});
    }
});

export {decksRouter};
