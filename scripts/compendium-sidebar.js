const MODULE_ID = "compendium-sidebar";

const DIRECTORIES = {
  actors: { documentName: "Actor", label: "Actors" },
  items: { documentName: "Item", label: "Items" },
  journal: { documentName: "JournalEntry", label: "Journal" },
  tables: { documentName: "RollTable", label: "Roll Tables" },
  macros: { documentName: "Macro", label: "Macros" },
  playlists: { documentName: "Playlist", label: "Playlists" },
  scenes: { documentName: "Scene", label: "Scenes" },
  cards: { documentName: "Cards", label: "Cards" }
};

const indexCache = new Map();

function settingKey(tab) { return `pack-${tab}`; }
function modeKey(tab) { return `mode-${tab}`; }

function rootElement(html) {
  if (html instanceof HTMLElement) return html;
  if (html?.[0] instanceof HTMLElement) return html[0];
  return null;
}

function getPackOptions(documentName) {
  return Array.from(game.packs ?? [])
    .filter(pack => pack.documentName === documentName && pack.visible)
    .sort((a, b) => a.title.localeCompare(b.title))
    .map(pack => ({ value: pack.collection, label: pack.title }));
}

class CompendiumSidebarSettings extends FormApplication {
  static get defaultOptions() {
    return foundry.utils.mergeObject(super.defaultOptions, {
      id: "compendium-sidebar-settings",
      title: game.i18n.localize("CS.SettingsTitle"),
      template: `modules/${MODULE_ID}/templates/settings.hbs`,
      width: 520,
      height: "auto",
      closeOnSubmit: true
    });
  }

  async getData() {
    return {
      directories: Object.entries(DIRECTORIES).map(([tab, config]) => ({
        tab,
        label: config.label,
        selected: game.settings.get(MODULE_ID, settingKey(tab)),
        packs: getPackOptions(config.documentName)
      }))
    };
  }

  async _updateObject(_event, data) {
    for (const tab of Object.keys(DIRECTORIES)) {
      await game.settings.set(MODULE_ID, settingKey(tab), data[tab] ?? "");
    }
    indexCache.clear();
    ui.sidebar?.render?.(true);
  }
}

Hooks.once("init", () => {
  game.settings.registerMenu(MODULE_ID, "configuration", {
    name: "CS.SettingsName",
    label: "CS.SettingsButton",
    hint: "CS.SettingsHint",
    icon: "fas fa-book-open",
    type: CompendiumSidebarSettings,
    restricted: true
  });

  for (const tab of Object.keys(DIRECTORIES)) {
    game.settings.register(MODULE_ID, settingKey(tab), {
      scope: "world", config: false, type: String, default: ""
    });
    game.settings.register(MODULE_ID, modeKey(tab), {
      scope: "client", config: false, type: Boolean, default: false
    });
  }
});

async function onRenderDirectory(app, html) {
  const tab = app.tabName ?? app.options?.id ?? app.id?.replace?.("-directory", "");
  if (!(tab in DIRECTORIES)) return;
  const packId = game.settings.get(MODULE_ID, settingKey(tab));
  if (!packId) return;

  const root = rootElement(html);
  if (!root || root.querySelector(".cs-mode-switch")) return;
  installSwitch(root, app, tab, packId);
  if (game.settings.get(MODULE_ID, modeKey(tab))) await showCompendium(root, tab, packId);
}

// V11/V12 use ApplicationV1 inheritance hooks; V13 directories are ApplicationV2.
// Register both the common legacy hook and concrete class hooks. The DOM guard
// above makes duplicate inheritance-hook calls harmless.
Hooks.on("renderSidebarTab", onRenderDirectory);
for (const hook of ["ActorDirectory", "ItemDirectory", "JournalDirectory", "RollTableDirectory", "MacroDirectory", "PlaylistDirectory", "SceneDirectory", "CardsDirectory"]) {
  Hooks.on(`render${hook}`, onRenderDirectory);
}

function installSwitch(root, app, tab, packId) {
  const header = root.querySelector(".directory-header");
  if (!header) return;
  const controls = header.querySelector(".header-actions, .action-buttons") ?? header;
  const switcher = document.createElement("div");
  switcher.className = "cs-mode-switch";
  switcher.setAttribute("role", "group");
  switcher.setAttribute("aria-label", game.i18n.localize("CS.ToggleLabel"));
  const compendiumMode = game.settings.get(MODULE_ID, modeKey(tab));
  switcher.innerHTML = `
    <button type="button" data-mode="world" class="${compendiumMode ? "" : "active"}">${game.i18n.localize("CS.World")}</button>
    <button type="button" data-mode="compendium" class="${compendiumMode ? "active" : ""}"><i class="fas fa-book-open" aria-hidden="true"></i> ${game.i18n.localize("CS.Compendium")}</button>`;
  controls.append(switcher);

  switcher.addEventListener("click", async event => {
    const button = event.target.closest("button[data-mode]");
    if (!button) return;
    const useCompendium = button.dataset.mode === "compendium";
    if (useCompendium === game.settings.get(MODULE_ID, modeKey(tab))) return;
    await game.settings.set(MODULE_ID, modeKey(tab), useCompendium);
    if (useCompendium) await showCompendium(root, tab, packId);
    else app.render(true);
  });
}

function rerenderDirectory(tab) {
  const app = ui[tab] ?? ui.sidebar?.tabs?.[tab];
  app?.render?.(true);
}

async function getPackIndex(pack) {
  if (!indexCache.has(pack.collection)) {
    indexCache.set(pack.collection, pack.getIndex({ fields: ["name", "img", "thumb", "folder", "sort", "type"] }));
  }
  try { return await indexCache.get(pack.collection); }
  catch (error) { indexCache.delete(pack.collection); throw error; }
}

async function showCompendium(root, tab, packId) {
  const pack = game.packs.get(packId);
  if (!pack?.visible) {
    ui.notifications.warn(game.i18n.localize("CS.PackUnavailable"));
    await game.settings.set(MODULE_ID, modeKey(tab), false);
    return rerenderDirectory(tab);
  }

  root.classList.add("cs-compendium-mode");
  root.querySelectorAll(".cs-mode-switch button").forEach(button => {
    button.classList.toggle("active", button.dataset.mode === "compendium");
  });

  const list = root.querySelector(".directory-list");
  if (!list) return;
  list.innerHTML = `<li class="cs-loading"><i class="fas fa-spinner fa-spin"></i> ${game.i18n.localize("CS.Loading")}</li>`;

  try {
    const index = Array.from(await getPackIndex(pack));
    list.innerHTML = "";
    list.append(buildTree(pack, index));
    bindCompendiumInteractions(root, pack);
    updateHeader(root, pack, index.length);
  } catch (error) {
    console.error(`${MODULE_ID} | Unable to load ${packId}`, error);
    list.innerHTML = `<li class="cs-empty">${game.i18n.localize("CS.LoadFailed")}</li>`;
  }
}

function buildTree(pack, entries) {
  const fragment = document.createDocumentFragment();
  const folders = Array.from(pack.folders ?? []);
  const byParent = new Map();
  const entriesByFolder = new Map();
  for (const folder of folders) {
    const parentId = folder.folder?.id ?? folder.folder ?? "root";
    if (!byParent.has(parentId)) byParent.set(parentId, []);
    byParent.get(parentId).push(folder);
  }
  for (const entry of entries) {
    const folderId = entry.folder?.id ?? entry.folder ?? "root";
    if (!entriesByFolder.has(folderId)) entriesByFolder.set(folderId, []);
    entriesByFolder.get(folderId).push(entry);
  }
  const sort = (a, b) => (a.sort ?? 0) - (b.sort ?? 0) || a.name.localeCompare(b.name);

  const appendLevel = (target, parentId) => {
    for (const folder of (byParent.get(parentId) ?? []).sort(sort)) {
      const li = document.createElement("li");
      li.className = "directory-item folder flexcol";
      li.dataset.folderId = folder.id;
      li.innerHTML = `<header class="folder-header flexrow"><i class="fas fa-folder"></i><h3>${escapeHtml(folder.name)}</h3></header><ol class="subdirectory"></ol>`;
      const child = li.querySelector(".subdirectory");
      appendLevel(child, folder.id);
      appendEntries(child, entriesByFolder.get(folder.id) ?? [], pack, sort);
      target.append(li);
    }
    if (parentId === "root") appendEntries(target, entriesByFolder.get("root") ?? [], pack, sort);
  };
  appendLevel(fragment, "root");
  if (!fragment.childNodes.length) {
    const empty = document.createElement("li"); empty.className = "cs-empty";
    empty.textContent = game.i18n.localize("CS.Empty"); fragment.append(empty);
  }
  return fragment;
}

function appendEntries(target, entries, pack, sort) {
  for (const entry of entries.sort(sort)) {
    const li = document.createElement("li");
    li.className = "directory-item document flexrow cs-pack-entry";
    li.dataset.entryId = entry._id;
    li.dataset.uuid = `Compendium.${pack.collection}.${entry._id}`;
    li.draggable = true;
    const image = entry.img ?? entry.thumb;
    li.innerHTML = `${image ? `<img class="thumbnail" src="${escapeAttribute(image)}" alt="">` : `<i class="fas fa-file"></i>`}<a class="entry-name">${escapeHtml(entry.name)}</a>`;
    target.append(li);
  }
}

function bindCompendiumInteractions(root, pack) {
  root.querySelectorAll(".folder-header").forEach(header => header.addEventListener("click", () => header.parentElement.classList.toggle("collapsed")));
  root.querySelectorAll(".cs-pack-entry").forEach(entry => {
    entry.addEventListener("click", async () => (await pack.getDocument(entry.dataset.entryId))?.sheet?.render(true));
    entry.addEventListener("dragstart", event => {
      event.dataTransfer.setData("text/plain", JSON.stringify({ type: pack.documentName, uuid: entry.dataset.uuid }));
    });
  });
  const search = root.querySelector('input[type="search"], input[name="search"]');
  search?.addEventListener("input", event => filterEntries(root, event.currentTarget.value), { capture: true });
}

function filterEntries(root, query) {
  const needle = query.trim().toLocaleLowerCase();
  root.querySelectorAll(".cs-pack-entry").forEach(entry => {
    entry.hidden = needle && !entry.textContent.toLocaleLowerCase().includes(needle);
  });
  root.querySelectorAll("li.folder").forEach(folder => {
    folder.hidden = needle && !folder.querySelector(".cs-pack-entry:not([hidden])");
  });
}

function updateHeader(root, pack, count) {
  const title = root.querySelector(".directory-header h3, .header-search + h3");
  if (title) title.textContent = `${pack.title} (${count})`;
}

function escapeHtml(value = "") {
  const span = document.createElement("span"); span.textContent = value; return span.innerHTML;
}
function escapeAttribute(value = "") {
  return escapeHtml(value).replaceAll('"', "&quot;");
}

Hooks.on("updateCompendium", pack => indexCache.delete(pack.collection));
Hooks.on("createCompendium", pack => indexCache.delete(pack.collection));
Hooks.on("deleteCompendium", pack => indexCache.delete(pack.collection));
