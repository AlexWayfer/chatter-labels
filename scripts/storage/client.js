import { logger } from '../logger.js'
import { ChromeSync } from './providers/chrome-sync.js'
import { Label } from '../models/label.js'
import { Assignment } from '../models/assignment.js'

export class StorageClient {
	#provider
	// #options
	#data = {}
	#loaded = false
	#parsers = {
		labels: (rawLabels) => {
			return rawLabels.map(data => new Label(data))
		},
		assignments: (rawAssignments) => {
			return rawAssignments.map(({ labelId, ...data }) => {
				return new Assignment({
					...data,
					label: this.#data.labels.find(label => label.id == labelId)
				})
			})
		}
	}
	#subscriptions
	#port

	constructor() {
		this.#provider = new ChromeSync()
		this.#port = chrome.runtime.connect({ name: 'storage' })
		this.#subscriptions = new Map()
	}

	listen() {
		this.#port.onMessage.addListener(message => {
			if (message.type != 'storage:update') return

			const
				{ key, serializedValue } = message,
				value = this.#parsers[key](serializedValue)

			logger.debug(`Storage message with '${key}' received.`)
			logger.debug('serializedValue = ', serializedValue)
			logger.debug('value = ', value)

			this.#data[key] = value

			this.#notify(key, value)
		})

		logger.debug('Storage listens.')
	}

	// async getOptions() {
	// 	if (this.#options) return this.#options
	//
	// 	this.#options = (await chrome.storage.sync.get('options')).options ?? {}
	//
	// 	logger.debug('Options loaded.')
	//
	// 	return this.#options
	// }

	async get(key) {
		logger.debug(`Storage get '${key}'`)
		if (!this.#loaded) await this.#load()

		return this.#data[key]
	}

	async #load() {
		const rawData = await this.#provider.load(['labels', 'assignments'])

		this.#data.labels = this.#parsers.labels(rawData.labels ?? []),
		this.#data.assignments = this.#parsers.assignments(rawData.assignments ?? [])

		this.#loaded = true

		logger.debug('Storage data loaded.')
	}

	async set(key, value) {
		const serializedValue = Array.isArray(value) ? value.map(element => element.toJSON()) : value

		await this.#provider.set(key, serializedValue)

		logger.debug(`Storage data[${key}] saved.`)

		this.#port.postMessage({ type: 'storage:update', key, serializedValue })
	}

	subscribe(key, callback) {
		let callbacks = this.#subscriptions.get(key)

		if (!callbacks) {
			callbacks = new Set()
			this.#subscriptions.set(key, callbacks)
		}

		callbacks.add(callback)

		return () => callbacks.delete(callback)
	}

	#notify(key, value) {
		const callbacks = this.#subscriptions.get(key)

		if (!callbacks) return

		for (const callback of callbacks) {
			callback(value)
		}
	}
}
