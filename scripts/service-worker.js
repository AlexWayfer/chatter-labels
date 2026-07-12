import { logger } from './logger.js'

const clients = new Set()

chrome.runtime.onConnect.addListener(port => {
	if (port.name != 'data-storage') return

	clients.add(port)

	port.onDisconnect.addListener(() => {
		clients.delete(port)
	})

	port.onMessage.addListener(message => {
		if (message.type != 'data-storage:update') return

		for (const client of clients) {
			client.postMessage(message)
		}

		logger.debug('Storage message retranslated.')
	})

	logger.debug('Storage port connected.')
})
