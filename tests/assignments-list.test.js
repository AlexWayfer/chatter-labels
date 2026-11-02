import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { setImmediate } from 'node:timers/promises'
import { afterEach, mock, test } from 'node:test'
import { JSDOM } from 'jsdom'
import { TwitchAPI } from '../scripts/twitch/api.js'
import { MainStorage } from '../scripts/storage/main.js'

const { window } = new JSDOM(await readFile(new URL('../pages/options.html', import.meta.url), 'utf8'))

globalThis.document = window.document
const { AssignmentsList } = await import('../scripts/options/assignments-list.js')
afterEach(() => {
	mock.restoreAll()
	document.querySelectorAll('body > .assignments').forEach(element => element.remove())
})

test('adds a shared comment, edits and clears it while preserving dates and other assignments', async () => {
	const label = { id: 'friend', name: 'Friend' }
	const fragment = document.querySelector('template#label').content.cloneNode(true)
	const element = fragment.querySelector('.assignments')

	document.body.append(element)
	const storage = {
		assignments: [],
		async set(_key, assignments) {
			this.assignments = assignments
			this.callback(assignments)
		},
		async update(key, updater) {
			await this.set(key, updater(this.assignments))
		},
		subscribe(_key, callback) {
			this.callback = callback
			return () => {}
		}
	}
	const list = new AssignmentsList(element, storage, label, [])

	mock.method(TwitchAPI, 'fetchUsers', async () => [
		{ id: 'one', login: 'one', displayName: 'One' },
		{ id: 'two', login: 'two', displayName: 'Two' }
	])
	element.querySelector('.add-assignments textarea').value = 'one\ntwo'
	assert.equal(element.querySelector('.add-assignments [name="comment"]').type, 'text')
	element.querySelector('.add-assignments [name="comment"]').value = 'Reason <plain text>'
	await storage.set('assignments', await list.takePending())
	list.keepUnknownNicknames()
	assert.equal(element.querySelector('.add-assignments [name="comment"]').value, '')
	assert.deepEqual(storage.assignments.map(assignment => assignment.comment), ['Reason <plain text>', 'Reason <plain text>'])
	const assignedAt = storage.assignments[0].assignedAt
	const submitComment = async value => {
		const form = element.querySelector('li form')

		form.querySelector('[name="comment"]').value = value
		form.dispatchEvent(new window.Event('submit', { cancelable: true }))
		await setImmediate()
	}

	assert.equal(element.querySelector('li input[name="comment"]').value, 'Reason <plain text>')
	assert.equal(element.querySelector('li details').open, true)
	await submitComment('Changed')
	assert.equal(storage.assignments[0].comment, 'Changed')
	assert.equal(storage.assignments[0].assignedAt, assignedAt)
	assert.equal(storage.assignments[1].comment, 'Reason <plain text>')
	const set = mock.method(storage, 'set', async () => {
		throw new Error('Storage unavailable')
	})

	await submitComment('Unsaved reason')
	assert.equal(element.querySelector('li [name="comment"]').value, 'Unsaved reason')
	assert.equal(element.querySelector('li [name="comment"]').disabled, false)
	assert.equal(element.querySelector('li button[type="submit"]').disabled, false)
	assert.equal(element.querySelector('li .error').textContent, 'Storage unavailable')
	assert.equal(storage.assignments[0].comment, 'Changed')
	set.mock.restore()
	await submitComment('')
	assert.equal(storage.assignments[0].comment, '')
	assert.equal(element.querySelector('li details').open, false)
	assert.equal(element.querySelectorAll('li details')[1].open, true)
})

const setupEditors = async () => {
	globalThis.chrome = {
		storage: { onChanged: { addListener() {} }, local: { async set() {} } }
	}
	const labels = ['friend', 'other'].map(id => ({ id, name: id, icon: '', enabled: true }))
	const provider = {
		data: {
			labels,
			assignments: labels.flatMap(label => ['one', 'two'].map((userId, index) => ({
				userId,
				username: userId,
				login: userId,
				labelId: label.id,
				assignedAt: `2026-11-0${3 - index}T00:00:00Z`,
				comment: `Original ${userId}`
			})))
		},
		async get() {
			return this.data
		},
		async set(key, value) {
			this.data[key] = value
		}
	}
	const storage = new MainStorage(provider)
	const assignments = await storage.get('assignments')
	const elements = labels.map(label => {
		const element = document.querySelector('template#label').content.cloneNode(true).querySelector('.assignments')

		document.body.append(element)
		new AssignmentsList(element, storage, label, assignments)
		return element
	})
	const field = (list, row) => elements[list].querySelectorAll('li input[name="comment"]')[row]
	const submit = (list, row, value) => {
		const input = field(list, row)

		input.value = value
		input.form.dispatchEvent(new window.Event('submit', { cancelable: true }))
	}

	return { storage, provider, elements, field, submit }
}

test('preserves drafts, focus and expanded state when saving or sorting other assignments', async () => {
	const { elements, field, submit } = await setupEditors()
	const draft = field(0, 1)

	draft.value = 'Draft two'
	draft.focus()
	submit(0, 0, 'Saved one')
	await setImmediate()
	assert.equal(field(0, 1), draft)
	assert.equal(draft.value, 'Draft two')
	assert.equal(document.activeElement, draft)
	const details = draft.closest('details')

	details.open = false
	elements[0].querySelector('select').value = 'date'
	elements[0].querySelector('select').dispatchEvent(new window.Event('change'))
	assert.equal(field(0, 0), draft)
	assert.equal(field(0, 0).value, 'Draft two')
	assert.equal(details.open, false)
})

test('serializes overlapping comment saves across lists using the latest assignments', async () => {
	const { provider, field, submit, storage } = await setupEditors()
	let finish
	const write = mock.method(provider, 'set', async (key, value) => {
		await new Promise(resolve => {
			finish = () => {
				provider.data[key] = value
				resolve()
			}
		})
	})

	submit(0, 0, 'Changed friend one')
	submit(1, 1, 'Changed other two')
	await setImmediate()
	assert.equal(write.mock.callCount(), 1)
	assert.equal(field(1, 1).disabled, true)
	finish()
	await setImmediate()
	assert.equal(write.mock.callCount(), 2)
	assert.equal(field(1, 1).disabled, true)
	finish()
	await setImmediate()
	assert.deepEqual((await storage.get('assignments')).map(assignment => assignment.comment), [
		'Changed friend one', 'Original two', 'Original one', 'Changed other two'
	])
	assert.equal(field(0, 0).disabled, false)
	assert.equal(field(1, 1).disabled, false)
})

test('continues queued saves after a failed write and keeps the failed draft for retry', async () => {
	const { provider, field, submit, storage } = await setupEditors()
	let attempts = 0

	mock.method(provider, 'set', async (key, value) => {
		if (++attempts === 1) throw new Error('Storage unavailable')
		provider.data[key] = value
	})

	submit(0, 0, 'Failed draft')
	submit(0, 1, 'Saved two')
	await setImmediate()
	assert.equal(field(0, 0).value, 'Failed draft')
	assert.equal(field(0, 0).disabled, false)
	assert.equal(field(0, 0).form.querySelector('.error').textContent, 'Storage unavailable')
	assert.deepEqual((await storage.get('assignments')).slice(0, 2).map(assignment => assignment.comment), [
		'Original one', 'Saved two'
	])
	submit(0, 0, 'Retried one')
	await setImmediate()
	assert.deepEqual((await storage.get('assignments')).slice(0, 2).map(assignment => assignment.comment), [
		'Retried one', 'Saved two'
	])
})

test('updates clean comments from storage while preserving local drafts and removes deleted rows', async () => {
	const { storage, field, elements } = await setupEditors()
	const draft = field(0, 1)

	draft.value = 'Local draft'
	await storage.update('assignments', assignments => assignments.map(assignment => {
		return new assignment.constructor({ ...assignment, comment: 'Remote comment' })
	}))
	assert.equal(field(0, 0).value, 'Remote comment')
	assert.equal(field(0, 1).value, 'Local draft')
	assert.equal(field(1, 0).value, 'Remote comment')
	await storage.update('assignments', assignments => assignments.filter(assignment => assignment.user.id !== 'two'))
	assert.equal(draft.isConnected, false)
	assert.equal(elements[0].querySelectorAll('li').length, 1)
	assert.equal(elements[1].querySelectorAll('li').length, 1)
})
