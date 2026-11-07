import assert from 'node:assert/strict'
import { test } from 'node:test'
import { JSDOM } from 'jsdom'
import { getUserScriptsStatus, userScriptsSettingsUrl, requireUserScripts } from '../scripts/label-checks/user-scripts.js'
import { UserScriptsNotice } from '../scripts/content/user-scripts-notice.js'

test('probes the API method rather than trusting an exposed userScripts object', async () => {
	const extension = { userScripts: {
		execute() {},
		async getScripts() {
			return []
		}
	} }

	assert.equal((await getUserScriptsStatus(extension, 'Chrome/138.0')).enabled, true)
	extension.userScripts.getScripts = async () => {
		throw new Error('Access denied')
	}
	const disabled = await getUserScriptsStatus(extension, 'Chrome/138.0')

	assert.equal(disabled.enabled, false)
	assert.match(disabled.message, /Allow user scripts/)
	Object.defineProperty(extension, 'userScripts', { get() {
		throw new Error('Unavailable')
	} })
	assert.equal((await getUserScriptsStatus(extension, 'Chrome/138.0')).enabled, false)
	assert.equal((await getUserScriptsStatus({}, 'Chrome/135.0')).enabled, false)
	assert.match((await getUserScriptsStatus({}, 'Chrome/135.0')).message, /Developer mode/)
	await assert.rejects(requireUserScripts(extension, 'Chrome/138.0'), { code: 'user-scripts-disabled' })
	assert.equal(userScriptsSettingsUrl('own-extension', 'Chrome/138.0'), 'chrome://extensions/?id=own-extension')
	assert.equal(userScriptsSettingsUrl('own-extension', 'Chrome/135.0'), 'chrome://extensions/')
})

test('enablement notice opens settings, retries and ignores disposed responses', async () => {
	const { window } = new JSDOM(`<div hidden><p role="status"></p>
		<button class="open-user-scripts-settings"></button><button class="retry-user-scripts"></button></div>`)
	const element = window.document.querySelector('div')
	const messages = []
	let enabled = false
	let finish
	const send = async message => {
		messages.push(message.type)
		if (message.type === 'open-user-scripts-settings') return { ok: true }
		if (finish) return new Promise(resolve => {
			finish = resolve
		})
		return { enabled, message: 'Turn on Allow user scripts.' }
	}
	const changes = []
	const notice = new UserScriptsNotice(element, value => changes.push(value), send)

	await notice.refresh()
	assert.equal(element.hidden, false)
	assert.match(element.textContent, /Allow user scripts/)
	element.querySelector('.open-user-scripts-settings').click()
	await Promise.resolve()
	assert.equal(messages.at(-1), 'open-user-scripts-settings')
	enabled = true
	await notice.refresh()
	assert.equal(element.hidden, true)
	assert.deepEqual(changes, [false, true])
	finish = true
	const pending = notice.refresh()

	await Promise.resolve()
	notice.destroy()
	finish({ enabled: false, message: 'Disabled again' })
	await pending
	assert.equal(element.hidden, true)
	assert.deepEqual(changes, [false, true])
})
