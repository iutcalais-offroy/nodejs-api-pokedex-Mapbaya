import {Router, Request, Response} from "express";
import {StatusCodes} from "http-status-codes";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import {prisma} from "../database";
import {env} from "../env";

// Router Express dédié aux routes d'authentification
const authRouter = Router();

// Corps attendu pour la route de création de compte
interface SignUpBody {
    email: string;
    username: string;
    password: string;
}

// Corps attendu pour la route de connexion
interface SignInBody {
    email: string;
    password: string;
}

// Données qu'on met dans le token JWT
interface JwtPayload {
    userId: number;
    email: string;
}

/**
 * Génère un token JWT valide pendant 7 jours
 * @param payload - Les données à mettre dans le token (userId et email)
 * @returns Le token JWT sous forme de string
 */
function createToken(payload: JwtPayload): string {
    return jwt.sign(payload, env.JWT_SECRET, {expiresIn: "7d"});
}

/**
 * Crée un nouveau compte utilisateur avec authentification JWT
 * @route POST /api/auth/sign-up
 * @param req.body.email - L'email de l'utilisateur
 * @param req.body.username - Le nom d'utilisateur
 * @param req.body.password - Le mot de passe en clair (sera hashé)
 * @returns 201 avec le token JWT et les infos utilisateur (sans mot de passe)
 * @throws {400} Si des données sont manquantes
 * @throws {409} Si l'email est déjà utilisé
 * @throws {500} En cas d'erreur serveur
 */
authRouter.post("/sign-up", async (req: Request, res: Response) => {
    try {
        const {email, username, password} = req.body as SignUpBody;

        // Vérifie que toutes les données nécessaires sont présentes
        if (!email || !username || !password) {
            return res
                .status(StatusCodes.BAD_REQUEST)
                .json({error: "email, username and password are required"});
        }

        // Vérifie si un utilisateur existe déjà avec cet email
        const existingUser = await prisma.user.findUnique({
            where: {email},
        });

        if (existingUser) {
            return res
                .status(StatusCodes.CONFLICT)
                .json({error: "Email is already used"});
        }

        // Hash du mot de passe avant de le stocker en base
        const hashedPassword = await bcrypt.hash(password, 10);

        // Création de l'utilisateur dans la base de données
        const user = await prisma.user.create({
            data: {
                email,
                username,
                password: hashedPassword,
            },
        });

        // Génère un token JWT pour l'utilisateur créé
        const token = createToken({userId: user.id, email: user.email});

        // On enlève le mot de passe avant de renvoyer l'utilisateur au client
        const {password: _password, ...userWithoutPassword} = user;

        // Renvoie 201 avec le token et les infos utilisateur (sans mot de passe)
        return res.status(StatusCodes.CREATED).json({
            token,
            user: userWithoutPassword,
        });
    } catch (error) {
        // Si une erreur inattendue arrive, on renvoie une erreur 500
        console.error("Error in sign-up route:", error);
        return res
            .status(StatusCodes.INTERNAL_SERVER_ERROR)
            .json({error: "Internal server error"});
    }
});

/**
 * Connecte un utilisateur existant et génère un token JWT
 * @route POST /api/auth/sign-in
 * @param req.body.email - L'email de l'utilisateur
 * @param req.body.password - Le mot de passe en clair
 * @returns 200 avec le token JWT et les infos utilisateur (sans mot de passe)
 * @throws {400} Si l'email ou le mot de passe sont manquants
 * @throws {401} Si l'email n'existe pas ou le mot de passe est incorrect
 * @throws {500} En cas d'erreur serveur
 */
authRouter.post("/sign-in", async (req: Request, res: Response) => {
    try {
        const {email, password} = req.body as SignInBody;

        // Vérifie que l'email et le mot de passe sont fournis
        if (!email || !password) {
            return res
                .status(StatusCodes.BAD_REQUEST)
                .json({error: "email and password are required"});
        }

        // Cherche l'utilisateur en base par son email
        const user = await prisma.user.findUnique({
            where: {email},
        });

        // Si aucun utilisateur trouvé, on renvoie 401
        if (!user) {
            return res
                .status(StatusCodes.UNAUTHORIZED)
                .json({error: "Invalid email or password"});
        }

        // Compare le mot de passe fourni avec le hash en base
        const isPasswordValid = await bcrypt.compare(password, user.password);

        // Si le mot de passe ne correspond pas, on renvoie aussi 401
        if (!isPasswordValid) {
            return res
                .status(StatusCodes.UNAUTHORIZED)
                .json({error: "Invalid email or password"});
        }

        // Génère un nouveau token JWT pour l'utilisateur connecté
        const token = createToken({userId: user.id, email: user.email});

        // On enlève le mot de passe avant de renvoyer l'utilisateur au client
        const {password: _password, ...userWithoutPassword} = user;

        // Renvoie 200 avec le token et les infos utilisateur (sans mot de passe)
        return res.status(StatusCodes.OK).json({
            token,
            user: userWithoutPassword,
        });
    } catch (error) {
        // Si une erreur inattendue arrive, on renvoie une erreur 500
        console.error("Error in sign-in route:", error);
        return res
            .status(StatusCodes.INTERNAL_SERVER_ERROR)
            .json({error: "Internal server error"});
    }
});

export {authRouter};

