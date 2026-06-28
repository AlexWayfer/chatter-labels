import { logger } from '../logger.js'
import { loadOptions, parseOptions } from '../load-options.js'
import { LabelsElement } from './labels-element.js'

let options = await loadOptions()

chrome.storage.onChanged.addListener((changes, area) => {
	if (area != 'sync' || !changes.options) return

	options = parseOptions(changes.options.newValue)

	LabelsElement.updateAll(options)

	logger.debug('Options synced.')
})

const observer = new MutationObserver(async (mutations) => {
	for (const mutation of mutations) {
		for (const addedNode of mutation.addedNodes) {
			if (addedNode.nodeType !== Node.ELEMENT_NODE) continue

			const
				chatterCard =
					addedNode.matches('[data-a-target]')
						? addedNode
						: addedNode.querySelector('[data-a-target]')

			if (!chatterCard) return
			if (!['viewer-card', 'mod-view-user-details'].includes(chatterCard.dataset.aTarget)) return
			if (chatterCard.querySelector(LabelsElement.CLASS_NAME)) return

			new LabelsElement(chatterCard, options)
		}
	}
});

observer.observe(document.body, { childList: true, subtree: true })
