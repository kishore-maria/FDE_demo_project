import { fileURLToPath } from 'node:url';
import SwaggerParser from '@apidevtools/swagger-parser';

const specPath = fileURLToPath(new URL('../openapi/openapi.yaml', import.meta.url));
const METHODS = ['get', 'post', 'put', 'patch', 'delete'];

try {
  const api = await SwaggerParser.validate(specPath);
  const operations = Object.values(api.paths).flatMap((item) =>
    METHODS.filter((method) => item[method]),
  );
  console.log(
    `✔ ${api.info.title} ${api.info.version} is valid — ${Object.keys(api.paths).length} paths, ${operations.length} operations`,
  );
} catch (error) {
  console.error(`✖ OpenAPI spec is invalid:\n${error.message}`);
  process.exitCode = 1;
}
