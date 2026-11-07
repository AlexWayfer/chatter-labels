import { build } from 'esbuild'
import { copyFile, mkdir } from 'node:fs/promises'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = fileURLToPath(new URL('../', import.meta.url))
const destination = new URL('../vendor/code-editor/', import.meta.url)

await mkdir(destination, { recursive: true })
const result = await build({
	absWorkingDir: root,
	entryPoints: ['scripts/options/code-editor.js'],
	outfile: fileURLToPath(new URL('editor.js', destination)),
	bundle: true,
	format: 'esm',
	target: 'chrome135',
	minify: true,
	legalComments: 'linked',
	metafile: true
})
const packageRoots = new Set()

for (const input of Object.keys(result.metafile.inputs)) {
	const path = resolve(root, input).replaceAll('\\', '/')
	const marker = '/node_modules/'
	const index = path.lastIndexOf(marker)

	if (index === -1) continue
	const start = index + marker.length
	const parts = path.slice(start).split('/')
	const name = parts.slice(0, parts[0].startsWith('@') ? 2 : 1).join('/')

	packageRoots.add(path.slice(0, start) + name)
}
await mkdir(new URL('licenses/', destination), { recursive: true })
for (const packageRoot of packageRoots) {
	const name = packageRoot.slice(packageRoot.lastIndexOf('/node_modules/') + '/node_modules/'.length).replaceAll('/', '-')

	await copyFile(resolve(packageRoot, 'LICENSE'), fileURLToPath(new URL(`licenses/${name}.txt`, destination)))
}
