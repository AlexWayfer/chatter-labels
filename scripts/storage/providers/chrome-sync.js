export class ChromeSync {
	async load(keys) {
		return chrome.storage.sync.get(keys)
	}
}
