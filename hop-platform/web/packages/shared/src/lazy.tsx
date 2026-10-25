import { lazy, Suspense, type ComponentType } from "react";
import PageLoader from "./PageLoader";

// Loads a screen on demand. Pass preload=true to start downloading immediately in the background.
export function lazyPanel<P extends object>(load: () => Promise<{ default: ComponentType<P> }>, label = "Loading…", preload = false) {
  const Inner = lazy(load);
  if (preload) void load();
  return function Lazy(props: P) {
    return (
      <Suspense fallback={<PageLoader label={label} />}>
        <Inner {...props} />
      </Suspense>
    );
  };
}
