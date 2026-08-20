import { logger } from '../logger.js'

export class BaseStorage {
	// static PORT_NAME // Must be defined

	_provider
	_data = {}
	_loaded = false
	_subscriptions
	_port

	static async create(...args) {
		return new this(...args)
	}

	constructor() {
		this._subscriptions = new Map()

		this._connect()
	}

	async get(key) {
		logger.debug(`${this.constructor.name} get '${key}'`)
		if (!this._loaded) await this._load()

		return this._data[key]
	}

	async set(key, value) {
		const serializedValue = Array.isArray(value) ? value.map(element => element.toJSON()) : value

		await this._provider.set(key, serializedValue)

		const parsedValue = this._parsers[key] ? this._parsers[key](serializedValue) : serializedValue

		this._data[key] = parsedValue
		this.notify(key, parsedValue)

		logger.debug(`${this.constructor.name} data[${key}] saved.`)

		this._broadcast({ type: `${this.constructor.PORT_NAME}:update`, key, serializedValue })
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

	reconnect() {
		logger.debug(`${this.constructor.name} reconnecting port.`)

		try {
			this._port?.disconnect()
		} catch {
			// Already disconnected.
		}

		this._port = null
		this._connect()
	}

	async _load() {
		throw new Error(`${this.constructor.name} must implement _load().`)
	}

	_connect() {
		this._port = chrome.runtime.connect({ name: this.constructor.PORT_NAME })

		this._port.onDisconnect.addListener(() => {
			logger.debug(`${this.constructor.name} port disconnected.`)
			this._port = null
		})

		this._listen()
	}

	_broadcast(message) {
		try {
			if (!this._port) this._connect()
			this._port.postMessage(message)
		} catch {
			this._connect()
			this._port.postMessage(message)
		}
	}

	_listen() {
		this._port.onMessage.addListener(message => {
			if (message.type != `${this.constructor.PORT_NAME}:update`) return

			const
				{ key, serializedValue } = message,
				value = this._parsers[key] ? this._parsers[key](serializedValue) : serializedValue

			logger.debug(`${this.constructor.name} message with '${key}' received.`)
			logger.debug('serializedValue = ', serializedValue)
			logger.debug('value = ', value)

			this._data[key] = value

			this.notify(key, value)
		})

		logger.debug(`${this.constructor.name} listens.`)
	}
}
