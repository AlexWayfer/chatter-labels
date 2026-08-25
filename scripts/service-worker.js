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
			if (client === port) continue

			try {
				client.postMessage(message)
			} catch {
				clients.delete(client)
			}
		}

		logger.debug(`'${port.name}' message retranslated.`)
	})

	logger.debug(`'${port.name}' port connected.`)
})

chrome.runtime.onMessage.addListener(message => {
	if (message.type == 'open-options') chrome.runtime.openOptionsPage()
})
