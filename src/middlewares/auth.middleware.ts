import {Request, Response, NextFunction} from "express";
import {StatusCodes} from "http-status-codes";
import jwt from "jsonwebtoken";
import {env} from "../env";

// Payload attendu dans le token JWT
interface JwtPayload {
    userId: number;
    email: string;
    iat?: number;
    exp?: number;
}

// Middleware appelé sur les routes protégées
export function authMiddleware(req: Request, res: Response, next: NextFunction): void {
    // On récupère le header Authorization
    const authHeader = req.header("Authorization");

    // Si pas de header ou mauvais format, on bloque la requête
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
        res
            .status(StatusCodes.UNAUTHORIZED)
            .json({error: "Authorization token is missing"});
        return;
    }

    // On enlève le préfixe "Bearer " pour garder que le token
    const token = authHeader.replace("Bearer ", "").trim();

    try {
        // Vérifie et décode le token avec le secret
        const decoded = jwt.verify(token, env.JWT_SECRET) as JwtPayload;

        // On ajoute les infos utiles dans req.user pour la suite de la requête
        req.user = {
            userId: decoded.userId,
            email: decoded.email,
        };

        next();
    } catch (error) {
        // Si le token est invalide ou expiré, on renvoie 401
        res
            .status(StatusCodes.UNAUTHORIZED)
            .json({error: "Invalid or expired token"});
    }
}


