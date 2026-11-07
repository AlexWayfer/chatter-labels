function usesDeveloperMode(userAgent) {
	const version = (/(?:Chrome|Chromium)\/(\d+)/).exec(userAgent)?.[1]

	return version !== undefined && Number(version) < 138
}

export function userScriptsSettingsUrl(id, userAgent = navigator.userAgent) {
	return usesDeveloperMode(userAgent) ? 'chrome://extensions/' : `chrome://extensions/?id=${id}`
}

export async function getUserScriptsStatus(extension = chrome, userAgent = navigator.userAgent) {
	try {
		if (!extension.userScripts?.execute) throw new Error('User scripts unavailable.')
		await extension.userScripts.getScripts()
		return { enabled: true }
	} catch {
		return {
			enabled: false,
			message: usesDeveloperMode(userAgent)
				? 'To run checks, turn on Developer mode at chrome://extensions, then click Retry.'
				: 'To run checks, turn on "Allow user scripts" in this extension’s settings, then click Retry.'
		}
	}
}

export async function requireUserScripts(extension = chrome, userAgent = navigator.userAgent) {
	const status = await getUserScriptsStatus(extension, userAgent)

	if (!status.enabled) {
		throw Object.assign(new Error(status.message), { code: 'user-scripts-disabled' })
	}
}
