import { copyFile, mkdir, readFile, writeFile } from 'node:fs/promises'

const source = new URL('../node_modules/beercss/', import.meta.url)
const destination = new URL('../vendor/beercss/', import.meta.url)
const modules = [
	'settings/global',
	'settings/light',
	'settings/dark',
	'settings/reset',
	'settings/theme',
	'helpers/form',
	'helpers/ripple',
	'helpers/scroll',
	'elements/badge',
	'elements/button',
	'elements/card',
	'elements/dialog',
	'elements/expansion',
	'elements/field',
	'elements/grid',
	'elements/icon',
	'elements/navigation',
	'elements/page',
	'elements/selection',
	'elements/tab',
	'elements/typography'
]

// Keep upstream modules intact and bundle the icon font locally.
const styles = await Promise.all(modules.map(module => {
	return readFile(new URL(`dist/cdn/${module}.min.css`, source), 'utf8')
}))

await mkdir(destination, { recursive: true })
await writeFile(new URL('options.css', destination), styles.join('\n'))
await copyFile(new URL('LICENSE', source), new URL('LICENSE', destination))
await copyFile(new URL('dist/cdn/beer.loader.min.js', source), new URL('loader.js', destination))
await copyFile(new URL('dist/cdn/elements/page.min.js', source), new URL('page.js', destination))
await copyFile(
	new URL('../licenses/material-symbols.txt', import.meta.url),
	new URL('MaterialSymbols-LICENSE', destination)
)
await copyFile(
	new URL('dist/cdn/material-symbols-outlined.woff2', source),
	new URL('material-symbols-outlined.woff2', destination)
)
