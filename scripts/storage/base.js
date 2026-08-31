import { logger } from '../logger.js'

export class BaseStorage {
	// static NAME // Must be defined

	static get _updatedAtKey() {
		return `${this.NAME}:updatedAt`
	}

	_provider
	_data = {}
	_loaded = false
	_subscriptions
	_ownUpdatedAt

	static async create(...args) {
		return new this(...args)
	}

	constructor() {
		this._subscriptions = new Map()

		this._listenUpdatedAt()
	}

	async get(key) {
		logger.debug(`${this.constructor.name} get '${key}'`)
		if (!this._loaded) await this._load()

		return this._data[key]
	}

	async set(key, value) {
		const serializedValue = Array.isArray(value) ? value.map(element => element.toJSON()) : value

		await this._provider.set(key, serializedValue)

		this._apply(key, serializedValue)
		this.notify(key, this._data[key])

		this._ownUpdatedAt = Date.now()
		await chrome.storage.local.set({ [this.constructor._updatedAtKey]: this._ownUpdatedAt })

		logger.debug(`${this.constructor.name} data[${key}] saved.`)
	}

	subscribe(key, callback) {
		let callbacks = this._subscriptions.get(key)

		if (!callbacks) {
			callbacks = new Set()
			this._subscriptions.set(key, callbacks)
		}

		callbacks.add(callback)

		return () => callbacks.delete(callback)
	}

	notify(key, value) {
		const callbacks = this._subscriptions.get(key)

		if (!callbacks) return

		for (const callback of callbacks) {
			callback(value)
		}
	}

	_listenUpdatedAt() {
		chrome.storage.onChanged.addListener(async (changes, areaName) => {
			if (areaName != 'local') return

			const change = changes[this.constructor._updatedAtKey]

			if (!change || change.newValue == null) return
			if (change.newValue === this._ownUpdatedAt) return

			logger.debug(`${this.constructor.name} pulling after updatedAt change.`)

			const changedKeys = await this._load()

			for (const key of changedKeys) {
				this.notify(key, this._data[key])
			}
		})
	}

	async _load(defaults) {
		const keys = Object.keys(defaults)
		const rawData = await this._provider.get(keys)
		const changedKeys = []

		for (const key of keys) {
			if (this._apply(key, rawData[key] ?? defaults[key])) changedKeys.push(key)
		}

		this._loaded = true

		logger.debug(`${this.constructor.name} data loaded.`)

		return changedKeys
	}

	_apply(key, serializedValue) {
		const value = this._parsers[key] ? this._parsers[key](serializedValue) : serializedValue

		if (JSON.stringify(this._data[key]) === JSON.stringify(value)) return false

		this._data[key] = value
		return true
	}
}
