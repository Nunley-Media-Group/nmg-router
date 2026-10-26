// Types for gen-tool-schemas.mjs, so the test that regenerates the registry type-checks.

export function declarationVersion(text: string): string;

export function generateToolSchemas(
  source: string,
  version: string,
  warn?: (message: string) => void,
): string;

export const paths: { readonly toolDeclarations: string; readonly versionDeclarations: string; readonly output: string };
