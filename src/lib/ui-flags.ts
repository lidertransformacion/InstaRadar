// UI switches. Flip these to restore the hidden controls; no other code needs to change.

/** Show the Buscar / Detener / Exportar CSV buttons on the Radar. */
export const SHOW_SEARCH_CONTROLS = false;

/** When set, the follower slider is locked to this range and the filter always uses it. Use null to unlock. */
export const LOCKED_FOLLOWER_RANGE: [number, number] | null = [2_000, 25_000];
