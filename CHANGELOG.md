# Changelog

## 1.1.0 - 2026-08-14

- Compendium folder expansion state now persists per client and per pack.
- Added World directory context actions to transfer individual documents or complete folder trees into the configured compendium.
- Transfers reproduce the World folder path inside the destination pack.
- Same-name collisions in the same folder offer Duplicate, Overwrite, or Cancel choices.
- World sources are retained after transfer to avoid destructive, silent deletion.

## 1.0.1 - 2026-08-14

- Fixed compendium folder discovery across Foundry collection implementations.
- Added compendium folder creation and drag-to-folder organization.
- Added compendium document creation from the existing directory control.
- World packs now unlock automatically for GM editing when selected documents are opened.
- Read-only package documents open as hidden, persistent world working copies for normal editing.
- Broken index thumbnails now fall back to a document icon instead of displaying a broken image.

## 1.0.0 - 2026-08-14

- Initial release.
- Added per-sidebar compendium assignment for eight Foundry document directories.
- Added persistent client-side World / Comp. switches.
- Added indexed, folder-aware compendium browsing, search, sheet opening, and drag data.
