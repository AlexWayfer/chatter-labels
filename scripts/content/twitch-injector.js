import { load as optionsLoad } from '../options/load.js'
import { LabelsElement } from './labels-element.js'

const observer = new MutationObserver(async (mutations) => {
	let options

	for (const mutation of mutations) {
		for (const addedNode of mutation.addedNodes) {
			if (addedNode.nodeType !== Node.ELEMENT_NODE) continue

			const
				chatterCard =
					addedNode.matches('[data-a-target]')
						? addedNode
						: addedNode.querySelector('[data-a-target]')

			if (
				chatterCard
					&& ['viewer-card', 'mod-view-user-details'].includes(chatterCard.dataset.aTarget)
					&& !chatterCard.hasAttribute('data-labels-injected')
			) {
				chatterCard.setAttribute('data-labels-injected', 'true')

				options ??= await optionsLoad()

				new LabelsElement(chatterCard, options)
			}
		}
	}
});

observer.observe(document.body, { childList: true, subtree: true })
