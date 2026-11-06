import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { setImmediate } from 'node:timers/promises'
import { afterEach, mock, test } from 'node:test'
import { JSDOM } from 'jsdom'
import { IconField } from '../scripts/options/icon-field.js'

const { window } = new JSDOM(await readFile(new URL('../pages/options.html', import.meta.url), 'utf8'))

globalThis.document = window.document
globalThis.Event = window.Event
globalThis.createImageBitmap = async () => {}

afterEach(() => mock.restoreAll())

const setup = () => {
	const fieldset = document.querySelector('template#label').content.querySelector('fieldset').cloneNode(true)
	const input = fieldset.querySelector('input.icon')
	const value = fieldset.querySelector('[name="icon"]')
	const name = fieldset.querySelector('[name="name"]')
	const preview = fieldset.querySelector('.icon-preview')
	const report = mock.method(input, 'reportValidity')
	const select = async file => {
		Object.defineProperty(input, 'files', { configurable: true, value: file ? [file] : [] })
		input.dispatchEvent(new Event('change'))
		await setImmediate()
	}

	new IconField(fieldset)
	return { input, value, name, preview, report, select }
}

test('accepts an image larger than 256 KB and uses the resized icon in the form', async () => {
	const { input, value, name, preview, report, select } = setup()
	const file = new window.File([new Uint8Array(256 * 1024 + 1)], 'Large icon.png', { type: 'image/png' })
	const bitmap = { width: 2048, height: 1024, close: mock.fn() }
	const decode = mock.method(globalThis, 'createImageBitmap', async () => bitmap)
	const draw = mock.fn()
	const output = 'data:image/png;base64,cmVzaXplZA=='
	let canvas

	mock.method(window.HTMLCanvasElement.prototype, 'getContext', function () {
		canvas = this
		return { drawImage: draw }
	})
	mock.method(window.HTMLCanvasElement.prototype, 'toDataURL', () => output)
	await select(file)
	assert.equal(report.mock.callCount(), 0)
	assert.equal(input.validationMessage, '')
	assert.equal(input.required, false)
	assert.deepEqual(decode.mock.calls[0].arguments, [file])
	assert.deepEqual([canvas.width, canvas.height], [72, 36])
	assert.deepEqual(draw.mock.calls[0].arguments, [bitmap, 0, 0, 72, 36])
	assert.equal(bitmap.close.mock.callCount(), 1)
	assert.equal(value.value, output)
	assert.equal(preview.getAttribute('src'), output)
	assert.equal(name.value, 'Large icon')
})

test('keeps SVG icons as vectors', async () => {
	const { value, preview, select } = setup()
	const source = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"/>'

	await select({
		name: 'Vector.svg',
		type: 'image/svg+xml',
		size: source.length,
		async text() {
			return source
		}
	})
	assert.equal(value.value, `data:image/svg+xml,${encodeURIComponent(source)}`)
	assert.equal(preview.getAttribute('src'), value.value)
})

test('checks the PNG byte limit after resizing and accepts exactly 256 KB', async () => {
	const limit = 256 * 1024

	for (const size of [limit, limit + 1]) {
		const { input, value, name, preview, report, select } = setup()
		const output = `data:image/png;base64,${btoa('x'.repeat(size))}`

		mock.method(globalThis, 'createImageBitmap', async () => ({ width: 1024, height: 512, close() {} }))
		mock.method(window.HTMLCanvasElement.prototype, 'getContext', () => ({ drawImage() {} }))
		mock.method(window.HTMLCanvasElement.prototype, 'toDataURL', () => output)
		await select({ name: 'Large.png', type: 'image/png', size: limit * 2 })
		if (size == limit) {
			assert.equal(input.validationMessage, '')
			assert.equal(value.value, output)
			assert.equal(preview.getAttribute('src'), output)
		} else {
			assert.equal(input.validationMessage, 'Image must be smaller than 256 KB')
			assert.equal(report.mock.callCount(), 1)
			assert.equal(value.value, '')
			assert.equal(preview.getAttribute('src'), null)
			assert.equal(name.value, '')
		}
	}
})

test('rejects oversized SVGs without replacing the existing icon or name', async () => {
	const { input, value, name, preview, select } = setup()
	const source = '<svg/>'
	const file = {
		name: 'Original.svg',
		type: 'image/svg+xml',
		size: source.length,
		async text() {
			return source
		}
	}

	await select(file)
	const original = value.value

	await select({ ...file, name: 'Large.svg', size: 256 * 1024 + 1 })
	assert.equal(input.validationMessage, 'Image must be smaller than 256 KB')
	assert.equal(value.value, original)
	assert.equal(preview.getAttribute('src'), original)
	assert.equal(name.value, 'Original')
	await select(file)
	assert.equal(input.validationMessage, '')
})

test('reports unreadable large images, keeps the current icon and recovers on a new selection', async () => {
	const { input, value, name, preview, report, select } = setup()
	const source = '<svg/>'
	const valid = {
		name: 'Original.svg',
		type: 'image/svg+xml',
		size: source.length,
		async text() {
			return source
		}
	}

	await select(valid)
	const original = value.value

	mock.method(globalThis, 'createImageBitmap', async () => {
		throw new Error('Invalid image')
	})
	await select({ name: 'Broken.png', type: 'image/png', size: 1024 * 1024 })
	assert.equal(input.validationMessage, 'Could not read image')
	assert.equal(report.mock.callCount(), 1)
	assert.equal(value.value, original)
	assert.equal(preview.getAttribute('src'), original)
	assert.equal(name.value, 'Original')
	await select(valid)
	assert.equal(input.validationMessage, '')
	assert.equal(value.value, original)
})
