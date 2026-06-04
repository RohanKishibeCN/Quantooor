import path from "node:path";
import dotenv from "dotenv";

const cwd = process.cwd();

dotenv.config({ path: path.resolve(cwd, ".env") });
dotenv.config({ path: path.resolve(cwd, ".env.local"), override: true });
