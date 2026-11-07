import { EditorState, Transaction } from '@codemirror/state'
import { EditorView, keymap } from '@codemirror/view'
import { defaultKeymap, history, historyKeymap, indentWithTab } from '@codemirror/commands'
import { indentUnit, syntaxHighlighting } from '@codemirror/language'
import { javascript, javascriptLanguage } from '@codemirror/lang-javascript'
import { classHighlighter, highlightTree } from '@lezer/highlight'

export function createScriptEditor(textarea, onChange) {
	const tabSize = Number(getComputedStyle(textarea).tabSize) || 4
	const view = new EditorView({
		doc: textarea.value,
		extensions: [
			javascript(),
			history(),
			syntaxHighlighting(classHighlighter),
			EditorState.tabSize.of(tabSize),
			indentUnit.of('\t'),
			keymap.of([indentWithTab, ...defaultKeymap, ...historyKeymap]),
			EditorView.contentAttributes.of({ 'aria-label': 'JavaScript check script', 'aria-multiline': 'true' }),
			EditorView.updateListener.of(update => {
				if (update.docChanged) onChange(update.state.doc.toString())
			})
		]
	})

	textarea.after(view.dom)
	return {
		replace(value) {
			view.dispatch({
				changes: { from: 0, to: view.state.doc.length, insert: value },
				selection: { anchor: 0 },
				annotations: Transaction.userEvent.of('input.paste')
			})
		},
		focus() {
			view.focus()
		},
		destroy() {
			view.destroy()
		}
	}
}

export function highlightSource(element, source) {
	const document = element.ownerDocument
	const fragment = document.createDocumentFragment()
	let position = 0

	highlightTree(javascriptLanguage.parser.parse(source), classHighlighter, (from, to, classes) => {
		if (from > position) fragment.append(document.createTextNode(source.slice(position, from)))
		const span = document.createElement('span')

		span.className = classes
		span.textContent = source.slice(from, to)
		fragment.append(span)
		position = to
	})
	if (position < source.length) fragment.append(document.createTextNode(source.slice(position)))
	element.replaceChildren(fragment)
}
