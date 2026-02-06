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

// Fonction qui génère un token JWT valide 7 jours
function createToken(payload: JwtPayload): string {
    return jwt.sign(payload, env.JWT_SECRET, {expiresIn: "7d"});
}

// Route pour créer un nouveau compte utilisateur
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

// Route pour se connecter avec un compte existant
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

