import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { compileFromFile } from "json-schema-to-typescript";

const here = dirname(fileURLToPath(import.meta.url));
const schemaDir = resolve(here, "../../schema");
const outDir = resolve(here, "../src/types/generated");

await mkdir(outDir, { recursive: true });
for (const name of ["manifest", "model", "values"]) {
  const ts = await compileFromFile(resolve(schemaDir, `${name}.schema.json`), {
    cwd: schemaDir,
    additionalProperties: false,
  });
  await writeFile(resolve(outDir, `${name}.ts`), ts);
}
