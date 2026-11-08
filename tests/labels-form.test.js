import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { setImmediate } from 'node:timers/promises'
import { test } from 'node:test'
import { JSDOM } from 'jsdom'
import { scriptExamples } from '../scripts/label-checks/examples.js'

const { window } = new JSDOM(await readFile(new URL('../pages/options.html', import.meta.url), 'utf8'))

globalThis.document = window.document
const { LabelsForm } = await import('../scripts/options/labels-form.js')

test('adds new labels at the top while preserving stored and saved order', async () => {
	const subscriptions = new Map()
	const storage = {
		data: {
			labels: ['First', 'Second'].map(name => ({
				id: name,
				name,
				icon: 'data:image/svg+xml,<svg/>',
				enabled: true,
				script: name === 'First' ? 'return true' : ' \n\t'
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
	for (const [index, fieldset] of fieldsets().entries()) {
		assert.equal(fieldset.querySelector('.label-script').open, false, 'stored scripts start collapsed')
		assert.equal(fieldset.querySelector('.script-status').textContent, index === 0 ? 'Present' : 'Absent')
	}
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
	assert.equal(draft.querySelector('.label-script').open, false)
	assert.equal(draft.querySelector('.script-status').textContent, 'Absent')

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
	const script = draft.querySelector('textarea[name="script"]')

	assert.ok(script, 'labels have an optional script field')
	const details = draft.querySelector('.label-script')
	const status = draft.querySelector('.script-status')

	details.open = true
	for (const value of ['return false', '', ' \n\t', 'return null']) {
		script.value = value
		script.dispatchEvent(new window.Event('input', { bubbles: true }))
		assert.equal(status.hidden, false, 'both script states remain visible')
		assert.equal(status.textContent, value.trim() ? 'Present' : 'Absent')
		assert.equal(status.classList.contains('primary'), !!value.trim())
		assert.equal(status.classList.contains('surface-variant'), !value.trim())
		assert.equal(details.open, true, 'editing does not change the disclosure state')
	}
	const examples = [...draft.querySelectorAll('.script-example')]

	assert.equal(examples.length, scriptExamples.length)
	for (const [index, example] of examples.entries()) {
		script.value = ''
		script.dispatchEvent(new window.Event('input', { bubbles: true }))
		assert.equal(status.textContent, 'Absent')
		assert.equal(example.querySelector('code').textContent, scriptExamples[index].script)
		example.querySelector('button').click()
		assert.equal(script.value, scriptExamples[index].script)
		assert.equal(status.textContent, 'Present', 'inserting a snippet updates the status')
	}
	const dialog = document.querySelector('dialog.confirm')

	dialog.showModal = () => {
		dialog.open = true
	}
	dialog.close = () => {
		dialog.open = false
		dialog.dispatchEvent(new window.Event('close'))
	}
	const previousScript = script.value

	examples[0].querySelector('button').click()
	assert.equal(dialog.open, true)
	dialog.returnValue = 'cancel'
	dialog.close()
	await setImmediate()
	assert.equal(script.value, previousScript)
	examples[0].querySelector('button').click()
	dialog.returnValue = 'ok'
	dialog.close()
	await setImmediate()
	assert.equal(script.value, scriptExamples[0].script)
	assert.deepEqual(storage.data.labels.map(label => label.name), ['First', 'Second'])
	script.value = 'return await Promise.resolve(user.id === "42")'
	await form._save()
	assert.deepEqual(storage.data.labels.map(label => label.name), ['New', 'First', 'Second'])
	assert.equal(storage.data.labels[0].script, script.value)
	assert.equal(draft.querySelector('.assignments').hidden, false)
	for (const callback of subscriptions.get('labels')) callback(storage.data.labels)
	assert.deepEqual(names(), ['New', 'First', 'Second'])
	assert.equal(fieldsets()[0].querySelector('textarea[name="script"]').value, script.value)
	assert.equal(fieldsets()[0].querySelector('.label-script').open, false)
	assert.equal(fieldsets()[0].querySelector('.script-status').textContent, 'Present')
})
