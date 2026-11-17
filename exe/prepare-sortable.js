import { build } from 'esbuild'
import { copyFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'

const source = new URL('../node_modules/sortablejs/', import.meta.url)
const destination = new URL('../vendor/sortablejs/', import.meta.url)

await build({
	entryPoints: [fileURLToPath(new URL('modular/sortable.esm.js', source))],
	outfile: fileURLToPath(new URL('sortable.js', destination)),
	format: 'esm',
	target: 'chrome135',
	minify: true
})
await copyFile(new URL('LICENSE', source), new URL('LICENSE', destination))
