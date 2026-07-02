import { logger } from '../logger.js'
import { OptionsStorage } from '../options/storage.js'
import { ChatterCard } from './chatter-card.js'

let options = await OptionsStorage.load()

chrome.storage.onChanged.addListener((changes, area) => {
	if (area != 'sync' || !changes.options) return

	options = OptionsStorage.parse(changes.options.newValue)

	ChatterCard.updateAll(options)

	logger.debug('Options synced for content script.')
})

const observer = new MutationObserver(mutations => {
	for (const mutation of mutations) {
		for (const addedNode of mutation.addedNodes) {
			ChatterCard.createIfNeeded(addedNode, options)
		}
	}
})

observer.observe(document.body, { childList: true, subtree: true })
