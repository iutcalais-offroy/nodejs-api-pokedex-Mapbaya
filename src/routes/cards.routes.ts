import {Router, Request, Response} from "express";
import {StatusCodes} from "http-status-codes";
import {prisma} from "../database";
import {authMiddleware} from "../middlewares/auth.middleware";

// Router pour les routes liées aux cartes
const cardsRouter = Router();

/**
 * Retourne toutes les cartes Pokémon triées par numéro de Pokédex
 * @route GET /api/cards
 * @returns 200 avec la liste complète des cartes triées par pokedexNumber croissant
 * @throws {401} Si le token d'authentification est manquant ou invalide
 * @throws {500} En cas d'erreur serveur
 */
cardsRouter.get("/", authMiddleware, async (_req: Request, res: Response) => {
    try {
        const cards = await prisma.card.findMany({
            orderBy: {
                pokedexNumber: "asc",
            },
        });

        return res.status(StatusCodes.OK).json(cards);
    } catch (error) {
        console.error("Error in GET /api/cards:", error);
        return res
            .status(StatusCodes.INTERNAL_SERVER_ERROR)
            .json({error: "Internal server error"});
    }
});

export {cardsRouter};

