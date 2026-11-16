/**
 * The game hour as a shader uniform shared by the materials that change with it on the GPU:
 * rolling shutters (`FacadeKit`) and props that are only out while their shop is open
 * (`StreetLife`). Set once a frame (`setStreetHour`); costs one uniform upload per material.
 */
export const STREET_HOUR = { value: 12 };

export function setStreetHour(hour: number): void {
  STREET_HOUR.value = ((hour % 24) + 24) % 24;
}
