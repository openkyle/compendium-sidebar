# Compendium Sidebar

Compendium Sidebar adds a compact **World / Comp.** switch to Foundry VTT document directories. A GM assigns one visible compendium to each supported sidebar in Module Settings; every user can then switch that sidebar between world documents and the chosen pack. The selected side is saved per browser and remains active across sessions.

## Features

- Supports Actor, Item, Journal, Roll Table, Macro, Playlist, Scene, and Cards directories.
- Uses the compendium index instead of loading every document, minimizing memory use and initial load time.
- Preserves folders, search, click-to-open, and drag-to-import behavior.
- Stores configuration per world and the toggle state per client.
- Compatible with Foundry VTT v11–v13.

## Installation

Paste this manifest URL into Foundry's **Install Module** dialog:

`https://github.com/openkyle/compendium-sidebar/releases/latest/download/module.json`

Enable the module, then open **Game Settings → Configure Settings → Module Settings → Compendium Sidebar → Configure Sidebar Compendiums**. Choose a pack for each desired sidebar and save.

## Notes

- Only compendiums visible to the current user are displayed.
- A configured sidebar does not load its pack until the user selects **Comp.**.
- The switch remembers its state independently for each sidebar and browser.
- Changing or removing a configured pack returns affected users to the World view on their next render.

## License

MIT
