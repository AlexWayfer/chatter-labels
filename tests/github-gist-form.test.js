import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { test } from 'node:test'
import { JSDOM } from 'jsdom'
import { GitHubGistForm } from '../scripts/options/github-gist-form.js'

const html = await readFile(new URL('../pages/options.html', import.meta.url), 'utf8')

test('keeps the form hidden until saved settings are loaded', async () => {
	const { window } = new JSDOM(html)
	const element = window.document.querySelector('form[name="github-gist"]')
	let resolve
	const pending = new Promise(done => {
		resolve = done
	})
	const loading = GitHubGistForm.create(element, {
		get: () => pending,
		subscribe() {}
	})

	assert.equal(element.hidden, true)
	resolve({ githubGist: { token: 'saved-token', gistId: 'saved-id' } })
	await loading
	assert.equal(element.hidden, false)
	assert.equal(element.elements.token.value, 'saved-token')
	assert.equal(element.elements.gistId.value, 'saved-id')
	assert.equal(element.parentElement.querySelector('.storage-notice').hidden, true)
})

test('shows a settings read error without opening an empty form', async () => {
	const { window } = new JSDOM(html)
	const element = window.document.querySelector('form[name="github-gist"]')

	await GitHubGistForm.create(element, {
		async get() {
			throw new Error('Storage unavailable')
		}
	})
	assert.equal(element.hidden, true)
	assert.equal(element.parentElement.querySelector('.storage-notice').textContent, 'Storage unavailable')
})

function setup(t, githubGist = { token: 'token', gistId: 'existing' }) {
	const { window } = new JSDOM(html)
	const element = window.document.querySelector('form[name="github-gist"]')
	const storage = { githubGist }
	let notify
	const optionsStorage = {
		set: t.mock.fn(async (_key, value) => notify(value)),
		subscribe(_key, callback) {
			notify = callback
		}
	}
	const form = new GitHubGistForm(element, storage, optionsStorage)

	return { element, storage, optionsStorage, form, notify: value => notify(value) }
}

test('shows the stored gist ID and follows settings updates', t => {
	const { element, notify } = setup(t)

	assert.equal(element.elements.gistId.value, 'existing')
	notify({ githubGist: { token: 'updated', gistId: 'other' } })
	assert.equal(element.elements.gistId.value, 'other')
})

test('saves the entered gist ID after checking access', async t => {
	const { element, form, storage } = setup(t)

	element.elements.gistId.value = ' selected '
	t.mock.method(globalThis, 'fetch', async (url, options) => {
		assert.ok(url.endsWith('/selected'))
		assert.equal(options.method, 'GET')
		return Response.json({ id: 'selected' })
	})
	await form._save()
	assert.equal(storage.githubGist.gistId, 'selected')
})

test('displays access errors and preserves saved settings', async t => {
	const { element, form, storage, optionsStorage } = setup(t)

	element.elements.gistId.value = 'missing'
	t.mock.method(globalThis, 'fetch', async () => new Response('', { status: 404 }))
	await assert.rejects(form._save(), /404/)
	assert.equal(element.querySelector('.toast.error').hidden, false)
	assert.match(element.querySelector('.toast.error').textContent, /404/)
	assert.equal(optionsStorage.set.mock.callCount(), 0)
	assert.equal(storage.githubGist.gistId, 'existing')
})

test('creates a new gist when the ID is cleared and displays its ID', async t => {
	const { element, form, storage } = setup(t)

	element.elements.gistId.value = ''
	t.mock.method(globalThis, 'fetch', async (_url, options) => {
		assert.equal(options.method, 'POST')
		return Response.json({ id: 'created' })
	})
	await form._save()
	assert.equal(storage.githubGist.gistId, 'created')
	assert.equal(element.elements.gistId.value, 'created')
})
