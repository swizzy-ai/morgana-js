/**
 * Files `morgana init` copies verbatim, from the package's `templates/`.
 * `../templates` is right from `src/` and the bundled `dist/` alike — both sit
 * one level under the package root (see version.mjs).
 */
import fs from 'node:fs'
import { fileURLToPath } from 'node:url'

export const template = (name) => fs.readFileSync(fileURLToPath(new URL(`../templates/${name}`, import.meta.url)), 'utf8')
