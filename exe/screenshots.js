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
const botCheckScript = `const { login } = await twitch.getUser(user.id, 'login');
return login.toLowerCase().endsWith('bot');
`

for (const label of data.labels) {
	const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="48" height="48"><text x="24" y="36" font-size="36" text-anchor="middle">${label.icon}</text></svg>`

	label.icon = 'data:image/svg+xml,' + encodeURIComponent(svg)
}

const checkData = {
	...data,
	labels: data.labels.map(label => {
		return label.id === 'bot' ? { ...label, script: botCheckScript } : label
	})
}

async function saveScreenshot(page, name, width, height) {
	await page.evaluate(async () => {
		await document.fonts.ready
		await Promise.all([...document.images].map(image => image.decode()))
	})
	const destination = new URL(`${name}-${width}x${height}.png`, output)

	await page.screenshot({ path: fileURLToPath(destination), animations: 'disabled' })
	const png = await readFile(destination)

	assert.equal(png.readUInt32BE(16), width)
	assert.equal(png.readUInt32BE(20), height)
	console.info(`Saved ${fileURLToPath(destination)} (${width}×${height})`)
}

const types = {
	'.html': 'text/html',
	'.js': 'text/javascript',
	'.css': 'text/css',
	'.svg': 'image/svg+xml',
	'.png': 'image/png',
	'.woff2': 'font/woff2'
}
const fixtureFiles = new Map(['chatter-card', 'chat', 'promo'].flatMap(scene => {
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
			async sendMessage(message) {
				if (message.type === 'user-scripts-status') return { enabled: true }
				if (message.type === 'run-label-check' && message.labelId === 'bot') {
					// Mock the extension/Twitch boundary using the same example's expected result.
					return { ok: true, value: message.user.login.toLowerCase().endsWith('bot') }
				}
				throw new Error('Unexpected screenshot runtime message: ' + message.type)
			}
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
	await page.addStyleTag({ content: 'html { zoom: 0.46; }' })
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

	await page.getByRole('button', { name: 'Dark theme', exact: true }).click()
	await page.locator('body.dark').waitFor()
	assert.equal(await page.getByRole('button', { name: 'Dark theme', exact: true }).getAttribute('aria-pressed'), 'true')
	assert.deepEqual(errors, [])
	await saveScreenshot(page, 'options-dark', 1280, 800)

	const scriptPage = await context.newPage()
	const scriptErrors = []

	scriptPage.on('pageerror', error => scriptErrors.push(error.message))
	await scriptPage.route('https://api.github.com/gists/example', route => route.fulfill({
		json: {
			id: 'example',
			files: Object.fromEntries(
				Object.entries(checkData).map(([key, value]) => [key + '.json', { content: JSON.stringify(value) }])
			)
		}
	}))
	await scriptPage.goto(`${origin}/pages/options.html`)
	await scriptPage.locator('.labels:not(.loading)').waitFor()
	await scriptPage.getByRole('button', { name: 'Dark theme', exact: true }).click()
	await scriptPage.locator('body.dark').waitFor()
	assert.equal(await scriptPage.getByRole('button', { name: 'Dark theme', exact: true }).getAttribute('aria-pressed'), 'true')
	await scriptPage.addStyleTag({ content: 'html { zoom: 0.65; }' })
	const scriptLabel = scriptPage.locator('.fieldsets > fieldset').first()

	assert.equal(await scriptLabel.locator('.label-script').getAttribute('open'), null)
	assert.equal(await scriptLabel.locator('.script-status').isVisible(), true)
	assert.equal(await scriptLabel.locator('.script-status').textContent(), 'Present')
	const absentStatus = scriptPage.locator('.script-status').nth(1)

	assert.equal(await absentStatus.textContent(), 'Absent')
	for (const theme of ['Light theme', 'Dark theme']) {
		await scriptPage.getByRole('button', { name: theme, exact: true }).click()
		const presentStyle = await scriptLabel.locator('.script-status').evaluate(element => ({
			width: element.getBoundingClientRect().width,
			background: getComputedStyle(element).backgroundColor
		}))
		const absentStyle = await absentStatus.evaluate(element => ({
			width: element.getBoundingClientRect().width,
			background: getComputedStyle(element).backgroundColor
		}))

		assert.equal(presentStyle.width, absentStyle.width, 'Script status badges keep the same width')
		assert.notEqual(presentStyle.background, absentStyle.background, 'Script states use different colors')
	}
	await scriptPage.locator('.labels').evaluate(element => window.scrollTo(0, element.getBoundingClientRect().top + window.scrollY - 24))
	await saveScreenshot(scriptPage, 'label-script-status', 1280, 800)
	await scriptLabel.locator('.label-script > summary').click()
	await scriptLabel.locator('.cm-editor').waitFor()
	assert.equal(await scriptLabel.locator('[name="script"]').inputValue(), botCheckScript)
	assert.ok(await scriptLabel.locator('.cm-editor .tok-keyword').count() > 0)
	await scriptLabel.getByRole('tab', { name: 'Functions', exact: true }).click()
	const userFunction = scriptLabel.locator('.script-function').filter({ hasText: 'twitch.getUser()' })

	await userFunction.locator('summary').click()
	assert.equal(await userFunction.getAttribute('open'), '')
	await scriptPage.waitForFunction(() => [...document.querySelectorAll('details[open]')].every(element => {
		return getComputedStyle(element, '::details-content').opacity === '1'
	}))
	await scriptPage.locator('.labels').evaluate(element => window.scrollTo(0, element.getBoundingClientRect().top + window.scrollY - 24))
	const labelBounds = await scriptLabel.boundingBox()
	const editorBounds = await scriptLabel.locator('.cm-editor').boundingBox()
	const functionBounds = await userFunction.boundingBox()

	assert.ok(labelBounds && labelBounds.y >= 0 && labelBounds.y + labelBounds.height <= 800, 'Script label is clipped')
	assert.ok(editorBounds && editorBounds.y >= 0 && editorBounds.y + editorBounds.height <= 800, 'Script editor is clipped')
	assert.ok(functionBounds && functionBounds.y >= 0 && functionBounds.y + functionBounds.height <= 800, 'Function reference is clipped')
	assert.deepEqual(scriptErrors, [])
	await saveScreenshot(scriptPage, 'label-check-script', 1280, 800)

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

	const checkPage = await context.newPage()
	const checkErrors = []

	checkPage.on('pageerror', error => checkErrors.push(error.message))
	await checkPage.route('https://api.github.com/gists/example', route => route.fulfill({
		json: {
			id: 'example',
			files: Object.fromEntries(
				Object.entries({ ...cardData, labels: checkData.labels }).map(([key, value]) => [key + '.json', { content: JSON.stringify(value) }])
			)
		}
	}))
	await checkPage.route('https://gql.twitch.tv/gql', route => route.fulfill({
		json: { data: { user: cardFixture.user } }
	}))
	await checkPage.goto(`${origin}/screenshots/chatter-card.html`)
	await checkPage.addStyleTag({ content: 'html { zoom: 1.5; }' })
	await checkPage.getByTitle('Edit labels').click()
	const checkPopup = checkPage.getByRole('dialog', { name: `Labels for ${cardFixture.user.displayName}` })
	const checkedLabel = checkPopup.locator('fieldset').filter({ has: checkPage.locator('[name="label"][value="bot"]') })

	await checkPopup.getByRole('button', { name: 'Check', exact: true }).click()
	await checkedLabel.locator('.check-result:not([hidden])').waitFor()
	assert.equal(await checkedLabel.locator('.check-result').textContent(), 'Yes')
	assert.equal(await checkedLabel.locator('.check-label').isVisible(), false)
	assert.deepEqual(await checkPopup.locator('input[name="label"]:checked').evaluateAll(
		inputs => inputs.map(input => input.value)
	), cardFixture.assignedLabels)
	const checkBounds = await checkPopup.boundingBox()

	assert.ok(checkBounds && checkBounds.x >= 0 && checkBounds.y >= 0 &&
		checkBounds.x + checkBounds.width <= 1280 && checkBounds.y + checkBounds.height <= 800, 'Check result popup is clipped')
	assert.deepEqual(checkErrors, [])
	await saveScreenshot(checkPage, 'label-check-result', 1280, 800)

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

	const promoPage = await context.newPage()
	const promoErrors = []

	promoPage.on('pageerror', error => promoErrors.push(error.message))
	await promoPage.route('https://api.github.com/gists/example', route => route.fulfill({
		json: {
			id: 'example',
			files: Object.fromEntries(
				Object.entries(chatData).map(([key, value]) => [key + '.json', { content: JSON.stringify(value) }])
			)
		}
	}))
	for (const [name, width, height] of [['small-promo', 440, 280], ['marquee-promo', 1400, 560]]) {
		await promoPage.setViewportSize({ width, height })
		await promoPage.goto(`${origin}/screenshots/promo.html`)
		await promoPage.locator('.chatter-labels-icon').first()
			.waitFor()
		await promoPage.evaluate(async () => {
			await document.fonts.ready
			await Promise.all([...document.images].map(image => image.decode()))
		})
		assert.equal(await promoPage.locator('.chat-line__message:visible').count(), width > 440 ? 5 : 2)
		for (const selector of ['.brand', 'main']) {
			const box = await promoPage.locator(selector).boundingBox()

			assert.ok(box && box.x >= 0 && box.y >= 0 && box.x + box.width <= width &&
				box.y + box.height <= height, `${selector} is clipped in ${name}`)
		}
		assert.deepEqual(promoErrors, [])
		const promoOutput = new URL(`${name}-${width}x${height}.png`, output)

		await promoPage.screenshot({ path: fileURLToPath(promoOutput), animations: 'disabled' })
		const promoPng = await readFile(promoOutput)

		assert.equal(promoPng.readUInt32BE(16), width)
		assert.equal(promoPng.readUInt32BE(20), height)
		assert.equal(promoPng[25], 2, 'Promo PNG must be RGB without alpha')
		console.info(`Saved ${fileURLToPath(promoOutput)} (${width}×${height})`)
	}
} finally {
	await browser?.close()
	await new Promise(resolve => server.close(resolve))
}
