import { logger } from './logger.js'
import { Label } from './models/label.js'
import { Assignment } from './models/assignment.js'
import { ChatterCard } from './content/chatter-card.js'

export class Storage {
	// static #options
	static #data

	// static async getOptions() {
	// 	if (this.#options) return this.#options
	//
	// 	this.#options = (await chrome.storage.sync.get('options')).options ?? {}
	//
	// 	logger.debug('Options loaded.')
	//
	// 	return this.#options
	// }

	static async get(key) {
		if (this.#data) return this.#data[key]

		await this.#load()

		return this.#data[key]
	}

	static async #load() {
		const
			rawData = await chrome.storage.sync.get(['labels', 'assignments']),
			labels = this.#parseLabels(rawData.labels ?? []),
			assignments = this.#parseAssignments(rawData.assignments ?? [], labels)

		this.#data = { labels, assignments }

		logger.debug('Storage data loaded.')
	}

	static async set(key, value) {
		this.#data[key] = value

		await chrome.storage.sync.set({
			[key]: Array.isArray(value)
				? value.map(element => element.toJSON())
				: value
		})

		logger.debug(`Storage data[${key}] saved.`)
	}

	static listenChanges() {
		chrome.storage.onChanged.addListener(async (changes, area) => {
			if (area != 'sync') return

			if (changes.labels) {
				this.#data.labels = this.#parseLabels(changes.labels.newValue)
			}

			if (changes.assignments) {
				this.#data.assignments = await this.#parseAssignments(
					changes.assignments.newValue, this.#data.labels
				)
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

	static #parseAssignments(rawAssignments, labels) {
		return rawAssignments.map(({ labelId, ...data }) => {
			return new Assignment({
				...data,
				label: labels.find(label => label.id == labelId)
			})
		})
	}
}
