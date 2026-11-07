export function createTabs(tablist, items) {
	const group = `script-tabs-${crypto.randomUUID()}`

	for (const [index, { title, panel }] of items.entries()) {
		const active = index === 0
		const tab = tablist.ownerDocument.createElement('a')

		panel.id = `${group}-${index}`
		panel.setAttribute('role', 'tabpanel')
		panel.tabIndex = 0
		panel.classList.toggle('active', active)
		tab.id = `${panel.id}-tab`
		tab.setAttribute('role', 'tab')
		tab.setAttribute('aria-controls', panel.id)
		tab.setAttribute('aria-selected', String(active))
		tab.tabIndex = active ? 0 : -1
		tab.dataset.ui = `#${panel.id}`
		tab.textContent = title
		tab.classList.toggle('active', active)
		panel.setAttribute('aria-labelledby', tab.id)
		tablist.append(tab)
	}
	makeTabsAccessible(tablist)
}

// BeerCSS handles data-ui activation; supplement its tabs with ARIA and keyboard navigation.
function makeTabsAccessible(tablist) {
	const tabs = [...tablist.querySelectorAll('[role="tab"]')]
	const select = tab => {
		for (const item of tabs) {
			item.setAttribute('aria-selected', String(item === tab))
			item.tabIndex = item === tab ? 0 : -1
		}
	}

	tablist.addEventListener('click', event => {
		const tab = event.target.closest('[role="tab"]')

		if (tabs.includes(tab)) select(tab)
	})
	tablist.addEventListener('keydown', event => {
		const index = tabs.indexOf(event.target)

		if (index === -1) return
		if (event.key === 'Enter') {
			select(tabs[index])
			return
		}
		let next

		switch (event.key) {
			case 'ArrowRight':
				next = (index + 1) % tabs.length
				break
			case 'ArrowLeft':
				next = (index + tabs.length - 1) % tabs.length
				break
			case 'Home':
				next = 0
				break
			case 'End':
				next = tabs.length - 1
				break
			case ' ':
				next = index
				break
			default:
				return
		}
		event.preventDefault()
		tabs[next].focus()
		tabs[next].click()
	})
}
