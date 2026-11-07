let codeTools

function loadTools(document) {
	// DOM-only environments keep the native textarea; supported browsers load CodeMirror.
	if (!document.defaultView?.requestAnimationFrame) return Promise.resolve(null)
	return codeTools ??= import('../../vendor/code-editor/editor.js')
}

export function highlightScript(element, source, { load = loadTools } = {}) {
	element.textContent = source
	return Promise.resolve().then(() => load(element.ownerDocument))
		.then(tools => {
			if (element.isConnected) tools?.highlightSource(element, source)
		})
		.catch(() => {})
}

export class ScriptEditor {
	#textarea
	#view
	#destroyed = false

	constructor(textarea, { load = loadTools } = {}) {
		this.#textarea = textarea
		this.ready = load(textarea.ownerDocument).then(tools => {
			if (!tools || this.#destroyed || !textarea.isConnected) return
			const focused = textarea.ownerDocument.activeElement === textarea

			this.#view = tools.createScriptEditor(textarea, value => {
				textarea.value = value
				textarea.dispatchEvent(new textarea.ownerDocument.defaultView.Event('input', { bubbles: true }))
			})
			textarea.hidden = true
			textarea.parentElement.classList.add('has-code-editor')
			textarea.parentElement.querySelector('label')?.classList.add('active')
			if (focused) this.#view.focus()
		})
			.catch(error => {
				if (this.#destroyed) return
				const notice = textarea.ownerDocument.createElement('p')

				notice.className = 'script-highlight-error'
				notice.textContent = 'Syntax highlighting could not load. You can still edit and save this script.'
				textarea.parentElement.after(notice)
				console.error('[Chatter Labels] Could not load code editor', error)
			})
	}

	replace(source) {
		this.#textarea.value = source
		if (this.#view) {
			this.#view.replace(source)
			this.#view.focus()
		} else {
			this.#textarea.focus()
			this.#textarea.setSelectionRange(0, 0)
			this.#textarea.scrollTop = 0
		}
	}

	destroy() {
		this.#destroyed = true
		this.#view?.destroy()
	}
}
