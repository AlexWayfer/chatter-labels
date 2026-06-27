import { Label } from './label.js'

export async function loadOptions() {
	const options = (await chrome.storage.sync.get('options')).options || {}

	options.labels = (options.labels ?? []).map(data => new Label(data))

	console.debug('Options loaded.')

	return options
}
