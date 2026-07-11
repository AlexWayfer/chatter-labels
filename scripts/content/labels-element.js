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
	#storageClient
	#labels
	#assignments
	#subscriptions
	#formElement
	#formFieldsetsElement

	static async create(user, storageClient) {
		const
			labels = await storageClient.get('labels'),
			assignments = await storageClient.get('assignments')

		const instance = new this(user, storageClient, labels, assignments)

		return instance
	}

	constructor(user, storageClient, labels, assignments) {
		this.#user = user
		this.#storageClient = storageClient
		this.#labels = labels
		this.#assignments = assignments

		this.#createElement()
		this.#renderLabels()

		this.#subscribe()
	}

	#subscribe() {
		this.#subscriptions = [
			this.#storageClient.subscribe('labels', labels => {
				this.#labels = labels
				this.#renderLabels()
			}),
			this.#storageClient.subscribe('assignments', assignments => {
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
		this.#formElement.addEventListener('submit', event => {
			event.preventDefault()

			this.#save()
		})

		this.#formFieldsetsElement = this.#formElement.querySelector('.fieldsets')
	}

	#createLabelElement(label, assignment) {
		const
			labelElement = labelElementTemplate.content.cloneNode(true),
			checkboxElement = labelElement.querySelector('input[name="label"]')

		checkboxElement.value = label.id
		checkboxElement.checked = !!assignment

		labelElement.querySelector('.name').textContent = label.name

		labelElement.querySelector('.assigned-at').textContent = assignment?.formattedAssignedAt ?? ''

		this.#formFieldsetsElement.append(labelElement)
	}

	async #save() {
		const newAssignments = Array.from(
			this.#formElement.querySelectorAll('input[name="label"]:checked'),
			checkbox => {
				const
					label = this.#labels.find(label => label.id == checkbox.value),
					existing = this.#assignments.find(
						assignment => assignment.userId == this.#user.id
							&& assignment.label.id == checkbox.value
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

		this.#storageClient.set('assignments', this.#assignments)
	}
}
