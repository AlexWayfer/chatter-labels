import { Label } from '../label.js'

export async function load() {
	const options = (await chrome.storage.sync.get('options')).options || {}

	options.labels = (options.labels ?? []).map(data => new Label(data))

	console.debug('Options loaded.')

	return options
}
