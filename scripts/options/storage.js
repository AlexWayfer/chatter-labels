import { logger } from '../logger.js'
import { Label } from '../label.js'
import { Assignment } from '../assignment.js'

export class OptionsStorage {
	static async load() {
		const
			raw = (await chrome.storage.sync.get('options')).options || {},
			options = this.parse(raw)

		logger.debug('Options loaded.')

		return options
	}

	static async save(options) {
		await chrome.storage.sync.set({
			options: {
				...options,
				labels: options.labels.map(label => label.toJSON()),
				assignments: options.assignments.map(assignment => assignment.toJSON())
			}
		})

		logger.debug('Options saved.')
	}

	static parse(raw) {
		const options = raw || {}

		options.labels = (options.labels ?? []).map(data => new Label(data))

		options.assignments = (options.assignments ?? []).map(({ labelId, ...data }) => {
			return new Assignment({
				...data,
				label: options.labels.find(label => label.id == labelId)
			})
		})

		return options
	}
}
