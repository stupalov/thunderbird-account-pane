// Synthetic model data only; no profile identifiers or user mailbox data.
export function makeModelFixture() {
  const account = (id, name, extra = {}) => ({
    id, serverKey: `server-${id}`, name, type: "imap",
    hidden: false, deferred: false, local: false, ...extra
  });
  const folder = (accountId, path, extra = {}) => ({
    uri: `fixture://${accountId}/${path}`, accountId,
    inbox: false, root: false, available: true, ...extra
  });
  return {
    accounts: [
      account("b", "Zulu"),
      account("a", "Alpha"),
      account("local", "Local Folders", { type: "none", local: true }),
      account("hidden", "Hidden", { hidden: true }),
      account("im", "Instant messages", { type: "im" }),
      account("chat", "Chat", { type: "chat" }),
      account("deferred", "Deferred POP", { type: "pop3", deferred: true }),
      account("pop", "Ordinary POP", { type: "pop3" })
    ],
    folders: [
      folder("a", "root", { root: true }),
      folder("a", "archive"),
      folder("a", "renamed-inbox", { inbox: true }),
      folder("a", "unavailable", { inbox: true, available: false }),
      folder("b", "root", { root: true }),
      folder("b", "inbox", { inbox: true }),
      folder("local", "root", { root: true }),
      folder("local", "saved")
    ]
  };
}
