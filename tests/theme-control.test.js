import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { test } from 'node:test'
import { JSDOM } from 'jsdom'

const html = await readFile(new URL('../pages/options.html', import.meta.url), 'utf8')

async function setup(mode, dark = false, failure) {
	const { window } = new JSDOM(html)
	const media = new window.EventTarget()

	media.matches = dark
	window.matchMedia = query => {
		assert.equal(query, '(prefers-color-scheme: dark)')
		return media
	}
	const callbacks = new Map()
	const storage = {
		mode,
		async get(key) {
			assert.equal(key, 'theme')
			if (failure) throw failure
			return this.mode
		},
		async set(key, value) {
			assert.equal(key, 'theme')
			this.mode = value
			callbacks.get(key)(value)
		},
		subscribe(key, callback) {
			callbacks.set(key, callback)
		}
	}
	const { ThemeControl } = await import('../scripts/options/theme-control.js')
	const element = window.document.querySelector('.theme-control')
	const control = await ThemeControl.create(element, storage)

	return {
		window,
		storage,
		element,
		control,
		buttons: [...element.querySelectorAll('button')],
		selected: () => element.querySelector('[aria-pressed="true"]').value,
		isDark: () => window.document.body.classList.contains('dark'),
		system(value) {
			media.matches = value
			media.dispatchEvent(new window.Event('change'))
		},
		external(value) {
			callbacks.get('theme')(value)
		}
	}
}

test('defaults to System, follows live changes and normalizes unknown saved modes', async () => {
	for (const mode of [undefined, 'system', 'unknown']) {
		const state = await setup(mode, true)

		assert.equal(state.selected(), 'system')
		assert.equal(state.buttons.every(button => !button.disabled), true)
		assert.equal(state.isDark(), true)
		state.system(false)
		assert.equal(state.isDark(), false)
	}
})

test('restores explicit modes and ignores system changes until System is selected', async () => {
	for (const mode of ['light', 'dark']) {
		const state = await setup(mode, mode == 'light')

		assert.equal(state.selected(), mode)
		assert.equal(state.isDark(), mode == 'dark')
		state.system(false)
		state.system(true)
		assert.equal(state.isDark(), mode == 'dark')
		await state.control.save('system')
		assert.equal(state.storage.mode, 'system')
		assert.equal(state.isDark(), true)
		state.system(false)
		assert.equal(state.isDark(), false)
	}
})

test('saves each mode and applies updates from another options page', async () => {
	const state = await setup('system')

	for (const mode of ['dark', 'light', 'system']) {
		await state.control.save(mode)
		assert.equal(state.storage.mode, mode)
		assert.equal(state.isDark(), mode == 'dark')
	}
	state.external('dark')
	assert.equal(state.selected(), 'dark')
	assert.equal(state.isDark(), true)
	state.external('light')
	assert.equal(state.selected(), 'light')
	assert.equal(state.isDark(), false)
})

test('previews a pending save, then restores the previous mode on failure and allows retry', async () => {
	const state = await setup('light', true)
	let reject

	state.storage.set = () => new Promise((_resolve, fail) => {
		reject = fail
	})
	const saving = state.control.save('dark')

	assert.equal(state.isDark(), true)
	assert.equal(state.buttons.every(button => !button.disabled), true)
	reject(new Error('Storage unavailable'))
	await saving
	assert.equal(state.buttons.every(button => !button.disabled), true)
	assert.equal(state.selected(), 'light')
	assert.equal(state.isDark(), false)
	assert.equal(state.element.querySelector('.error').hidden, false)
	state.storage.set = async (_key, value) => {
		state.storage.mode = value
	}
	await state.control.save('dark')
	assert.equal(state.isDark(), true)
	assert.equal(state.element.querySelector('.error').hidden, true)
})

test('keeps System active and the control disabled when settings cannot load', async () => {
	const state = await setup(undefined, true, new Error('Storage unavailable'))

	assert.equal(state.buttons.every(button => button.disabled), true)
	assert.equal(state.isDark(), true)
	assert.equal(state.element.querySelector('.error').hidden, false)
	state.system(false)
	assert.equal(state.isDark(), false)
})

test('selects icon buttons by click and restores keyboard focus after saving', async () => {
	const state = await setup('system')
	const dark = state.buttons.find(button => button.value == 'dark')

	dark.focus()
	dark.click()
	await new Promise(resolve => setImmediate(resolve))
	assert.equal(state.selected(), 'dark')
	assert.equal(state.storage.mode, 'dark')
	assert.equal(state.window.document.activeElement, dark)
	assert.equal(dark.classList.contains('active'), true)
	assert.equal(state.buttons.filter(button => button.getAttribute('aria-pressed') == 'true').length, 1)
	for (const [key, mode] of [['ArrowRight', 'system'], ['End', 'dark'], ['ArrowLeft', 'light'], ['Home', 'system']]) {
		state.window.document.activeElement.dispatchEvent(new state.window.KeyboardEvent('keydown', { key, bubbles: true }))
		await new Promise(resolve => setImmediate(resolve))
		assert.equal(state.selected(), mode)
		assert.equal(state.storage.mode, mode)
		assert.equal(state.window.document.activeElement.value, mode)
	}
})

test('keeps the latest preview during rapid changes and rolls back to the last saved mode on failure', async () => {
	const state = await setup('system')
	const pending = []

	state.storage.set = (_key, mode) => new Promise((resolve, reject) => {
		pending.push({ mode, resolve, reject })
	})
	const first = state.control.save('dark')
	const second = state.control.save('light')

	assert.equal(state.selected(), 'light')
	assert.equal(state.buttons.every(button => !button.disabled), true)
	state.external('dark')
	assert.equal(state.selected(), 'light')
	pending[0].resolve()
	await first
	assert.equal(state.selected(), 'light')
	pending[1].reject(new Error('Storage unavailable'))
	await second
	assert.equal(state.selected(), 'dark')
	assert.equal(state.isDark(), true)
	assert.equal(state.element.querySelector('.error').hidden, false)

	const third = state.control.save('light')
	const fourth = state.control.save('system')

	pending[2].reject(new Error('Storage unavailable'))
	await third
	assert.equal(state.selected(), 'system')
	assert.equal(state.element.querySelector('.error').hidden, true)
	pending[3].resolve()
	await fourth
	assert.equal(state.selected(), 'system')
	assert.equal(state.isDark(), false)
})
