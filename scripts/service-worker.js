import { logger } from './logger.js'

const channels = new Map()

chrome.runtime.onConnect.addListener(port => {
	let clients = channels.get(port.name)
	if (!clients) {
		clients = new Set()
		channels.set(port.name, clients)
	}

	clients.add(port)

	port.onDisconnect.addListener(() => {
		clients.delete(port)
	})

	port.onMessage.addListener(message => {
		for (const client of clients) {
			client.postMessage(message)
		}

		logger.debug(`'${port.name}' message retranslated.`)
	})

	logger.debug(`'${port.name}' port connected.`)
})
