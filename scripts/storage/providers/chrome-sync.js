export class ChromeSync {
	async get(keys) {
		return chrome.storage.sync.get(keys)
	}

	async set(key, serializedValue) {
		chrome.storage.sync.set({ [key]: serializedValue })
	}
}
