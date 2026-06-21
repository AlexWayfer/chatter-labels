import { Label } from './label.js'
import { LabelsForm } from './options/labels-form.js'

document.addEventListener('DOMContentLoaded', async _event => {
	const options = (await chrome.storage.sync.get('options')).options || {}
	console.debug('Options loaded.')

	options.labels = (options.labels ?? []).map(data => new Label(data))

	const labelsForm = new LabelsForm(document.querySelector('form[name="labels"]'), options)
})
