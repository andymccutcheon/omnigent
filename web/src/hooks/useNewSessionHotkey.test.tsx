import { cleanup, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { EmbeddedProvider } from "@/lib/embedded";
import { setEmbedRoot } from "@/lib/host";

import { isNewSessionHotkey, useNewSessionHotkey } from "./useNewSessionHotkey";

const navigate = vi.fn();
vi.mock("@/lib/routing", () => ({ useNavigate: () => navigate }));

afterEach(() => {
  cleanup();
  setEmbedRoot(null);
  navigate.mockReset();
  document.body.innerHTML = "";
});

function event(init: KeyboardEventInit): KeyboardEvent {
  return new KeyboardEvent("keydown", { bubbles: true, cancelable: true, ...init });
}

function press(init: KeyboardEventInit, target: HTMLElement = document.body): KeyboardEvent {
  const e = event(init);
  target.dispatchEvent(e);
  return e;
}

describe("isNewSessionHotkey", () => {
  it("uses Cmd on macOS and Ctrl on other platforms", () => {
    expect(
      isNewSessionHotkey(
        event({ key: "N", code: "KeyN", metaKey: true, altKey: true, shiftKey: true }),
        true,
      ),
    ).toBe(true);
    expect(
      isNewSessionHotkey(
        event({ key: "N", code: "KeyN", ctrlKey: true, altKey: true, shiftKey: true }),
        true,
      ),
    ).toBe(false);
    expect(
      isNewSessionHotkey(
        event({ key: "N", code: "KeyN", ctrlKey: true, altKey: true, shiftKey: true }),
        false,
      ),
    ).toBe(true);
    expect(
      isNewSessionHotkey(
        event({ key: "N", code: "KeyN", metaKey: true, altKey: true, shiftKey: true }),
        false,
      ),
    ).toBe(false);
  });

  it.each(["N", "Dead", "˜"])("matches physical N when Alt produces %s", (key) => {
    for (const isMac of [true, false]) {
      const modifiers = { metaKey: isMac, ctrlKey: !isMac, altKey: true, shiftKey: true };
      expect(isNewSessionHotkey(event({ key, code: "KeyN", ...modifiers }), isMac)).toBe(true);
      expect(isNewSessionHotkey(event({ key: "N", code: "KeyS", ...modifiers }), isMac)).toBe(
        false,
      );
    }
  });

  it.each([true, false])("leaves browser chords alone with isMac=%s", (isMac) => {
    const command = { metaKey: isMac, ctrlKey: !isMac };
    for (const init of [
      { key: "N", code: "KeyN" },
      { key: "N", code: "KeyN", shiftKey: true },
      { key: "N", code: "KeyN", altKey: true },
      { key: "O", code: "KeyO", shiftKey: true },
      { key: "M", code: "KeyM", altKey: true, shiftKey: true },
      { key: "N", code: "KeyN", altKey: true, shiftKey: true, ctrlKey: true, metaKey: true },
    ]) {
      expect(isNewSessionHotkey(event({ ...command, ...init }), isMac)).toBe(false);
    }
    const altGraph = event({ ...command, code: "KeyN", altKey: true, shiftKey: true });
    vi.spyOn(altGraph, "getModifierState").mockImplementation((key) => key === "AltGraph");
    expect(isNewSessionHotkey(altGraph, isMac)).toBe(false);
  });

  it("preserves the native chord and rejects the old browser chord", () => {
    const old = event({ key: "˜", code: "KeyN", metaKey: true, altKey: true });
    expect(isNewSessionHotkey(old, true, true)).toBe(true);
    expect(isNewSessionHotkey(old, true, false)).toBe(false);
    expect(
      isNewSessionHotkey(
        event({ key: "N", code: "KeyN", metaKey: true, altKey: true, shiftKey: true }),
        true,
        true,
      ),
    ).toBe(false);
    expect(
      isNewSessionHotkey(event({ code: "KeyN", ctrlKey: true, altKey: true }), false, true),
    ).toBe(true);
  });
});

describe("useNewSessionHotkey", () => {
  it("navigates to the shared new-session route and claims Ctrl+Alt+Shift+N", () => {
    renderHook(() => useNewSessionHotkey(true, false));

    const e = press({ key: "N", code: "KeyN", ctrlKey: true, altKey: true, shiftKey: true });

    expect(navigate).toHaveBeenCalledWith("/");
    expect(e.defaultPrevented).toBe(true);
  });

  it("claims physical N when Option produces a dead key", () => {
    renderHook(() => useNewSessionHotkey(true, true));

    const e = press({ key: "Dead", code: "KeyN", metaKey: true, altKey: true, shiftKey: true });

    expect(e.defaultPrevented).toBe(true);
    expect(navigate).toHaveBeenCalledExactlyOnceWith("/");
  });

  it("works from editable fields so the global action is focus-independent", () => {
    renderHook(() => useNewSessionHotkey(true, false));
    const input = document.createElement("input");
    document.body.appendChild(input);
    input.focus();

    press({ key: "N", code: "KeyN", ctrlKey: true, altKey: true, shiftKey: true }, input);

    expect(navigate).toHaveBeenCalledWith("/");
  });

  it("handles embedded input without claiming shortcuts in the host page", () => {
    const root = document.createElement("div");
    const input = document.createElement("input");
    root.appendChild(input);
    document.body.appendChild(root);
    setEmbedRoot(root);
    renderHook(() => useNewSessionHotkey(true, false), { wrapper: EmbeddedProvider });

    const outside = press({ key: "N", code: "KeyN", ctrlKey: true, altKey: true, shiftKey: true });
    expect(outside.defaultPrevented).toBe(false);
    expect(navigate).not.toHaveBeenCalled();

    const inside = press(
      { key: "N", code: "KeyN", ctrlKey: true, altKey: true, shiftKey: true },
      input,
    );
    expect(inside.defaultPrevented).toBe(true);
    expect(navigate).toHaveBeenCalledExactlyOnceWith("/");
  });

  it("ignores auto-repeat", () => {
    renderHook(() => useNewSessionHotkey(true, false));

    press({ key: "N", code: "KeyN", ctrlKey: true, altKey: true, shiftKey: true, repeat: true });

    expect(navigate).not.toHaveBeenCalled();
  });

  it("leaves the shortcut to the host page when disabled", () => {
    renderHook(() => useNewSessionHotkey(false, false));

    const e = press({ key: "N", code: "KeyN", ctrlKey: true, altKey: true, shiftKey: true });

    expect(navigate).not.toHaveBeenCalled();
    expect(e.defaultPrevented).toBe(false);
  });
});
