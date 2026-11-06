import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { test } from 'node:test'
import { JSDOM } from 'jsdom'
import { Form } from '../scripts/options/form.js'

const html = await readFile(new URL('../pages/options.html', import.meta.url), 'utf8')

function setup(t, selector) {
	t.mock.timers.enable({ apis: ['setTimeout'] })
	const { window } = new JSDOM(html)
	const element = window.document.querySelector(selector)
	const button = element.querySelector('button[type="submit"]')

	return { element, button, form: new Form(element) }
}

for (const selector of ['form[name="github-gist"]', '.labels']) {
	test(`${selector}: shows saving and saved feedback in the button`, async t => {
		const { element, button, form } = setup(t, selector)
		let finish
		const pending = new Promise(resolve => {
			finish = resolve
		})
		const saving = form._save(() => pending)

		assert.equal(button.classList.contains('saving'), true)
		assert.equal(button.querySelector('.text-saving').textContent, 'Saving...')
		assert.equal(button.disabled, true)
		assert.equal(form._saving, true)
		t.mock.timers.tick(2000)
		assert.equal(button.classList.contains('saving'), true)
		finish()
		await saving
		assert.equal(button.classList.contains('saving'), false)
		assert.equal(button.classList.contains('saved'), true)
		assert.equal(button.querySelector('.text-saved').textContent, 'Saved!')
		assert.equal(button.disabled, true)
		assert.equal(form._saving, false, 'success feedback must not suppress storage updates')
		assert.equal(element.querySelector('.toast.saved'), null)
		const duplicate = t.mock.fn()

		await form._save(duplicate)
		assert.equal(duplicate.mock.callCount(), 0)
		t.mock.timers.tick(1499)
		assert.equal(button.classList.contains('saved'), true)
		t.mock.timers.tick(1)
		assert.equal(button.classList.contains('saved'), false)
		assert.equal(button.querySelector('.text-save').textContent, 'Save')
		assert.equal(button.disabled, false)
		await form._save(async () => {})
		assert.equal(button.classList.contains('saved'), true)
	})
}

test('restores Save after a failure and allows a retry', async t => {
	const { element, button, form } = setup(t, '.labels')
	const error = new Error('Storage unavailable')
	const saving = form._save(async () => {
		throw error
	})

	assert.equal(button.classList.contains('saving'), true)
	await assert.rejects(saving, error)
	assert.equal(button.classList.contains('saving'), false)
	assert.equal(button.classList.contains('saved'), false)
	assert.equal(button.disabled, false)
	assert.equal(form._saving, false)
	assert.equal(element.querySelector('.toast.error').textContent, error.message)
	assert.equal(element.querySelector('.toast.error').hidden, false)
	await form._save(async () => {})
	assert.equal(button.classList.contains('saved'), true)
})
