// Shared script loaded into an isolated Thunderbird or test scope.
var AccountPaneView = (() => {
  function create({ document, folderPane, labels, onSelect, cssText }) {
    const tree = document.getElementById("folderTree");
    if (!tree || tree.parentNode !== folderPane) {
      throw new TypeError("AccountPane requires a supported folder pane");
    }
    const style = document.createElement("style");
    style.textContent = cssText ?? "";
    const section = document.createElement("section");
    section.id = "accountpane-accounts";
    const heading = document.createElement("h2");
    heading.id = "accountpane-heading";
    heading.textContent = labels.accounts;
    section.setAttribute("aria-labelledby", heading.id);
    const list = document.createElement("ul");
    list.id = "accountpane-list";
    list.setAttribute("role", "listbox");
    list.setAttribute("aria-labelledby", heading.id);
    section.append(heading, list);
    folderPane.insertBefore(section, tree);
    document.head.append(style);

    let entries = [];
    let disposed = false;

    function entryFor(target) {
      return entries.find(entry => entry.option.contains(target));
    }

    function setTabStop(entry) {
      for (const current of entries) {
        current.option.tabIndex = current === entry ? 0 : -1;
      }
    }

    function onFocus(event) {
      const entry = entryFor(event.target);
      if (entry) {
        setTabStop(entry);
      }
    }

    function onClick(event) {
      const entry = entryFor(event.target);
      if (entry) {
        entry.option.focus();
        onSelect(entry.id);
      }
    }

    function onKeyDown(event) {
      const entry = entryFor(event.target);
      if (!entry || event.altKey || event.ctrlKey || event.metaKey) {
        return;
      }
      const index = entries.indexOf(entry);
      let next;
      switch (event.key) {
        case "ArrowUp": next = Math.max(0, index - 1); break;
        case "ArrowDown": next = Math.min(entries.length - 1, index + 1); break;
        case "Home": next = 0; break;
        case "End": next = entries.length - 1; break;
        case "Enter":
        case " ":
          event.preventDefault();
          event.stopPropagation();
          onSelect(entry.id);
          return;
        default:
          // Native Tab order leads from the single account tab stop to folderTree.
          return;
      }
      event.preventDefault();
      event.stopPropagation();
      entries[next].option.focus();
    }

    list.addEventListener("click", onClick);
    list.addEventListener("keydown", onKeyDown);
    list.addEventListener("focusin", onFocus);

    function render(accounts, selectedAccountId) {
      if (disposed) {
        return;
      }
      const previouslyFocused = entryFor(document.activeElement);
      const items = [{ id: null, name: labels.allAccounts }, ...accounts];
      const selected = items.some(account => account.id === selectedAccountId) ? selectedAccountId : null;
      entries = items.map(account => {
        const option = document.createElement("li");
        option.setAttribute("role", "option");
        option.setAttribute("aria-selected", String(account.id === selected));
        const label = document.createElement("span");
        label.textContent = account.name;
        option.append(label);
        return { id: account.id, option };
      });
      const tabStop = entries.find(entry => previouslyFocused && entry.id === previouslyFocused.id) ||
        entries.find(entry => entry.id === selected);
      setTabStop(tabStop);
      list.replaceChildren(...entries.map(entry => entry.option));
      if (previouslyFocused) {
        tabStop.option.focus();
      }
    }

    function dispose() {
      if (disposed) {
        return;
      }
      disposed = true;
      list.removeEventListener("click", onClick);
      list.removeEventListener("keydown", onKeyDown);
      list.removeEventListener("focusin", onFocus);
      if (section.contains(document.activeElement)) {
        tree.focus();
      }
      section.remove();
      style.remove();
      entries = [];
    }
    return { render, dispose };
  }
  return { create };
})();
