import { logger } from './logger.js'
import { Label } from './models/label.js'
import { Assignment } from './models/assignment.js'
import { ChatterCard } from './content/chatter-card.js'

export class Storage {
	// static #options
	static #labels
	static #assignments

	// static async getOptions() {
	// 	if (this.#options) return this.#options
	//
	// 	this.#options = (await chrome.storage.sync.get('options')).options ?? {}
	//
	// 	logger.debug('Options loaded.')
	//
	// 	return this.#options
	// }

	static async getLabels() {
		if (this.#labels) return this.#labels

		const rawLabels = (await chrome.storage.sync.get('labels')).labels ?? []

		this.#labels = this.#parseLabels(rawLabels)

		logger.debug('Labels loaded.')

		return this.#labels
	}

	static async setLabels(newLabels) {
		this.#labels = newLabels

		await chrome.storage.sync.set({
			labels: this.#labels.map(label => label.toJSON())
		})

		logger.debug('Labels saved.')
	}

	static async getAssignments() {
		if (this.#assignments) return this.#assignments

		const rawAssignments = (await chrome.storage.sync.get('assignments')).assignments ?? []

		this.#assignments = this.#parseAssignments(rawAssignments)

		logger.debug('Assignments loaded.')

		return this.#assignments
	}

	static async setAssignments(newAssignments) {
		this.#assignments = newAssignments

		await chrome.storage.sync.set({
			assignments: this.#assignments.map(assignment => assignment.toJSON())
		})

		logger.debug('Assignments saved.')
	}

	static listenChanges() {
		chrome.storage.onChanged.addListener(async (changes, area) => {
			if (area != 'sync') return

			if (changes.labels) {
				this.#labels = this.#parseLabels(changes.labels.newValue)
			}

			if (changes.assignments) {
				this.#assignments = await this.#parseAssignments(changes.assignments.newValue)
			}

			if (changes.labels || changes.assignments) {
				ChatterCard.updateAll()
			}

			logger.debug('Storage synced.')
		})
	}

	static #parseLabels(rawLabels) {
		return rawLabels.map(data => new Label(data))
	}

	static async #parseAssignments(rawAssignments) {
		const labels = await this.getLabels()

		return rawAssignments.map(({ labelId, ...data }) => {
			return new Assignment({
				...data,
				label: labels.find(label => label.id == labelId)
			})
		})
	}
}
