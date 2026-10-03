import { copyFile, mkdir } from "node:fs/promises";

await mkdir("web/vendor", { recursive: true });
await copyFile(
  "node_modules/@supabase/supabase-js/dist/umd/supabase.js",
  "web/vendor/supabase.js"
);

console.log("Copied Supabase browser SDK to web/vendor/supabase.js");
