import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { test } from 'node:test'
import { JSDOM } from 'jsdom'

const source = await readFile(new URL('../scripts/content/page/message-user-id.js', import.meta.url), 'utf8')

test('resolves chat authors through React ancestors and skips the AutoMod user', () => {
	const { window } = new JSDOM('', { runScripts: 'outside-only' })

	try {
		window.eval(source)
		const element = window.document.createElement('div')

		element.__reactFiber$test = {
			memoizedProps: {},
			return: {
				memoizedProps: { message: { user: { login: 'automod', id: 'wrong' } } },
				return: { memoizedProps: { message: { sender: { login: 'author', id: 42 } } } }
			}
		}
		window.document.body.append(element)
		element.dispatchEvent(new window.Event('chatter-labels:resolve-user-id'))
		assert.equal(element.dataset.userId, '42')
	} finally {
		window.close()
	}
})

for (const [className, props, expected] of [
	['whispers-list-item', { user: { id: 'peer' } }, 'peer'],
	['thread-message__message', { message: { from: 'author' } }, 'author'],
	['thread-message__message', { message: { from: { id: 'author' } } }, 'author'],
	['whispers__header', {
		data: {
			currentUser: { id: 'self' },
			whisperThread: { participants: [{ id: 'self' }, { id: 'peer' }] }
		}
	}, 'peer']
]) {
	test(`resolves ${className} from its own React data`, () => {
		const { window } = new JSDOM('', { runScripts: 'outside-only' })

		try {
			window.eval(source)
			const element = window.document.createElement('div')

			element.className = className
			element.__reactFiber$test = { memoizedProps: props }
			window.document.body.append(element)
			element.dispatchEvent(new window.Event('chatter-labels:resolve-user-id'))
			assert.equal(element.dataset.userId, expected)
		} finally {
			window.close()
		}
	})
}

test('resolves FFZ message replacements through the participant map on a React ancestor', () => {
	const { window } = new JSDOM('', { runScripts: 'outside-only' })

	try {
		window.eval(source)
		window.document.body.innerHTML = '<div><div class="thread-message__message"><span class="thread-message__message--user-name">名前</span></div></div>'
		const parent = window.document.body.firstElementChild

		parent.__reactFiber$test = {
			memoizedProps: {
				participantsByID: {
					self: { id: 'self', displayName: 'Self', login: 'self' },
					peer: { id: 'peer', displayName: '名前', login: 'peer' }
				}
			}
		}
		const message = parent.firstElementChild

		message.dispatchEvent(new window.Event('chatter-labels:resolve-user-id'))
		assert.equal(message.dataset.userId, 'peer')
	} finally {
		window.close()
	}
})

test('reads committed React props and clears stale IDs when a whisper row is reused', () => {
	const { window } = new JSDOM('', { runScripts: 'outside-only' })

	try {
		window.eval(source)
		const element = window.document.createElement('div')
		const oldRoot = { stateNode: {} }
		const currentRoot = { stateNode: oldRoot.stateNode }

		oldRoot.stateNode.current = currentRoot
		element.className = 'whispers-list-item'
		element.dataset.userId = 'old'
		element.__reactFiber$test = {
			memoizedProps: { user: { id: 'old' } },
			return: oldRoot,
			alternate: { memoizedProps: { user: { id: 'new' } }, return: currentRoot }
		}
		window.document.body.append(element)
		element.dispatchEvent(new window.Event('chatter-labels:resolve-user-id'))
		assert.equal(element.dataset.userId, 'new')
		element.__reactFiber$test.alternate.memoizedProps = {}
		element.dispatchEvent(new window.Event('chatter-labels:resolve-user-id'))
		assert.equal(element.dataset.userId, undefined)
	} finally {
		window.close()
	}
})
