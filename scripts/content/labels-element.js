import { logger } from '../logger.js'
import { Assignment } from '../models/assignment.js'

const
	fetchResult = await fetch(chrome.runtime.getURL('pages/content/labels.html')),
	templatesHTML = await fetchResult.text(),
	parser = new DOMParser(),
	templatesDocument = parser.parseFromString(templatesHTML, 'text/html'),
	elementTemplate = templatesDocument.querySelector('template#chatter-labels'),
	labelElementTemplate = templatesDocument.querySelector('template#label-fieldset')

export class LabelsElement {
	#user
	#mainStorage
	#labels
	#assignments
	#subscriptions
	#formElement
	#submitButtonElement
	#formFieldsetsElement

	static async create(user, mainStorage) {
		const
			labels = await mainStorage.get('labels'),
			assignments = await this.#syncUsername(
				user,
				mainStorage,
				await mainStorage.get('assignments')
			)

		return new this(user, mainStorage, labels, assignments)
	}

	static async #syncUsername(user, mainStorage, assignments) {
		if (!assignments.some(
			assignment => assignment.userId == user.id && assignment.username != user.name
		)) {
			return assignments
		}

		const updatedAssignments = assignments.map(assignment => {
			return assignment.userId == user.id
				? new Assignment({ ...assignment, username: user.name })
				: assignment
		})

		await mainStorage.set('assignments', updatedAssignments)

		return updatedAssignments
	}

	constructor(user, mainStorage, labels, assignments) {
		this.#user = user
		this.#mainStorage = mainStorage
		this.#labels = labels
		this.#assignments = assignments

		this.#createElement()
		this.#renderLabels()

		this.#subscribe()
	}

	#subscribe() {
		this.#subscriptions = [
			this.#mainStorage.subscribe('labels', labels => {
				this.#labels = labels
				this.#renderLabels()
			}),
			this.#mainStorage.subscribe('assignments', assignments => {
				this.#assignments = assignments
				this.#renderLabels()
			})
		]
	}

	unsubscribe() {
		this.#subscriptions.forEach(subscription => subscription())
	}

	#renderLabels() {
		this.#formFieldsetsElement.replaceChildren()

		logger.debug('renderLabels this.#assignments = ', this.#assignments)

		this.#labels.forEach(label => {
			this.#createLabelElement(
				label,
				this.#assignments.find(
					assignment => assignment.userId == this.#user.id && assignment.label.id == label.id
				)
			)
		})
	}

	#createElement() {
		this.element = elementTemplate.content.cloneNode(true).firstElementChild

		this.#formElement = this.element.querySelector('form')
		this.#submitButtonElement = this.#formElement.querySelector('button[type="submit"]')
		this.#formElement.addEventListener('submit', event => {
			event.preventDefault()

			this.#save()
		})

		this.#formFieldsetsElement = this.#formElement.querySelector('.fieldsets')
		this.#formElement.querySelector('.configure').addEventListener('click', event => {
			event.preventDefault()
			chrome.runtime.sendMessage({ type: 'open-options' })
		})
	}

	#createLabelElement(label, assignment) {
		const
			labelElement = labelElementTemplate.content.cloneNode(true),
			checkboxElement = labelElement.querySelector('input[name="label"]')

		checkboxElement.value = label.id
		checkboxElement.checked = !!assignment

		labelElement.querySelector('.icon').src = label.icon
		labelElement.querySelector('.name').textContent = label.name

		labelElement.querySelector('.assigned-at').textContent = assignment?.formattedAssignedAt ?? ''

		this.#formFieldsetsElement.append(labelElement)
	}

	async #save() {
		this.#submitButtonElement.disabled = true

		try {
			const newAssignments = Array.from(
				this.#formElement.querySelectorAll('input[name="label"]:checked'),
				checkbox => {
					const
						label = this.#labels.find(label => label.id == checkbox.value),
						existing = this.#assignments.find(
							assignment => assignment.userId == this.#user.id &&
								assignment.label.id == checkbox.value
						)

					return new Assignment({
						userId: this.#user.id,
						username: this.#user.name,
						label,
						assignedAt: existing?.assignedAt ?? new Date().toISOString()
					})
				}
			)

			this.#assignments = [
				...this.#assignments.filter(assignment => assignment.userId != this.#user.id),
				...newAssignments
			]

			logger.debug('save this.#assignments = ', this.#assignments)

			await this.#mainStorage.set('assignments', this.#assignments)
		} finally {
			this.#submitButtonElement.disabled = false
		}
	}
}
