import assert from 'node:assert/strict'
import { test } from 'node:test'
import { JSDOM } from 'jsdom'
import { ScriptEditor, highlightScript } from '../scripts/options/script-editor.js'

test('keeps the form value in sync and preserves edits made before the editor loads', async () => {
	const { window } = new JSDOM('<textarea name="script">original</textarea>')
	const textarea = window.document.querySelector('textarea')
	let loaded
	let changed
	let destroyed = false
	let inputs = 0
	const editor = new ScriptEditor(textarea, { load: () => new Promise(resolve => {
		loaded = resolve
	}) })

	textarea.addEventListener('input', () => inputs++)
	editor.replace('return true')
	loaded({ createScriptEditor(input, onChange) {
		assert.equal(input.value, 'return true')
		changed = onChange
		return {
			replace: value => onChange(value),
			focus() {},
			destroy() {
				destroyed = true
			}
		}
	} })
	await editor.ready
	assert.equal(textarea.hidden, true)
	changed('return false')
	assert.equal(textarea.value, 'return false')
	assert.equal(inputs, 1)
	editor.replace('return null')
	assert.equal(textarea.value, 'return null')
	editor.destroy()
	assert.equal(destroyed, true)
})

test('does not mount a late editor after its label was removed', async () => {
	const { window } = new JSDOM('<textarea></textarea>')
	let loaded
	let mounted = false
	const editor = new ScriptEditor(window.document.querySelector('textarea'), {
		load: () => new Promise(resolve => {
			loaded = resolve
		})
	})

	editor.destroy()
	loaded({ createScriptEditor() {
		mounted = true
	} })
	await editor.ready
	assert.equal(mounted, false)
})

test('highlights examples after template nodes are adopted into the live document', async () => {
	const { window } = new JSDOM('<template><code></code></template>')
	const code = window.document.querySelector('template').content.firstElementChild.cloneNode(true)
	let highlighted = false
	const ready = highlightScript(code, 'return true', { load: async document => {
		assert.equal(document, window.document)
		return { highlightSource(element, source) {
			assert.equal(element, code)
			assert.equal(source, 'return true')
			highlighted = true
		} }
	} })

	window.document.body.append(code)
	await ready
	assert.equal(highlighted, true)
})
