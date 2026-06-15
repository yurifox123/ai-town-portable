import { describe, expect, it } from "vitest";
import {
  appendSafeMessage,
  appendTextElement,
  clearElement,
  createSafeMessageElement,
  escapeHtml,
} from "../public/js/app/dom-utils.js";

function createFakeDocument() {
  return {
    createElement(tagName) {
      return {
        tagName,
        ownerDocument: this,
        className: "",
        textContent: "",
        children: [],
        append(...nodes) {
          this.children.push(...nodes);
        },
        appendChild(node) {
          this.children.push(node);
          return node;
        },
      };
    },
  };
}

describe("dom-utils", () => {
  it("escapes text for legacy template rendering", () => {
    expect(escapeHtml(`<img src=x onerror="alert('x')">`)).toBe(
      "&lt;img src=x onerror=&quot;alert(&#39;x&#39;)&quot;&gt;",
    );
  });

  it("creates chat message nodes with textContent instead of HTML", () => {
    const doc = createFakeDocument();
    const node = createSafeMessageElement(
      {
        agentName: "<b>Alice</b>",
        content: `<img src=x onerror="alert(1)">`,
        type: "player",
      },
      doc,
    );

    expect(node.className).toContain("player-msg");
    expect(node.children[0].textContent).toBe("<b>Alice</b>");
    expect(node.children[1].textContent).toBe(`<img src=x onerror="alert(1)">`);
    expect(node.innerHTML).toBeUndefined();
  });

  it("appends safe chat message nodes to a container", () => {
    const doc = createFakeDocument();
    const container = {
      ownerDocument: doc,
      children: [],
      appendChild(node) {
        this.children.push(node);
        return node;
      },
    };

    const node = appendSafeMessage(container, {
      agentName: "Bob",
      content: "hello",
    });

    expect(container.children).toEqual([node]);
    expect(node.children[0].textContent).toBe("Bob");
    expect(node.children[1].textContent).toBe("hello");
  });

  it("appends generic text elements without parsing markup", () => {
    const doc = createFakeDocument();
    const container = {
      ownerDocument: doc,
      children: [],
      appendChild(node) {
        this.children.push(node);
        return node;
      },
    };

    const node = appendTextElement(
      container,
      "span",
      `<script>alert("x")</script>`,
      "safe-text",
    );

    expect(container.children).toEqual([node]);
    expect(node.className).toBe("safe-text");
    expect(node.textContent).toBe(`<script>alert("x")</script>`);
    expect(node.innerHTML).toBeUndefined();
  });

  it("clears an element through textContent", () => {
    const element = { textContent: "old" };
    clearElement(element);

    expect(element.textContent).toBe("");
  });
});
