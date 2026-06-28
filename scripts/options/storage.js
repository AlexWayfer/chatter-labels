import { logger } from '../logger.js'
import { Label } from '../label.js'
// import { Assignment } from './assignment.js'

export class OptionsStorage {
	static async load() {
		let
			raw = (await chrome.storage.sync.get('options')).options || {},
			options = this.#parse(raw)

		logger.debug('Options loaded.')

		return options
	}

	static sync(newValue) {
		options = this.#parse(newValue)

		LabelsElement.updateAll(options)

		logger.debug('Options synced.')
	}

	static save(options) {
		chrome.storage.sync.set({ options }).then(() => {
			logger.debug('Options saved.')
		})
	}

	static #parse(raw) {
		let options = raw || {}

		options.labels = (options.labels ?? []).map(data => new Label(data))
		// options.assignments = (options.assignments ?? []).map(data => new Assignment(data))

		return options
	}
}
