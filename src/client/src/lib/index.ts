// place files you want to import through the `#lib` alias in this folder.

export const API_ROOT = "http://localhost:4000/api";
export const WS_ROOT = "ws://localhost:4000";

/** URL of a library item's image, by its Media id. */
export const mediaUrl = (id: string) =>
  `${API_ROOT}/files/${encodeURIComponent(id)}`;
