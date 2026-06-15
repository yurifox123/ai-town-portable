function toDisplayText(value) {
  return String(value ?? "");
}

function resolveDocument(container) {
  return container?.ownerDocument || document;
}

export function escapeHtml(value) {
  return toDisplayText(value).replace(
    /[&<>"']/g,
    (char) =>
      ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#39;",
      })[char],
  );
}

export function createSafeMessageElement(message = {}, doc = document) {
  const root = doc.createElement("div");
  root.className = `meeting-msg ${
    message.type === "player" ? "player-msg" : "agent-msg"
  }`;

  const name = doc.createElement("div");
  name.className = "msg-name";
  name.textContent = toDisplayText(message.agentName);

  const text = doc.createElement("div");
  text.className = "msg-text";
  text.textContent = toDisplayText(message.content);

  root.append(name, text);
  return root;
}

export function appendSafeMessage(container, message = {}) {
  if (!container) return null;
  const node = createSafeMessageElement(message, resolveDocument(container));
  container.appendChild(node);
  return node;
}

export function clearElement(element) {
  if (element) element.textContent = "";
}

export function appendTextElement(container, tagName, text, className = "") {
  if (!container) return null;
  const doc = resolveDocument(container);
  const element = doc.createElement(tagName);
  if (className) element.className = className;
  element.textContent = toDisplayText(text);
  container.appendChild(element);
  return element;
}
