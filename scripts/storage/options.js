import { logger } from '../logger.js'
import { BaseStorage } from './base.js'
import { ChromeSync } from './providers/chrome-sync.js'

export class OptionsStorage extends BaseStorage {
	static PORT_NAME = 'options-storage'

	_parsers = {}

	constructor() {
		super()
		this._provider = new ChromeSync()
	}

	async load() {
		const rawData = await this._provider.get(['storage'])

		this._data.storage = rawData.storage ?? {},

		this._loaded = true

		logger.debug('Options Storage data loaded.')
	}
}
