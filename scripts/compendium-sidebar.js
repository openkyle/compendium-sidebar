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
const FOLDER_STATE_KEY = "folder-states";
const refreshTimers = new Map();

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
  game.settings.register(MODULE_ID, FOLDER_STATE_KEY, {
    scope: "client", config: false, type: Object, default: {}
  });
});

async function onRenderDirectory(app, html) {
  const tab = app.tabName ?? app.options?.id ?? app.id?.replace?.("-directory", "");
  if (!(tab in DIRECTORIES)) return;
  const packId = game.settings.get(MODULE_ID, settingKey(tab));
  if (!packId) return;

  const root = rootElement(html);
  hideWorkingCopies(root);
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
    list.append(buildTree(pack, index, tab));
    bindCompendiumInteractions(root, pack);
    updateHeader(root, pack, index.length);
  } catch (error) {
    console.error(`${MODULE_ID} | Unable to load ${packId}`, error);
    list.innerHTML = `<li class="cs-empty">${game.i18n.localize("CS.LoadFailed")}</li>`;
  }
}

function buildTree(pack, entries, tab) {
  const fragment = document.createDocumentFragment();
  const folderCollection = pack.folders;
  const folders = Array.from(folderCollection?.contents ?? folderCollection ?? []);
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
      const expanded = getFolderExpanded(pack.collection, folder.id);
      li.className = `directory-item folder flexcol${expanded ? "" : " collapsed"}`;
      li.dataset.folderId = folder.id;
      li.innerHTML = `<header class="folder-header flexrow"><i class="fas fa-chevron-down folder-toggle" aria-hidden="true"></i><i class="fas ${expanded ? "fa-folder-open" : "fa-folder"} folder-icon" aria-hidden="true"></i><span class="folder-name">${escapeHtml(folder.name)}</span></header><ol class="subdirectory"></ol>`;
      const child = li.querySelector(".subdirectory");
      appendLevel(child, folder.id);
      appendEntries(child, entriesByFolder.get(folder.id) ?? [], pack, tab, sort);
      target.append(li);
    }
    if (parentId === "root") appendEntries(target, entriesByFolder.get("root") ?? [], pack, tab, sort);
  };
  appendLevel(fragment, "root");
  if (!fragment.childNodes.length) {
    const empty = document.createElement("li"); empty.className = "cs-empty";
    empty.textContent = game.i18n.localize("CS.Empty"); fragment.append(empty);
  }
  return fragment;
}

function appendEntries(target, entries, pack, tab, sort) {
  for (const entry of entries.sort(sort)) {
    const workingCopy = findWorkingCopy(tab, pack, entry._id);
    const li = document.createElement("li");
    li.className = "directory-item document flexrow cs-pack-entry";
    li.dataset.entryId = entry._id;
    li.dataset.uuid = `Compendium.${pack.collection}.${entry._id}`;
    if (workingCopy) li.dataset.workingId = workingCopy.id;
    li.draggable = true;
    const image = workingCopy?.img ?? entry.img ?? entry.thumb;
    const name = workingCopy?.name ?? entry.name;
    li.innerHTML = `${image ? `<img class="thumbnail" src="${escapeAttribute(image)}" alt="">` : `<i class="fas fa-file"></i>`}<a class="entry-name">${escapeHtml(name)}</a>${workingCopy ? '<i class="fas fa-pen cs-working-copy" title="Editable working copy"></i>' : ""}`;
    target.append(li);
  }
}

function bindCompendiumInteractions(root, pack) {
  root.querySelectorAll(".folder-header").forEach(header => header.addEventListener("click", async event => {
    event.preventDefault();
    event.stopPropagation();
    const folder = header.parentElement;
    folder.classList.toggle("collapsed");
    const expanded = !folder.classList.contains("collapsed");
    header.querySelector(".folder-icon")?.classList.toggle("fa-folder-open", expanded);
    header.querySelector(".folder-icon")?.classList.toggle("fa-folder", !expanded);
    await setFolderExpanded(pack.collection, folder.dataset.folderId, expanded);
  }));
  root.querySelectorAll(".cs-pack-entry").forEach(entry => {
    entry.querySelector("img")?.addEventListener("error", event => {
      const icon = document.createElement("i");
      icon.className = "fas fa-file cs-fallback-icon";
      event.currentTarget.replaceWith(icon);
    }, { once: true });
    entry.addEventListener("click", async () => openEditableDocument(pack, entry));
    entry.addEventListener("dragstart", event => {
      event.dataTransfer.setData("text/plain", JSON.stringify({ type: pack.documentName, uuid: entry.dataset.uuid }));
    });
  });
  root.querySelectorAll("li.folder").forEach(folder => {
    folder.addEventListener("dragover", event => event.preventDefault());
    folder.addEventListener("drop", async event => moveEntryToFolder(event, pack, folder.dataset.folderId));
  });
  root.addEventListener("click", event => {
    const createFolder = event.target.closest('[data-action="createFolder"], .create-folder');
    const createEntry = event.target.closest('[data-action="createEntry"], .create-document');
    if (!createFolder && !createEntry) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    if (createFolder) createCompendiumFolder(pack);
    else createCompendiumDocument(pack);
  }, true);
  const search = root.querySelector('input[type="search"], input[name="search"]');
  search?.addEventListener("input", event => filterEntries(root, event.currentTarget.value), { capture: true });
}

function getFolderExpanded(packId, folderId) {
  const states = game.settings.get(MODULE_ID, FOLDER_STATE_KEY) ?? {};
  return states[`${packId}.${folderId}`] ?? true;
}

async function setFolderExpanded(packId, folderId, expanded) {
  const states = foundry.utils.deepClone(game.settings.get(MODULE_ID, FOLDER_STATE_KEY) ?? {});
  states[`${packId}.${folderId}`] = expanded;
  await game.settings.set(MODULE_ID, FOLDER_STATE_KEY, states);
}

async function createCompendiumDocument(pack) {
  if (!await ensureWritablePack(pack)) return;
  return pack.documentClass.createDialog({}, { pack: pack.collection });
}

async function createCompendiumFolder(pack) {
  if (!await ensureWritablePack(pack)) return;
  await Folder.createDialog({ type: pack.documentName, folder: null }, { pack: pack.collection });
  indexCache.delete(pack.collection);
  rerenderDirectory(Object.keys(DIRECTORIES).find(tab => DIRECTORIES[tab].documentName === pack.documentName));
}

async function moveEntryToFolder(event, pack, folderId) {
  event.preventDefault();
  event.stopPropagation();
  let data;
  try { data = JSON.parse(event.dataTransfer.getData("text/plain")); } catch (_error) { return; }
  if (!data?.uuid?.startsWith(`Compendium.${pack.collection}.`)) return;
  if (!await ensureWritablePack(pack)) return;
  const id = data.uuid.split(".").pop();
  const document = await pack.getDocument(id);
  await document.update({ folder: folderId });
  indexCache.delete(pack.collection);
  ui.sidebar?.render?.(true);
}

async function ensureWritablePack(pack) {
  if (!pack.locked) return true;
  const isWorldPack = pack.metadata?.packageType === "world" || pack.collection.startsWith("world.");
  if (game.user.isGM && isWorldPack) {
    await pack.configure({ locked: false });
    return true;
  }
  ui.notifications.warn(game.i18n.localize("CS.ReadOnlyPack"));
  return false;
}

async function openEditableDocument(pack, entry) {
  let document = entry.dataset.workingId ? getWorldCollection(pack.documentName)?.get(entry.dataset.workingId) : null;
  const isWorldPack = pack.metadata?.packageType === "world" || pack.collection.startsWith("world.");
  if (!document && game.user.isGM && isWorldPack) {
    await ensureWritablePack(pack);
    document = await pack.getDocument(entry.dataset.entryId);
  }
  if (!document && game.user.isGM) document = await getOrCreateWorkingCopy(pack, entry.dataset.entryId);
  if (!document) document = await pack.getDocument(entry.dataset.entryId);
  document?.sheet?.render(true);
}

function getWorldCollection(documentName) {
  return Object.values(DIRECTORIES).find(config => config.documentName === documentName)
    ? game.collections?.get(documentName)
    : null;
}

function findWorkingCopy(tab, pack, entryId) {
  const collection = getWorldCollection(DIRECTORIES[tab].documentName);
  const sourceUuid = `Compendium.${pack.collection}.${entryId}`;
  return collection?.find(document => document.getFlag(MODULE_ID, "sourceUuid") === sourceUuid);
}

async function getOrCreateWorkingCopy(pack, entryId) {
  const sourceUuid = `Compendium.${pack.collection}.${entryId}`;
  const collection = getWorldCollection(pack.documentName);
  const existing = collection?.find(document => document.getFlag(MODULE_ID, "sourceUuid") === sourceUuid);
  if (existing) return existing;
  const source = await pack.getDocument(entryId);
  const folder = await getWorkingFolder(pack.documentName);
  const data = source.toObject();
  delete data._id;
  data.folder = folder.id;
  data.flags = foundry.utils.mergeObject(data.flags ?? {}, { [MODULE_ID]: { sourceUuid } });
  const created = await CONFIG[pack.documentName].documentClass.create(data, { renderSheet: false });
  ui.notifications.info(game.i18n.localize("CS.WorkingCopyCreated"));
  return created;
}

async function getWorkingFolder(documentName) {
  let folder = game.folders.find(candidate => candidate.type === documentName && candidate.getFlag(MODULE_ID, "workingCopies"));
  if (folder) return folder;
  return Folder.create({
    name: "Compendium Sidebar Working Copies",
    type: documentName,
    sorting: "a",
    flags: { [MODULE_ID]: { workingCopies: true } }
  }, { renderSheet: false });
}

function hideWorkingCopies(root) {
  if (!root) return;
  for (const folder of game.folders ?? []) {
    if (!folder.getFlag(MODULE_ID, "workingCopies")) continue;
    root.querySelector(`[data-folder-id="${folder.id}"]`)?.classList.add("cs-hidden-working-folder");
  }
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

Hooks.on("updateCompendium", pack => refreshConfiguredPack(pack.collection));
Hooks.on("createCompendium", pack => refreshConfiguredPack(pack.collection));
Hooks.on("deleteCompendium", pack => refreshConfiguredPack(pack.collection));

for (const config of Object.values(DIRECTORIES)) {
  Hooks.on(`update${config.documentName}`, (document, changes) => refreshChangedDocument(document, changes));
  Hooks.on(`create${config.documentName}`, document => refreshChangedDocument(document, { name: document.name }));
  Hooks.on(`delete${config.documentName}`, document => refreshChangedDocument(document, { name: document.name }));
}

function refreshChangedDocument(document, changes) {
  const exposedFieldChanged = ["name", "img", "thumb", "folder", "sort"].some(field => foundry.utils.hasProperty(changes, field));
  if (!exposedFieldChanged) return;

  if (document.pack) {
    const packId = typeof document.pack === "string" ? document.pack : document.pack.collection;
    refreshConfiguredPack(packId);
    return;
  }

  const sourceUuid = document.getFlag?.(MODULE_ID, "sourceUuid");
  if (!sourceUuid?.startsWith("Compendium.")) return;
  const parts = sourceUuid.split(".");
  refreshConfiguredPack(parts.slice(1, -1).join("."), { invalidate: false });
}

function refreshConfiguredPack(packId, { invalidate = true } = {}) {
  if (invalidate) indexCache.delete(packId);
  for (const tab of Object.keys(DIRECTORIES)) {
    if (game.settings.get(MODULE_ID, settingKey(tab)) !== packId) continue;
    if (!game.settings.get(MODULE_ID, modeKey(tab))) continue;
    clearTimeout(refreshTimers.get(tab));
    refreshTimers.set(tab, setTimeout(() => {
      refreshTimers.delete(tab);
      rerenderDirectory(tab);
    }, 75));
  }
}

// Add the transfer action to stock World directory context menus. Foundry V11/V12
// dispatch concrete hooks for entries and folders; V13 uses the ApplicationV2
// hooks registered below.
for (const [tab, config] of Object.entries(DIRECTORIES)) {
  const className = config.documentName === "JournalEntry" ? "Journal" :
    config.documentName === "RollTable" ? "RollTable" : config.documentName;
  Hooks.on(`get${className}DirectoryEntryContext`, (_html, options) => {
    options.push(transferEntryOption(tab));
  });
  Hooks.on(`get${className}DirectoryFolderContext`, (_html, options) => {
    options.push(transferFolderOption(tab));
  });
}

function transferEntryOption(tab) {
  return {
    name: "CS.TransferToCompendium",
    icon: '<i class="fas fa-book"></i>',
    condition: element => canTransfer(tab, element),
    callback: element => transferWorldEntry(tab, contextElement(element))
  };
}

function transferFolderOption(tab) {
  return {
    name: "CS.TransferFolderToCompendium",
    icon: '<i class="fas fa-folder-open"></i>',
    condition: element => canTransfer(tab, element),
    callback: element => transferWorldFolder(tab, contextElement(element))
  };
}

// ApplicationV2 context hooks used by Foundry V13+.
for (const [tab, config] of Object.entries(DIRECTORIES)) {
  Hooks.on(`get${config.documentName}ContextOptions`, (app, options) => {
    if (app.tabName !== tab || options.some(option => option.name === "CS.TransferToCompendium")) return;
    options.push(transferEntryOption(tab));
  });
}
Hooks.on("getFolderContextOptions", (app, options) => {
  const tab = app.tabName;
  if (!(tab in DIRECTORIES) || options.some(option => option.name === "CS.TransferFolderToCompendium")) return;
  options.push(transferFolderOption(tab));
});

function contextElement(element) {
  return element instanceof HTMLElement ? element : element?.[0];
}

function canTransfer(tab, element) {
  const node = contextElement(element);
  return Boolean(game.user.isGM && game.settings.get(MODULE_ID, settingKey(tab)) && node && !node.closest(".cs-compendium-mode"));
}

async function transferWorldEntry(tab, element) {
  const pack = game.packs.get(game.settings.get(MODULE_ID, settingKey(tab)));
  const collection = game.collections.get(DIRECTORIES[tab].documentName);
  const id = element?.dataset.documentId ?? element?.dataset.entryId;
  const document = collection?.get(id);
  if (!pack || !document || !await ensureWritablePack(pack)) return;
  const destinationFolder = await ensureCompendiumFolderPath(pack, document.folder);
  const result = await transferDocument(pack, document, destinationFolder?.id ?? null);
  if (result) finishTransfer(pack, 1);
}

async function transferWorldFolder(tab, element) {
  const pack = game.packs.get(game.settings.get(MODULE_ID, settingKey(tab)));
  const sourceFolder = game.folders.get(element?.dataset.folderId);
  const collection = game.collections.get(DIRECTORIES[tab].documentName);
  if (!pack || !sourceFolder || !collection || !await ensureWritablePack(pack)) return;

  const folders = [sourceFolder, ...sourceFolder.getSubfolders(true)];
  let transferred = 0;
  for (const folder of folders) {
    const destinationFolder = await ensureCompendiumFolderPath(pack, folder);
    const documents = collection.filter(document => document.folder?.id === folder.id || document.folder === folder.id);
    for (const document of documents) {
      const result = await transferDocument(pack, document, destinationFolder?.id ?? null);
      if (result) transferred += 1;
    }
  }
  finishTransfer(pack, transferred);
}

async function ensureCompendiumFolderPath(pack, sourceFolder) {
  if (!sourceFolder) return null;
  const chain = [...(sourceFolder.ancestors ?? [])].reverse().concat(sourceFolder);
  let parentId = null;
  for (const source of chain) {
    const folders = Array.from(pack.folders?.contents ?? pack.folders ?? []);
    let target = folders.find(folder => folder.name === source.name && (folder.folder?.id ?? folder.folder ?? null) === parentId);
    if (!target) {
      target = await Folder.create({ name: source.name, type: pack.documentName, folder: parentId }, { pack: pack.collection, renderSheet: false });
    }
    parentId = target.id;
  }
  return Array.from(pack.folders?.contents ?? pack.folders ?? []).find(folder => folder.id === parentId) ?? { id: parentId };
}

async function transferDocument(pack, source, folderId) {
  await pack.getIndex({ fields: ["name", "folder"] });
  const existing = Array.from(pack.index).find(entry => entry.name === source.name && (entry.folder?.id ?? entry.folder ?? null) === folderId);
  let action = "duplicate";
  if (existing) action = await collisionChoice(source.name);
  if (action === "cancel") return false;

  const data = source.toObject();
  delete data._id;
  delete data._stats;
  data.folder = folderId;
  if (action === "overwrite") {
    const target = await pack.getDocument(existing._id);
    await target.update(data, { diff: false, recursive: false });
  } else {
    await pack.documentClass.create(data, { pack: pack.collection, renderSheet: false });
  }
  indexCache.delete(pack.collection);
  return true;
}

function collisionChoice(name) {
  return new Promise(resolve => {
    let resolved = false;
    const finish = value => { resolved = true; resolve(value); };
    new Dialog({
      title: game.i18n.localize("CS.CollisionTitle"),
      content: `<p>${game.i18n.format("CS.CollisionMessage", { name: escapeHtml(name) })}</p>`,
      buttons: {
        duplicate: { icon: '<i class="fas fa-copy"></i>', label: game.i18n.localize("CS.Duplicate"), callback: () => finish("duplicate") },
        overwrite: { icon: '<i class="fas fa-rotate"></i>', label: game.i18n.localize("CS.Overwrite"), callback: () => finish("overwrite") },
        cancel: { icon: '<i class="fas fa-times"></i>', label: game.i18n.localize("Cancel"), callback: () => finish("cancel") }
      },
      default: "cancel",
      close: () => { if (!resolved) finish("cancel"); }
    }).render(true);
  });
}

function finishTransfer(pack, count) {
  indexCache.delete(pack.collection);
  ui.sidebar?.render?.(true);
  ui.notifications.info(game.i18n.format("CS.TransferComplete", { count, pack: pack.title }));
}
