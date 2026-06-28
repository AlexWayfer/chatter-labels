const
	fetchResult = await fetch(chrome.runtime.getURL('pages/content/labels.html')),
	templatesHTML = await fetchResult.text(),
	parser = new DOMParser(),
	templatesDocument = parser.parseFromString(templatesHTML, 'text/html'),
	elementTemplate = templatesDocument.querySelector('template#labels'),
	labelElementTemplate = templatesDocument.querySelector('template#label')

const instances = new Set()

export class LabelsElement {
	static CLASS_NAME = elementTemplate.content.firstElementChild.className

	static updateAll(options) {
		for (const instance of instances) {
			instance.update(options)
		}
	}

	#chatterCard
	#element
	#formElement

	constructor(chatterCard, options) {
		this.#chatterCard = chatterCard

		this.#createElement()

		this.#renderLabels(options.labels)

		this.#observeRemoval()

		instances.add(this)
	}

	update(options) {
		this.#formElement.replaceChildren()
		this.#renderLabels(options.labels)
	}

	#renderLabels(labels) {
		labels.forEach(label => this.#createLabelElement(label))
	}

	#createElement() {
		this.#element = elementTemplate.content.cloneNode(true).firstElementChild

		this.#formElement = this.#element.querySelector('form')

		this.#chatterCard.querySelector('.viewer-card-header__background').after(this.#element)
	}

	#createLabelElement(label) {
		const labelElement = labelElementTemplate.content.cloneNode(true)

		labelElement.querySelector('input[type="checkbox"]').value = label.id

		labelElement.querySelector('span.name').textContent = label.name

		this.#formElement.append(labelElement)
	}

	#observeRemoval() {
		const observer = new MutationObserver(() => {
			if (this.#chatterCard.isConnected) return

			instances.delete(this)
			observer.disconnect()
		})

		observer.observe(this.#chatterCard.parentNode, { childList: true })
	}
}
