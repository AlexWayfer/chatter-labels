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
import Sortable from '../../vendor/sortablejs/sortable.js'

const activeFieldset = 'fieldset:not(.label-removing)'

function labelTransitionsFinished(fieldset) {
	const animations = fieldset.getAnimations?.() ?? []

	return Promise.allSettled(animations.map(animation => animation.finished))
}

export class LabelsForm extends Form {
	#mainStorage
	#optionsStorage
	#labels
	#assignments
	#assignmentsLists = new WeakMap()
	#fieldsetsElement
	#fieldsetTemplate
	#dragging = false
	#renderAfterDrag = false
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

		const reducedMotion = this.#fieldsetsElement.ownerDocument.defaultView.matchMedia('(prefers-reduced-motion: reduce)')
		const animationDuration = 200
		const sortable = Sortable.create(this.#fieldsetsElement, {
			draggable: '>' + activeFieldset,
			handle: '.label-drag-handle:enabled',
			direction: 'vertical',
			animation: reducedMotion.matches ? 0 : animationDuration,
			easing: 'ease-out',
			forceFallback: true,
			fallbackTolerance: 4,
			scrollSensitivity: 72,
			scrollSpeed: 16,
			revertOnSpill: true,
			onChoose: () => {
				this.#dragging = true
			},
			onStart: () => {
				Sortable.ghost.inert = true
			},
			onUnchoose: () => {
				this.#dragging = false
				if (!this.#renderAfterDrag) return
				this.#renderAfterDrag = false
				queueMicrotask(() => this.#renderLabels())
			},
			onEnd: ({ item, oldDraggableIndex, originalEvent }) => {
				if (originalEvent.type === 'pointercancel' || originalEvent.type === 'touchcancel') {
					// Clear drag offsets before restoring the original order.
					for (const fieldset of this.#fieldsets) {
						for (const animation of fieldset.getAnimations()) {
							if (animation.transitionProperty === 'transform') animation.finish()
						}
					}
					this.#moveLabel(item, oldDraggableIndex)
				}
			}
		})
		reducedMotion.addEventListener('change', () => {
			sortable.option('animation', reducedMotion.matches ? 0 : animationDuration)
		})

		this.#fieldsetsElement.ownerDocument.addEventListener('keydown', event => {
			if (event.key !== 'Escape' || !this.#dragging) return

			event.preventDefault()
			// Sortable uses pointercancel to clean up a fallback drag.
			this.#fieldsetsElement.dispatchEvent(new PointerEvent('pointercancel', { bubbles: true }))
		})

		this._element.querySelector('button.add').addEventListener('click', _event => {
			this.add({}, { prepend: true, animate: true })
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

	add(data = {}, { prepend = false, animate = false } = {}) {
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

		const updateScriptStatus = () => {
			const status = fieldsetElement.querySelector('.script-status')
			const present = !!script.value.trim()

			status.textContent = present ? 'Present' : 'Absent'
			status.classList.toggle('primary', present)
			status.classList.toggle('surface-variant', !present)
		}

		updateScriptStatus()
		script.addEventListener('input', updateScriptStatus)
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
				updateScriptStatus()
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

		const handle = fieldsetElement.querySelector('.label-drag-handle')

		handle.addEventListener('keydown', event => {
			if (handle.disabled || this.#dragging || event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return

			const fieldsets = this.#fieldsets
			const index = fieldsets.indexOf(fieldsetElement)
			const destinations = new Map([
				['ArrowUp', index - 1],
				['ArrowDown', index + 1],
				['Home', 0],
				['End', fieldsets.length - 1]
			])
			if (!destinations.has(event.key)) return

			event.preventDefault()
			this.#moveLabel(fieldsetElement, destinations.get(event.key))
			handle.focus()
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

			if (!fieldsetElement.isConnected || fieldsetElement.inert) return

			fieldsetElement.inert = true
			fieldsetElement.disabled = true
			fieldsetElement.classList.add('label-removing')
			this.#updateDragHandles()
			this.#updateScriptAccess()
			this.#validateUniqueNames()

			await labelTransitionsFinished(fieldsetElement)
			fieldsetElement.remove()
			this.#scriptEditors.get(fieldsetElement)?.destroy()
			this.#scriptEditors.delete(fieldsetElement)
		})

		fieldsetElement.classList.toggle('label-entering', animate)
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
		this.#updateDragHandles()
		this.#updateScriptAccess()

		if (animate) {
			labelTransitionsFinished(fieldsetElement).then(() => fieldsetElement.classList.remove('label-entering'))
		}
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
		return Array.from(this.#fieldsetsElement.children).filter(
			fieldset => fieldset !== Sortable.ghost && fieldset.matches(activeFieldset)
		)
	}

	#moveLabel(fieldset, destination) {
		const fieldsets = this.#fieldsets
		const index = fieldsets.indexOf(fieldset)

		if (index < 0 || destination < 0 || destination >= fieldsets.length || index === destination) return

		const before = fieldsets[destination + Number(index < destination)] ?? null

		this.#fieldsetsElement.insertBefore(fieldset, before)
	}

	#updateDragHandles() {
		const fieldsets = this.#fieldsets

		for (const fieldset of fieldsets) {
			fieldset.querySelector('.label-drag-handle').disabled = fieldsets.length < 2
		}
	}

	#renderLabels() {
		if (this.#dragging) {
			this.#renderAfterDrag = true
			return
		}

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
		if (this.#dragging) return

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

		for (const fieldset of this.#fieldsets) {
			const input = fieldset.querySelector('input[name="name"]')
			const value = input.value.trim()

			input.setCustomValidity('')

			if (!value) continue

			if (seen.has(value)) {
				input.setCustomValidity('Name must be unique')
			} else {
				seen.add(value)
			}
		}
	}
}
