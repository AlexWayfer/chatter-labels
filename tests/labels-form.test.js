import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { setImmediate } from 'node:timers/promises'
import { test } from 'node:test'
import { JSDOM } from 'jsdom'

const { window } = new JSDOM(await readFile(new URL('../pages/options.html', import.meta.url), 'utf8'))

globalThis.document = window.document
const { LabelsForm } = await import('../scripts/options/labels-form.js')

test('adds new labels at the top while preserving stored and saved order', async () => {
	const subscriptions = new Map()
	const storage = {
		data: {
			labels: ['First', 'Second'].map(name => ({
				id: name, name, icon: 'data:image/svg+xml,<svg/>', enabled: true
			})),
			assignments: []
		},
		async get(key) {
			return this.data[key]
		},
		async set(key, value) {
			this.data[key] = value
			for (const callback of subscriptions.get(key) ?? []) callback(value)
		},
		subscribe(key, callback) {
			const callbacks = subscriptions.get(key) ?? new Set()

			callbacks.add(callback)
			subscriptions.set(key, callbacks)
			return () => callbacks.delete(callback)
		}
	}
	const element = document.querySelector('.labels')
	const form = new LabelsForm(element, storage, { subscribe() {} })

	await setImmediate()
	const fieldsets = () => [...element.querySelector('.fieldsets').children]
	const names = () => fieldsets().map(fieldset => fieldset.querySelector('[name="name"]').value)

	assert.deepEqual(names(), ['First', 'Second'])
	const originalFirst = fieldsets()[0]
	const add = element.querySelector('button.add')

	add.click()
	const draft = fieldsets()[0]

	assert.notEqual(draft, originalFirst)
	draft.querySelector('[name="name"]').value = 'New'
	assert.deepEqual(names(), ['New', 'First', 'Second'])
	assert.equal(draft.querySelector('button.up').hidden, true)
	assert.equal(draft.querySelector('button.down').hidden, false)
	assert.equal(draft.querySelector('.assignments').hidden, true)

	add.click()
	const latest = fieldsets()[0]

	latest.querySelector('[name="name"]').value = 'Latest'
	assert.deepEqual(names(), ['Latest', 'New', 'First', 'Second'])
	latest.querySelector('button.down').click()
	assert.deepEqual(names(), ['New', 'Latest', 'First', 'Second'])
	latest.querySelector('button.delete').click()
	await setImmediate()
	assert.deepEqual(names(), ['New', 'First', 'Second'])

	draft.querySelector('[name="icon"]').value = 'data:image/svg+xml,<svg/>'
	await form._save()
	assert.deepEqual(storage.data.labels.map(label => label.name), ['New', 'First', 'Second'])
	assert.equal(draft.querySelector('.assignments').hidden, false)
	for (const callback of subscriptions.get('labels')) callback(storage.data.labels)
	assert.deepEqual(names(), ['New', 'First', 'Second'])
})
