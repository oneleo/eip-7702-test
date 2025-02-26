import { useSyncExternalStore } from "react";

import { store } from "~/src/hook/store";

export const useSyncProviders = () =>
  useSyncExternalStore(store.subscribe, store.value, store.value);
