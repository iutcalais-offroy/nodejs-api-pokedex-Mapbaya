import {describe, it, expect, beforeEach, vi} from "vitest";
import {Request, Response, NextFunction} from "express";
import {authMiddleware} from "../src/middlewares/auth.middleware";
import jwt from "jsonwebtoken";
import {StatusCodes} from "http-status-codes";

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

describe("authMiddleware", () => {
    let mockRequest: Request;
    let mockResponse: Response;
    let mockNext: NextFunction;

    beforeEach(() => {
        vi.clearAllMocks();

        // Créer des mocks pour req, res et next
        mockRequest = {
            header: vi.fn(),
        } as unknown as Request;

        mockResponse = {
            status: vi.fn().mockReturnThis(),
            json: vi.fn().mockReturnThis(),
        } as unknown as Response;

        mockNext = vi.fn();
    });

    it("devrait appeler next() si le token est valide", () => {
        const token = "valid_token";
        const decodedToken = {
            userId: 1,
            email: "test@example.com",
        };

        // Mock du header Authorization
        vi.mocked(mockRequest.header as () => string | undefined).mockReturnValue(`Bearer ${token}`);

        // Mock jwt.verify pour retourner le token décodé
        vi.mocked(jwt.verify).mockReturnValue(decodedToken as never);

        // Appeler le middleware
        authMiddleware(mockRequest, mockResponse, mockNext);

        // Vérifier que req.user a été rempli
        expect((mockRequest as Request & {user?: {userId: number; email: string}}).user).toEqual({
            userId: 1,
            email: "test@example.com",
        });

        // Vérifier que next() a été appelé
        expect(mockNext).toHaveBeenCalled();
        expect(mockResponse.status).not.toHaveBeenCalled();
    });

    it("devrait retourner 401 si aucun header Authorization n'est fourni", () => {
        // Mock : pas de header
        vi.mocked(mockRequest.header as () => string | undefined).mockReturnValue(undefined);

        authMiddleware(mockRequest, mockResponse, mockNext);

        expect(mockResponse.status).toHaveBeenCalledWith(StatusCodes.UNAUTHORIZED);
        expect(mockResponse.json).toHaveBeenCalledWith({
            error: "Authorization token is missing",
        });
        expect(mockNext).not.toHaveBeenCalled();
    });

    it("devrait retourner 401 si le header ne commence pas par 'Bearer '", () => {
        // Mock : header sans "Bearer "
        vi.mocked(mockRequest.header as () => string | undefined).mockReturnValue("InvalidFormat token");

        authMiddleware(mockRequest, mockResponse, mockNext);

        expect(mockResponse.status).toHaveBeenCalledWith(StatusCodes.UNAUTHORIZED);
        expect(mockResponse.json).toHaveBeenCalledWith({
            error: "Authorization token is missing",
        });
        expect(mockNext).not.toHaveBeenCalled();
    });

    it("devrait retourner 401 si le token est invalide", () => {
        const token = "invalid_token";

        // Mock du header Authorization
        vi.mocked(mockRequest.header as () => string | undefined).mockReturnValue(`Bearer ${token}`);

        // Mock jwt.verify pour lancer une erreur
        vi.mocked(jwt.verify).mockImplementation(() => {
            throw new Error("Invalid token");
        });

        authMiddleware(mockRequest, mockResponse, mockNext);

        expect(mockResponse.status).toHaveBeenCalledWith(StatusCodes.UNAUTHORIZED);
        expect(mockResponse.json).toHaveBeenCalledWith({
            error: "Invalid or expired token",
        });
        expect(mockNext).not.toHaveBeenCalled();
    });

    it("devrait retourner 401 si le token est expiré", () => {
        const token = "expired_token";

        // Mock du header Authorization
        vi.mocked(mockRequest.header as () => string | undefined).mockReturnValue(`Bearer ${token}`);

        // Mock jwt.verify pour lancer une erreur d'expiration
        vi.mocked(jwt.verify).mockImplementation(() => {
            const error = new Error("Token expired");
            (error as {name: string}).name = "TokenExpiredError";
            throw error;
        });

        authMiddleware(mockRequest, mockResponse, mockNext);

        expect(mockResponse.status).toHaveBeenCalledWith(StatusCodes.UNAUTHORIZED);
        expect(mockResponse.json).toHaveBeenCalledWith({
            error: "Invalid or expired token",
        });
        expect(mockNext).not.toHaveBeenCalled();
    });

    it("devrait extraire correctement le token du header", () => {
        const token = "my_token_123";
        const decodedToken = {
            userId: 2,
            email: "user@example.com",
        };

        // Mock du header avec des espaces
        vi.mocked(mockRequest.header as () => string | undefined).mockReturnValue(`Bearer  ${token}  `);

        // Mock jwt.verify
        vi.mocked(jwt.verify).mockReturnValue(decodedToken as never);

        authMiddleware(mockRequest, mockResponse, mockNext);

        // Vérifier que jwt.verify a été appelé avec le bon token (sans espaces)
        expect(jwt.verify).toHaveBeenCalledWith(token, expect.any(String));
        expect((mockRequest as Request & {user?: {userId: number; email: string}}).user).toEqual({
            userId: 2,
            email: "user@example.com",
        });
        expect(mockNext).toHaveBeenCalled();
    });
});
