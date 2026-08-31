import { BaseStorage } from './base.js'
import { ChromeSync } from './providers/chrome-sync.js'

export class OptionsStorage extends BaseStorage {
	static NAME = 'options-storage'

	_parsers = {}

	constructor() {
		super()
		this._provider = new ChromeSync()
	}

	async _load() {
		return super._load({
			storage: {}
		})
	}
}
