/**
 * Shared part-rule contract.
 *
 * Kept dependency-free so every domain module can import it without a cycle
 * back through the assembler in `index.ts`.
 */

export interface PartRule {
  selector: string;
  css: Record<string, string>;
}
