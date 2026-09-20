/* eslint-disable no-unused-vars */
import * as internals from "./router.js";

export function createRouterMethods03() {
  const { Platform, getStackEntryRoute, getStackEntryParams } = internals;

  return {
    async back(options = {}) {
      if (this.pendingHistoryReturn || this.pendingPostPlayNavigation) {
        return;
      }

      const currentScreen = this.getCurrentScreen();
      const consumeResult = !options?.skipConsume ? currentScreen?.consumeBackRequest?.() : false;
      if (consumeResult) {
        if (consumeResult !== "history") {
          this.suppressNextPopstate();
        }
        return;
      }

      if (this.current === "home") {
        Platform.exitApp();
        return;
      }

      if (!options?.skipHistory && window?.history && typeof window.history.back === "function" && this.historyInitialized) {
        if (options?.skipConsume) {
          this.skipConsumeNextPopstate = true;
        }
        window.history.back();
        return;
      }

      if (this.stack.length === 0) {
        if (this.current && this.current !== "home" && this.routes.home) {
          const previousRoute = this.current;
          this.routes[this.current].cleanup?.();
          this.current = "home";
          this.currentParams = {};
          await this.routes.home.mount(
            {},
            {
              isBackNavigation: true,
              previousRoute
            }
          );
          this.persistWebOsResumeRoute("home", {});
          return;
        }

        Platform.exitApp();
        return;
      }

      const previous = this.stack.pop();
      const previousRoute = getStackEntryRoute(previous);
      const previousParams = getStackEntryParams(previous);

      if (!previousRoute || !this.routes[previousRoute]) {
        return;
      }

      const fromRoute = this.current;
      this.captureCurrentRouteState();
      this.routes[this.current].cleanup?.();
      this.current = previousRoute;
      this.currentParams = previousParams;
      const navigationContext = this.resolveNavigationContext(previousRoute, previousParams, {
        isBackNavigation: true,
        previousRoute: fromRoute
      });

      await this.routes[previousRoute].mount(previousParams, navigationContext);
      this.persistWebOsResumeRoute(this.current, this.currentParams);
    },
    getCurrent() {
      return this.current;
    },
    getCurrentScreen() {
      if (!this.current) {
        return null;
      }
      return this.routes[this.current] || null;
    }
  };
}
