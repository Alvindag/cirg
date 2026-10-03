const isMac = () => typeof navigator !== 'undefined' && /mac/i.test(navigator.platform)

/** The command palette shortcut as this computer writes it. */
export const shortcutLabel = () => (isMac() ? '⌘K' : 'Ctrl K')
