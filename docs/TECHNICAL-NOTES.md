# Technical notes

The module deliberately does not import or clone compendium documents. It requests only each pack's index (`name`, image, folder, sort, and type), caches that promise, and resolves a full document only when a user opens it. This keeps world collections untouched and avoids the lag of eagerly hydrating a large pack.

The integration is DOM-based at the stable `renderSidebarTab` boundary used across Foundry v11–v13. Foundry's own directory header and search control remain in place; only the directory list is exchanged. Settings use a world-scoped pack identifier, while the active side is client-scoped so one user's choice never changes another user's UI.

World-owned packs are automatically unlocked for a GM before editing. Foundry does not permit safe writes back into installed system/module package databases, so those entries use world-document working copies identified by a source UUID flag. Their module-managed folders are hidden from the ordinary World directory; changes persist in the world without mutating installed package files or being destroyed by package updates.

## Compatibility checklist

- Foundry v11: legacy `FormApplication`, jQuery render-hook payload.
- Foundry v12: legacy application API and compendium folder index.
- Foundry v13: render-hook payload normalization accepts either HTMLElement or jQuery wrappers.
- No game-system-specific APIs are used.
