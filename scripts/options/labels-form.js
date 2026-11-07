import { logger } from '../logger.js'
import { Label } from '../models/label.js'
import { AssignmentsList } from './assignments-list.js'
import { confirm } from './confirm-dialog.js'
import { Form } from './form.js'
import { IconField } from './icon-field.js'
import { scriptExamples, scriptFunctions } from '../label-checks/examples.js'
import { ScriptEditor, highlightScript } from './script-editor.js'
import { UserScriptsNotice } from '../content/user-scripts-notice.js'
import { createTabs } from './tabs.js'

export class LabelsForm extends Form {
	#mainStorage
	#optionsStorage
	#labels
	#assignments
	#assignmentsLists = new WeakMap()
	#fieldsetsElement
	#fieldsetTemplate
	#scriptEditors = new Map()
	#scriptAccess
	#scriptAccessActive = false

	constructor(element, mainStorage, optionsStorage) {
		super(element)

		this.#mainStorage = mainStorage
		this.#optionsStorage = optionsStorage
		this.#labels = []
		this.#assignments = []

		this.#fieldsetsElement = this._element.querySelector('.fieldsets')
		this.#fieldsetTemplate = this._element.querySelector('template#label')
		this.#scriptAccess = new UserScriptsNotice(this._element.querySelector('.user-scripts-notice'))

		this._element.querySelector('button.add').addEventListener('click', _event => {
			this.add({}, { prepend: true })
		})

		this._element.addEventListener('input', _event => {
			this.#validateUniqueNames()
			this.#updateScriptAccess()
		})

		this._element.querySelector('form[name="labels"]').addEventListener('submit', event => {
			event.preventDefault()

			this.#validateUniqueNames()

			if (!event.currentTarget.checkValidity()) return

			this._save()
		})

		this.#subscribe()

		this.#load()
	}

	add(data = {}, { prepend = false } = {}) {
		const
			fieldsetFragment = document.importNode(this.#fieldsetTemplate.content, true),
			fieldsetElement = fieldsetFragment.querySelector('fieldset')

		fieldsetElement.querySelectorAll('input[name], textarea[name="script"]').forEach(input => {
			if (input.type == 'checkbox') {
				input.checked = data[input.name] ?? true
				return
			}

			input.value = data[input.name] ?? (input.name == 'id' ? crypto.randomUUID() : '')
		})

		new IconField(fieldsetElement)
		const script = fieldsetElement.querySelector('textarea[name="script"]')

		fieldsetElement.querySelector('.label-script').open = !!script.value.trim()
		fieldsetElement.querySelector('.label-script').addEventListener('toggle', () => this.#updateScriptAccess())
		const exampleTemplate = fieldsetElement.querySelector('template.script-example-template')
		const exampleTabs = fieldsetElement.querySelector('.script-example-tabs')
		const examplePanels = []
		const populateSnippet = (element, example) => {
			element.querySelector('p').textContent = example.description
			highlightScript(element.querySelector('code'), example.script)
			element.querySelector('button').addEventListener('click', async () => {
				if (script.value.trim() && script.value !== example.script &&
					!await confirm([`Replace this check script with "${example.title}"?`, 'Click "Save" to apply.'].join('\n'))) return
				this.#scriptEditors.get(fieldsetElement).replace(example.script)
				this.#updateScriptAccess()
			})
		}

		for (const example of scriptExamples) {
			const element = exampleTemplate.content.firstElementChild.cloneNode(true)

			populateSnippet(element, example)
			examplePanels.push({ title: example.title, panel: element })
			fieldsetElement.querySelector('.script-examples-list').append(element)
		}
		createTabs(exampleTabs, examplePanels)
		const functionTemplate = fieldsetElement.querySelector('template.script-function-template')
		const functionGroup = `script-functions-${crypto.randomUUID()}`

		for (const example of scriptFunctions) {
			const element = functionTemplate.content.firstElementChild.cloneNode(true)

			element.name = functionGroup
			element.querySelector('summary span').textContent = example.title
			populateSnippet(element, example)
			fieldsetElement.querySelector('.script-functions-list').append(element)
		}
		for (const code of fieldsetElement.querySelectorAll('.script-help pre code')) highlightScript(code, code.textContent)
		createTabs(
			fieldsetElement.querySelector('.script-reference-tabs'),
			[...fieldsetElement.querySelector('.script-reference-pages').children].map(panel => ({ title: panel.dataset.title, panel }))
		)

		fieldsetElement.querySelector('button.up').addEventListener('click', _event => {
			fieldsetElement.previousElementSibling.before(fieldsetElement)
			this.#updateMoveButtons()
		})

		fieldsetElement.querySelector('button.down').addEventListener('click', _event => {
			fieldsetElement.nextElementSibling.after(fieldsetElement)
			this.#updateMoveButtons()
		})

		fieldsetElement.querySelector('button.delete').addEventListener('click', async _event => {
			const
				id = fieldsetElement.querySelector('input[name="id"]').value,
				name = fieldsetElement.querySelector('input[name="name"]').value

			if (
				this.#labels.some(label => label.id == id) &&
				!await confirm([
					`Remove label "${name}" from the list?`,
					'Click "Save" to apply.'
				].join('\n'))
			) {
				return
			}

			fieldsetElement.remove()
			this.#scriptEditors.get(fieldsetElement)?.destroy()
			this.#scriptEditors.delete(fieldsetElement)
			this.#assignmentsLists.delete(fieldsetElement)
			this.#updateMoveButtons()
			this.#updateScriptAccess()
		})

		if (prepend) {
			this.#fieldsetsElement.prepend(fieldsetFragment)
		} else {
			this.#fieldsetsElement.append(fieldsetFragment)
		}

		const list = new AssignmentsList(
			fieldsetElement.querySelector('.assignments'),
			this.#mainStorage,
			data.id ? data : null,
			this.#assignments
		)

		this.#assignmentsLists.set(fieldsetElement, list)
		this.#scriptEditors.set(fieldsetElement, new ScriptEditor(script))
		this.#updateMoveButtons()
		this.#updateScriptAccess()
	}

	#updateScriptAccess() {
		const active = this.#fieldsets.some(fieldset => {
			return fieldset.querySelector('[name="script"]').value.trim() || fieldset.querySelector('.label-script').open
		})

		if (active === this.#scriptAccessActive) return
		this.#scriptAccessActive = active
		if (active) this.#scriptAccess.refresh()
		else this.#scriptAccess.hide()
	}

	get #fieldsets() {
		return Array.from(this.#fieldsetsElement.children)
	}

	#updateMoveButtons() {
		const fieldsets = this.#fieldsets

		fieldsets.forEach((fieldset, index) => {
			fieldset.querySelector('button.up').hidden = index == 0
			fieldset.querySelector('button.down').hidden = index == fieldsets.length - 1
		})
	}

	#renderLabels() {
		for (const editor of this.#scriptEditors.values()) editor.destroy()
		this.#scriptEditors.clear()
		this.#fieldsetsElement.replaceChildren()

		this.#labels.forEach(label => this.add(label))
		this.#updateScriptAccess()
	}

	#subscribe() {
		this.#mainStorage.subscribe('labels', labels => {
			this.#labels = labels

			if (this._saving) return

			this.#renderLabels()
		})

		this.#mainStorage.subscribe('assignments', assignments => {
			this.#assignments = assignments
		})

		this.#optionsStorage.subscribe('storage', () => {
			if (this._element.classList.contains('error')) this.#load()
		})
	}

	async #load() {
		this._element.classList.add('loading')
		this._element.classList.remove('error')

		try {
			this.#labels = await this.#mainStorage.get('labels')
			this.#assignments = await this.#mainStorage.get('assignments')
			this.#renderLabels()
			this._element.classList.remove('loading')
		} catch (error) {
			this._element.classList.remove('loading')
			this._element.classList.add('error')
			this._element.querySelector('.error-notice').textContent = error.message
		}
	}

	async _save() {
		await super._save(async () => {
			const labelsByFieldset = new Map()

			for (const fieldset of this.#fieldsets) {
				logger.debug('fieldset inputs = ', fieldset.querySelectorAll('input[name]'))

				const label = new Label(
					Object.fromEntries(
						Array.from(fieldset.querySelectorAll('input[name], textarea[name="script"]')).map(
							input => [input.name, input.type == 'checkbox' ? input.checked : input.value]
						)
					)
				)

				labelsByFieldset.set(fieldset, label)
			}

			this.#labels = [...labelsByFieldset.values()]

			logger.debug('this.#labels = ', this.#labels)

			await this.#mainStorage.set('labels', this.#labels)

			this.#assignments = this.#assignments.filter(
				assignment => this.#labels.some(label => label.id == assignment.label.id)
			)

			const listsWithPending = []

			for (const [fieldset, label] of labelsByFieldset) {
				const list = this.#assignmentsLists.get(fieldset)

				list.label = label
				const pending = await list.takePending()

				if (!pending.length) continue

				this.#assignments.push(...pending)
				listsWithPending.push(list)
			}

			await this.#mainStorage.set('assignments', this.#assignments)

			for (const list of listsWithPending) list.toastAdded.show()
			for (const fieldset of labelsByFieldset.keys()) {
				this.#assignmentsLists.get(fieldset).keepUnknownNicknames()
			}
		})
	}

	#validateUniqueNames() {
		const seen = new Set()

		Array.from(this._element.querySelectorAll('input[name="name"]')).forEach(input => {
			const value = input.value.trim()

			input.setCustomValidity('')

			if (!value) return

			if (seen.has(value)) {
				input.setCustomValidity('Name must be unique')
			} else {
				seen.add(value)
			}
		})
	}
}
