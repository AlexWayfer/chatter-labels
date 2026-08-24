import { logger } from '../logger.js'
import { Assignment } from '../models/assignment.js'
import { Label } from '../models/label.js'
import { TwitchAPI } from '../twitch/api.js'
import { Form } from './form.js'
import { IconField } from './icon-field.js'
import { Toast } from './toast.js'

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

		this._element.addEventListener('submit', event => {
			event.preventDefault()

			this.#validateUniqueNames()

			if (!this._element.checkValidity()) return

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
			input.value = data[input.name] ?? (input.name == 'id' ? crypto.randomUUID(): '')
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
			fieldsetElement.remove()
			this.#updateMoveButtons()
		})

		fieldsetElement.querySelector('button.add-assignments').addEventListener('click', _event => {
			this.#addAssignments(fieldsetElement)
		})

		this.#renderAssignmentList(fieldsetElement)

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

		this.#labels.forEach(label => { this.add(label) })
	}

	#subscribe() {
		this.#mainStorage.subscribe('labels', labels => {
			this.#labels = labels
			this.#renderLabels()
		})

		this.#mainStorage.subscribe('assignments', assignments => {
			this.#assignments = assignments
			this.#renderAssignmentLists()
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

	#renderAssignmentLists() {
		Array.from(this.#fieldsetsElement.children).forEach(
			fieldset => this.#renderAssignmentList(fieldset)
		)
	}

	#renderAssignmentList(fieldsetElement) {
		const
			listElement = fieldsetElement.querySelector('.assignments ul'),
			template = fieldsetElement.querySelector('template#assignment'),
			labelId = fieldsetElement.querySelector('input[name="id"]').value

		listElement.replaceChildren()

		for (const assignment of this.#assignments) {
			if (assignment.label.id != labelId) continue

			const assignmentFragment = document.importNode(template.content, true)

			assignmentFragment.querySelector('.username').textContent = assignment.username
			assignmentFragment.querySelector('.assigned-at').textContent = assignment.formattedAssignedAt

			listElement.append(assignmentFragment)
		}
	}

	async #addAssignments(fieldsetElement) {
		const
			textarea = fieldsetElement.querySelector('textarea'),
			addButton = fieldsetElement.querySelector('button.add-assignments'),
			toastAdded = new Toast(fieldsetElement.querySelector('.assignments .added')),
			toastError = new Toast(fieldsetElement.querySelector('.assignments .error')),
			labelId = fieldsetElement.querySelector('input[name="id"]').value,
			label = this.#labels.find(label => label.id == labelId)

		if (!label) {
			toastError.show('Save the label first')
			return
		}

		const nicknames = this.#parseNicknames(textarea.value)

		if (!nicknames.length) return

		addButton.disabled = true

		try {
			const
				newAssignments = [],
				unknownNicknames = []

			for (const nickname of nicknames) {
				const user = await TwitchAPI.fetchUser(nickname)

				if (!user) {
					unknownNicknames.push(nickname)
					continue
				}

				if (this.#assignments.some(assignment =>
					assignment.label.id == label.id && assignment.userId == user.id
				)) {
					continue
				}

				const assignment = new Assignment({
					userId: user.id,
					username: user.displayName,
					label,
					assignedAt: new Date().toISOString()
				})

				this.#assignments.push(assignment)
				newAssignments.push(assignment)
			}

			if (newAssignments.length) {
				await this.#mainStorage.set('assignments', this.#assignments)
				toastAdded.show()
			}

			textarea.value = unknownNicknames.join('\n')

			if (unknownNicknames.length) {
				toastError.show(`Unknown nicknames: ${unknownNicknames.join(', ')}`)
			}
		} catch (error) {
			toastError.show(error)
			throw error
		} finally {
			addButton.disabled = false
		}
	}

	#parseNicknames(text) {
		const nicknames = []

		for (const line of text.split('\n')) {
			const nickname = line.trim().replace(/^@/, '')

			if (!nickname) continue
			if (nicknames.some(existing => existing.toLowerCase() == nickname.toLowerCase())) continue

			nicknames.push(nickname)
		}

		return nicknames
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
