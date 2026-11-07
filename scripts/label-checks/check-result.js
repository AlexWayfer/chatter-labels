// Keep this function self-contained: the runner injects it into the user-script world.
export function normalizeCheckResult(value) {
	if (value == null) return null
	if (['boolean', 'string', 'number'].includes(typeof value)) return value
	if (typeof value !== 'object' || Array.isArray(value) || typeof value.text !== 'string') {
		throw new Error('Return true, false, a string, a number, null, or { text, messages }.')
	}
	if (!Array.isArray(value.messages)) throw new Error('Result messages must be an array.')
	const messages = value.messages.map(message => {
		if (!message || typeof message.text !== 'string' ||
			message.timestamp !== undefined && typeof message.timestamp !== 'string') {
			throw new Error('Each result message must have text and an optional timestamp string.')
		}
		return {
			text: message.text,
			timestamp: message.timestamp ?? '',
			id: typeof message.id === 'string' ? message.id : '',
			channelId: typeof message.channelId === 'string' ? message.channelId : ''
		}
	})

	return { text: value.text, messages }
}
