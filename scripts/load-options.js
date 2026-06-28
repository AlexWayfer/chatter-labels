import { Label } from './label.js'

export function parseOptions(rawOptions) {
	let options = rawOptions || {}

	options.labels = (options.labels ?? []).map(data => new Label(data))

	return options
}

export async function loadOptions() {
	let
		rawOptions = (await chrome.storage.sync.get('options')).options || {},
		options = parseOptions(rawOptions)

	console.debug('[Chatter Labels] Options loaded.')

	return options
}
