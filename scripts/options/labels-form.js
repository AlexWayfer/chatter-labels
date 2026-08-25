import { logger } from '../logger.js'
import { Label } from '../models/label.js'
import { AssignmentsList } from './assignments-list.js'
import { Form } from './form.js'
import { IconField } from './icon-field.js'

export class LabelsForm extends Form {
	#mainStorage
	#labels
	#assignments
	#fieldsetsElement
	#fieldsetTemplate

	static async create(element, mainStorage) {
		const
			labels = await mainStorage.get('labels'),
			assignments = await mainStorage.get('assignments')

		new this(element, mainStorage, labels, assignments)
	}

	constructor(element, mainStorage, labels, assignments) {
		super(element)

		this.#mainStorage = mainStorage
		this.#labels = labels
		this.#assignments = assignments

		this.#fieldsetsElement = this._element.querySelector('.fieldsets')
		this.#fieldsetTemplate = this._element.querySelector('template#label')

		this._element.querySelector('button.add').addEventListener('click', _event => {
			this.add()
		})

		this._element.addEventListener('input', _event => {
			this.#validateUniqueNames()
		})

		this._element.querySelector('form[name="labels"]').addEventListener('submit', event => {
			event.preventDefault()

			this.#validateUniqueNames()

			if (!event.currentTarget.checkValidity()) return

			this._save()
		})

		this.#renderLabels()

		this.#subscribe()
	}

	add(data = {}) {
		const
			fieldsetFragment = document.importNode(this.#fieldsetTemplate.content, true),
			fieldsetElement = fieldsetFragment.querySelector('fieldset')

		fieldsetElement.querySelectorAll('input[name]').forEach(input => {
			input.value = data[input.name] ?? (input.name == 'id' ? crypto.randomUUID() : '')
		})

		new IconField(fieldsetElement)

		fieldsetElement.querySelector('button.up').addEventListener('click', _event => {
			fieldsetElement.previousElementSibling.before(fieldsetElement)
			this.#updateMoveButtons()
		})

		fieldsetElement.querySelector('button.down').addEventListener('click', _event => {
			fieldsetElement.nextElementSibling.after(fieldsetElement)
			this.#updateMoveButtons()
		})

		fieldsetElement.querySelector('button.delete').addEventListener('click', _event => {
			const name = fieldsetElement.querySelector('input[name="name"]').value

			if (
				data.id &&
				!confirm([
					`Remove label "${name}" from the list?`,
					'Click "Save" to apply.'
				].join('\n'))
			) {
				return
			}

			fieldsetElement.remove()
			this.#updateMoveButtons()
		})

		new AssignmentsList(
			fieldsetElement.querySelector('.assignments'),
			this.#mainStorage,
			data.id ? data : null,
			this.#assignments
		)

		this.#fieldsetsElement.append(fieldsetFragment)
		this.#updateMoveButtons()
	}

	#updateMoveButtons() {
		const fieldsets = this.#fieldsetsElement.children

		Array.from(fieldsets).forEach((fieldset, index) => {
			fieldset.querySelector('button.up').hidden = index == 0
			fieldset.querySelector('button.down').hidden = index == fieldsets.length - 1
		})
	}

	#renderLabels() {
		this.#fieldsetsElement.replaceChildren()

		this.#labels.forEach(label => this.add(label))
	}

	#subscribe() {
		this.#mainStorage.subscribe('labels', labels => {
			this.#labels = labels
			this.#renderLabels()
		})

		this.#mainStorage.subscribe('assignments', assignments => {
			this.#assignments = assignments
		})
	}

	async _save() {
		super._save(async () => {
			this.#labels = Array.from(this.#fieldsetsElement.children).map(fieldset => {
				logger.debug('fieldset inputs = ', fieldset.querySelectorAll('input[name]'))

				return new Label(
					Object.fromEntries(
						Array.from(fieldset.querySelectorAll('input[name]')).map(
							input => [input.name, input.value]
						)
					)
				)
			})

			logger.debug('this.#labels = ', this.#labels)

			await this.#mainStorage.set('labels', this.#labels)

			this.#assignments = this.#assignments.filter(
				assignment => this.#labels.some(label => label.id == assignment.label.id)
			)

			await this.#mainStorage.set('assignments', this.#assignments)
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
