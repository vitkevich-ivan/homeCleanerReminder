import { generateKeyPairSync, randomBytes } from "node:crypto";
import { writeFile } from "node:fs/promises";

const { publicKey, privateKey } = generateKeyPairSync("ec", {
  namedCurve: "prime256v1"
});

const publicJwk = publicKey.export({ format: "jwk" });
const privateJwk = privateKey.export({ format: "jwk" });
const publicBytes = Buffer.concat([
  Buffer.from([4]),
  Buffer.from(publicJwk.x, "base64url"),
  Buffer.from(publicJwk.y, "base64url")
]);

const values = [
  `VAPID_PUBLIC_KEY=${publicBytes.toString("base64url")}`,
  `VAPID_PRIVATE_KEY=${privateJwk.d}`,
  "VAPID_SUBJECT=mailto:vitkevich-ivan@users.noreply.github.com",
  `PUSH_CRON_SECRET=${randomBytes(32).toString("base64url")}`
];

await writeFile(".env.push.local", `${values.join("\n")}\n`, { mode: 0o600 });
console.log("Created .env.push.local. Keep this file private.");
