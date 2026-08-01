import { logger } from '../logger.js'
import { BaseStorage } from './base.js'
import { ChromeSync } from './providers/chrome-sync.js'
import { Label } from '../models/label.js'
import { Assignment } from '../models/assignment.js'

export class MainStorage extends BaseStorage {
	static PORT_NAME = 'main-storage'

	_parsers = {
		labels: (rawLabels) => {
			return rawLabels.map(data => new Label(data))
		},
		assignments: (rawAssignments) => {
			return rawAssignments.map(({ labelId, ...data }) => {
				return new Assignment({
					...data,
					label: this._data.labels.find(label => label.id == labelId)
				})
			})
		}
	}

	constructor() {
		super()
		this._provider = new ChromeSync()
	}

	async load() {
		const rawData = await this._provider.get(['labels', 'assignments'])

		this._data.labels = this._parsers.labels(rawData.labels ?? []),
		this._data.assignments = this._parsers.assignments(rawData.assignments ?? [])

		this._loaded = true

		logger.debug('Main Storage data loaded.')
	}
}
