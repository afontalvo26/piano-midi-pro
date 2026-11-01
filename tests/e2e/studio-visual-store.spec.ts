import { expect, test } from "@playwright/test";

test("el store agrupa actualizaciones y se detiene al ocultar la pestaña", async ({ page }) => {
  await page.goto("/");
  await expect(page.locator(".piano-app")).toBeVisible();

  const metrics = await page.evaluate(async () => {
    const { pianoKeyboardStore: store } = await import(
      "/src/state/pianoKeyboardStore.ts"
    );
    const nextFrame = () =>
      new Promise<void>((resolve) =>
        requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
      );
    let observerCalls = 0;
    let uiCalls = 0;
    let hidden = false;
    const originalHidden = Object.getOwnPropertyDescriptor(document, "hidden");
    const stopObserver = store.observe(() => observerCalls++);
    const stopUi = store.subscribe(() => uiCalls++);

    try {
      await nextFrame(); // initial catch-up on subscription
      observerCalls = 0;
      uiCalls = 0;

      store.noteOn(60);
      store.setVelocity(83);
      store.noteOff(60);
      const immediately = { observerCalls, uiCalls };
      await nextFrame();
      const visible = { observerCalls, uiCalls };

      Object.defineProperty(document, "hidden", {
        configurable: true,
        get: () => hidden,
      });
      hidden = true;
      document.dispatchEvent(new Event("visibilitychange"));
      store.noteOn(61);
      store.setPitchBend(23);
      const whileHiddenBeforeFrame = { observerCalls, uiCalls };
      await nextFrame();
      const whileHiddenAfterFrame = { observerCalls, uiCalls };

      hidden = false;
      document.dispatchEvent(new Event("visibilitychange"));
      await nextFrame();
      const afterReturn = { observerCalls, uiCalls };

      return {
        immediately,
        visible,
        whileHiddenBeforeFrame,
        whileHiddenAfterFrame,
        afterReturn,
      };
    } finally {
      stopUi();
      stopObserver();
      store.clearMidi();
      store.setVelocity(0);
      store.setPitchBend(0);
      if (originalHidden) {
        Object.defineProperty(document, "hidden", originalHidden);
      } else {
        Reflect.deleteProperty(document, "hidden");
      }
      document.dispatchEvent(new Event("visibilitychange"));
    }
  });

  expect(metrics.immediately).toEqual({ observerCalls: 3, uiCalls: 0 });
  expect(metrics.visible).toEqual({ observerCalls: 3, uiCalls: 1 });
  expect(metrics.whileHiddenBeforeFrame).toEqual({ observerCalls: 5, uiCalls: 1 });
  expect(metrics.whileHiddenAfterFrame).toEqual(metrics.whileHiddenBeforeFrame);
  expect(metrics.afterReturn).toEqual({ observerCalls: 5, uiCalls: 2 });
});
