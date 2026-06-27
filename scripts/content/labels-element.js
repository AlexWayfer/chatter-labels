const
	fetchResult = await fetch(chrome.runtime.getURL('pages/content/labels.html')),
	templatesHTML = await fetchResult.text(),
	parser = new DOMParser(),
	templatesDocument = parser.parseFromString(templatesHTML, 'text/html'),
	elementTemplate = templatesDocument.querySelector('template#labels'),
	labelElementTemplate = templatesDocument.querySelector('template#label')

export class LabelsElement {
	static CLASS_NAME = elementTemplate.content.firstElementChild.className

	#element
	#formElement

	constructor(chatterCard, options) {
		this.#createElement()

		chatterCard.querySelector('.viewer-card-header__background').after(this.#element)

		options.labels.forEach(label => this.#createLabelElement(label))
	}

	#createElement() {
		this.#element = elementTemplate.content.cloneNode(true).firstElementChild

		this.#formElement = this.#element.querySelector('form')
	}

	#createLabelElement(label) {
		const labelElement = labelElementTemplate.content.cloneNode(true)

		// checkboxElement.name = name

		labelElement.querySelector('span.name').textContent = label.name

		this.#formElement.append(labelElement)
	}
}
