import { logger } from '../logger.js'
import { Label } from '../label.js'
// import { Assignment } from './assignment.js'

export class OptionsStorage {
	static parse(raw) {
		let options = raw || {}

		options.labels = (options.labels ?? []).map(data => new Label(data))
		// options.assignments = (options.assignments ?? []).map(data => new Assignment(data))

		return options
	}

	static async load() {
		let
			raw = (await chrome.storage.sync.get('options')).options || {},
			options = this.parse(raw)

		logger.debug('Options loaded.')

		return options
	}
}
