import "dotenv/config";
import { assertEnvironment } from "../src/lib/env";

assertEnvironment(process.env, true);
console.log("Üretim ortamı güvenlik doğrulamasından geçti.");
