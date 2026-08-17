# Changelog

## 1.1.6 - 2026-08-17

- Reworked the Comp. folder tree to closely match Foundry's stock directory presentation.
- Closed folders use black shading; open folders use grey shading and an open-folder glyph.
- Removed the redundant disclosure chevron so the folder glyph itself communicates state.
- Added compact nested offsets and guide borders without excessive horizontal drift.
- Added bordered document rows with flush, square, uncropped thumbnails.
- Explicit flex overrides prevent game-system themes from wrapping folder names below their icons.

## 1.1.5 - 2026-08-15

- Isolated custom Comp. rows from Foundry's stock `.document` and `.folder` context-menu selectors.
- Fixed Scene and Folder right-click errors caused by core attempting to resolve custom rows as World documents.
- Added Foundry-style wide Scene cards with centered overlay titles.
- Other document types retain the compact uncropped thumbnail layout.

## 1.1.4 - 2026-08-14

- Added working right-click context menus to custom Comp. document and folder rows.
- Added Transfer to World and Transfer Folder to World actions.
- Reverse transfers reproduce complete compendium folder paths in the World.
- Reverse transfers use the same Duplicate, Overwrite, or Cancel collision handling.
- Compendium sources are retained after transfer.

## 1.1.3 - 2026-08-14

- Compendium sidebar rows now refresh when a document name or image changes.
- Folder and sort changes refresh the affected pack tree as well.
- Refreshes are scoped to the visible configured pack and briefly debounced to avoid redundant renders during saves.
- Editable working-copy changes now update their corresponding compendium sidebar row.

## 1.1.2 - 2026-08-14

- Fixed compendium folders immediately reopening because both Foundry and the module handled the same click.
- Added disclosure chevrons and open/closed folder icons.
- Removed horizontal indentation from nested folders and documents while retaining the true collapsible hierarchy.
- Changed compendium thumbnails to uncropped `contain` rendering.

## 1.1.1 - 2026-08-14

- Fixed system-theme heading rules causing large blank space before compendium folder names.
- Added explicit, cumulative indentation for nested compendium folders and their contents.

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
