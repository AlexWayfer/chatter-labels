import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { test } from 'node:test'
import { JSDOM } from 'jsdom'

const source = await readFile(new URL('../scripts/content/page/lurkology-user-id.js', import.meta.url), 'utf8')

test('resolves historical authors by message ID and clears recycled rows', async () => {
	const { window } = new JSDOM('', { runScripts: 'outside-only', url: 'https://lurkology.com/logs' })
	const payload = { messages: [
		{ id: 'one', displayName: 'OldName', tags: { 'user-id': '123' } },
		{ id: 'ban', displayName: ':BannedName', tags: { 'user-id': '999', 'target-user-id': '456' } }
	] }
	let calls = 0
	window.fetch = async () => {
		calls++
		return { json: async () => payload }
	}
	window.eval(source)
	window.eval(source)
	const response = await window.fetch('https://bestlogs.lurkology.com/channel/test/2026/11/2?jsonBasic=1')
	assert.equal(await response.json(), payload)
	assert.equal(calls, 1)
	const row = window.document.createElement('span')
	row.innerHTML = '<button class="font-bold">OldName</button><a title="Permalink" href="?c=test#one"></a>'
	window.document.body.append(row)
	const resolve = () => row.dispatchEvent(new window.Event('chatter-labels:resolve-lurkology-user', { bubbles: true }))
	resolve()
	assert.equal(row.dataset.userId, '123')
	assert.equal(row.dataset.username, 'OldName')
	row.querySelector('a').href = '?c=test#ban'
	resolve()
	assert.equal(row.dataset.userId, '456')
	assert.equal(row.dataset.username, 'BannedName')
	row.querySelector('a').href = '?c=test#unknown'
	resolve()
	assert.equal(row.dataset.userId, undefined)
	assert.equal(row.dataset.username, undefined)
	window.close()
})

test('ignores unrelated responses and preserves fetch and JSON failures', async () => {
	const { window } = new JSDOM('', { runScripts: 'outside-only', url: 'https://lurkology.com/logs' })
	const error = new Error('Network failure')
	window.fetch = async url => {
		if (url.includes('fail')) throw error
		return { json: async () => {
			throw error
		} }
	}
	window.eval(source)
	await assert.rejects(window.fetch('https://bestlogs.lurkology.com/fail?jsonBasic=1'), error)
	const response = await window.fetch('https://bestlogs.lurkology.com/channel/test?jsonBasic=1')
	await assert.rejects(response.json(), error)
	window.close()
})
