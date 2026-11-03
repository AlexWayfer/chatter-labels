import assert from 'node:assert/strict'
import { createServer } from 'node:http'
import { mkdir, readFile } from 'node:fs/promises'
import { extname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { chromium } from 'playwright'

const root = fileURLToPath(new URL('../', import.meta.url))
const output = new URL('../pkg/screenshots/options-1280x800.png', import.meta.url)
const data = JSON.parse(await readFile(new URL('./fixtures/options.json', import.meta.url), 'utf8'))
const cardFixture = JSON.parse(await readFile(new URL('./fixtures/chatter-card.json', import.meta.url), 'utf8'))
const chatFixture = JSON.parse(await readFile(new URL('./fixtures/chat.json', import.meta.url), 'utf8'))

for (const label of data.labels) {
	const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="48" height="48"><text x="24" y="36" font-size="36" text-anchor="middle">${label.icon}</text></svg>`

	label.icon = 'data:image/svg+xml,' + encodeURIComponent(svg)
}

const types = {
	'.html': 'text/html',
	'.js': 'text/javascript',
	'.css': 'text/css',
	'.svg': 'image/svg+xml',
	'.png': 'image/png',
	'.woff2': 'font/woff2'
}
const fixtureFiles = new Map(['chatter-card', 'chat'].flatMap(scene => {
	return ['html', 'css', 'js', 'json'].map(extension => [
		`/screenshots/${scene}.${extension}`,
		fileURLToPath(new URL(`./fixtures/${scene}.${extension}`, import.meta.url))
	])
}))
for (const badge of ['yellow', 'bot']) {
	fixtureFiles.set(`/screenshots/assets/${badge}.png`, fileURLToPath(new URL(`./fixtures/assets/${badge}.png`, import.meta.url)))
}
const server = createServer(async (request, response) => {
	try {
		const pathname = new URL(request.url, 'http://localhost').pathname
		const fixture = fixtureFiles.get(pathname)
		const file = fixture ?? resolve(root, '.' + decodeURIComponent(pathname))

		if (!file.startsWith(root) || !fixture && !(/^\/(images|pages|scripts|styles|vendor)\//).test(pathname)) {
			response.writeHead(403).end()
			return
		}
		const content = await readFile(file)

		response.writeHead(200, { 'Content-Type': types[extname(file)] ?? 'application/octet-stream' }).end(content)
	} catch {
		response.writeHead(404).end()
	}
})
let browser

try {
	await new Promise((resolve, reject) => {
		server.once('error', reject)
		server.listen(0, '127.0.0.1', resolve)
	})
	const origin = `http://127.0.0.1:${server.address().port}`

	browser = await chromium.launch()
	const context = await browser.newContext({
		viewport: { width: 1280, height: 800 },
		deviceScaleFactor: 1,
		locale: 'en-US',
		timezoneId: 'Europe/Moscow',
		colorScheme: 'light',
		reducedMotion: 'reduce'
	})
	const errors = []
	const page = await context.newPage()

	page.on('pageerror', error => errors.push(error.message))
	await context.addInitScript(() => {
		const options = { storage: { githubGist: {
			token: 'github-example-token-for-screenshot', gistId: 'example'
		} } }

		window.chrome = { storage: {
			onChanged: { addListener() {} },
			local: { async set() {} },
			sync: {
				async get() {
					return options
				},
				async set(value) {
					Object.assign(options, value)
				}
			}
		} }
		window.chrome.runtime = {
			id: 'store-screenshot',
			getURL: path => new URL('/' + path, location.origin).href,
			sendMessage() {}
		}
	})
	await context.route('**/*', async route => {
		const url = new URL(route.request().url())

		if (url.origin === origin) {
			await route.continue()
		} else if (url.href === 'https://api.github.com/gists/example' && route.request().method() === 'GET') {
			await route.fulfill({
				json: {
					id: 'example',
					files: Object.fromEntries(
						Object.entries(data).map(([key, value]) => [key + '.json', { content: JSON.stringify(value) }])
					)
				}
			})
		} else {
			await route.abort()
		}
	})
	await page.goto(`${origin}/pages/options.html`)
	await page.locator('.labels:not(.loading)').waitFor()
	await page.locator('.fieldsets > fieldset').last()
		.waitFor()
	assert.equal(await page.locator('.fieldsets > fieldset').count(), data.labels.length)
	assert.equal(await page.locator('.assignment-header').count(), data.assignments.length)
	// Match the overview framing of the store screenshot without changing product styles.
	await page.addStyleTag({ content: 'html { zoom: 0.5; }' })
	await page.evaluate(async () => {
		await document.fonts.ready
		await Promise.all([...document.images].map(image => image.decode()))
	})
	const bounds = await page.evaluate(() => ({
		width: document.documentElement.scrollWidth,
		height: document.documentElement.scrollHeight
	}))

	assert.ok(bounds.width <= 1280 && bounds.height <= 800, `Page overflows screenshot: ${JSON.stringify(bounds)}`)
	assert.deepEqual(errors, [])
	await mkdir(new URL('./', output), { recursive: true })
	await page.screenshot({ path: fileURLToPath(output), animations: 'disabled' })
	const png = await readFile(output)

	assert.equal(png.readUInt32BE(16), 1280)
	assert.equal(png.readUInt32BE(20), 800)
	console.info(`Saved ${fileURLToPath(output)} (1280×800)`)

	const cardPage = await context.newPage()

	await cardPage.setViewportSize({ width: 640, height: 400 })
	const cardErrors = []
	const cardData = {
		labels: data.labels,
		assignments: cardFixture.assignedLabels.map(labelId => ({
			labelId,
			userId: cardFixture.user.id,
			username: cardFixture.user.displayName,
			login: cardFixture.user.login,
			assignedAt: cardFixture.assignedAt
		}))
	}

	cardPage.on('pageerror', error => cardErrors.push(error.message))
	await cardPage.route('https://api.github.com/gists/example', route => route.fulfill({
		json: {
			id: 'example',
			files: Object.fromEntries(
				Object.entries(cardData).map(([key, value]) => [key + '.json', { content: JSON.stringify(value) }])
			)
		}
	}))
	await cardPage.route('https://gql.twitch.tv/gql', route => route.fulfill({
		json: { data: { user: cardFixture.user } }
	}))
	await cardPage.goto(`${origin}/screenshots/chatter-card.html`)
	await cardPage.getByTitle('Edit labels').click()
	const popup = cardPage.getByRole('dialog', { name: `Labels for ${cardFixture.user.displayName}` })

	await popup.waitFor({ state: 'visible' })
	assert.equal(await popup.locator('input[name="label"]').count(), data.labels.length)
	assert.deepEqual(await popup.locator('input[name="label"]:checked').evaluateAll(
		inputs => inputs.map(input => input.value)
	), cardFixture.assignedLabels)
	await cardPage.evaluate(async () => {
		await document.fonts.ready
		await Promise.all([...document.images].map(image => image.decode()))
	})
	assert.deepEqual(cardErrors, [])
	const popupBounds = await popup.boundingBox()

	assert.ok(
		popupBounds && popupBounds.x >= 0 && popupBounds.y >= 0 &&
		popupBounds.x + popupBounds.width <= 640 && popupBounds.y + popupBounds.height <= 400,
		'Label editor is clipped in the screenshot'
	)
	const cardOutput = new URL('chatter-card-640x400.png', output)

	await cardPage.screenshot({ path: fileURLToPath(cardOutput), animations: 'disabled' })
	const cardPng = await readFile(cardOutput)

	assert.equal(cardPng.readUInt32BE(16), 640)
	assert.equal(cardPng.readUInt32BE(20), 400)
	console.info(`Saved ${fileURLToPath(cardOutput)} (640×400)`)

	const chatPage = await context.newPage()
	const chatErrors = []
	const chatData = {
		labels: data.labels,
		assignments: chatFixture.users.flatMap(user => user.labels.map(labelId => ({
			labelId,
			userId: user.id,
			username: user.username,
			login: user.username.toLowerCase(),
			assignedAt: cardFixture.assignedAt
		})))
	}

	await chatPage.setViewportSize({ width: 640, height: 400 })
	chatPage.on('pageerror', error => chatErrors.push(error.message))
	await chatPage.route('https://api.github.com/gists/example', route => route.fulfill({
		json: {
			id: 'example',
			files: Object.fromEntries(
				Object.entries(chatData).map(([key, value]) => [key + '.json', { content: JSON.stringify(value) }])
			)
		}
	}))
	await chatPage.goto(`${origin}/screenshots/chat.html`)
	await chatPage.locator('.chatter-labels-icons').first()
		.waitFor()
	const lines = chatPage.locator('.chat-line__message')

	assert.equal(await lines.count(), chatFixture.messages.length)
	for (const [index, message] of chatFixture.messages.entries()) {
		const user = chatFixture.users.find(user => user.id === message.userId)
		const expected = data.labels.filter(label => user.labels.includes(label.id)).map(label => label.name)

		const icons = lines.nth(index).locator('.chatter-labels-icon')

		assert.deepEqual(await icons.evaluateAll(elements => elements.map(icon => icon.alt)), expected)
	}
	await chatPage.evaluate(async () => {
		await document.fonts.ready
		await Promise.all([...document.images].map(image => image.decode()))
	})
	const chatBounds = await chatPage.locator('main').boundingBox()

	assert.ok(chatBounds && chatBounds.y + chatBounds.height <= 400, 'Chat is clipped in the screenshot')
	assert.deepEqual(chatErrors, [])
	const chatOutput = new URL('chat-640x400.png', output)

	await chatPage.screenshot({ path: fileURLToPath(chatOutput), animations: 'disabled' })
	const chatPng = await readFile(chatOutput)

	assert.equal(chatPng.readUInt32BE(16), 640)
	assert.equal(chatPng.readUInt32BE(20), 400)
	console.info(`Saved ${fileURLToPath(chatOutput)} (640×400)`)
} finally {
	await browser?.close()
	await new Promise(resolve => server.close(resolve))
}
