import type { CityBundle, Shop } from "@/lib/types";

export const DEFAULT_CITIES: CityBundle[] = [
  {
    id: "medellin",
    name: "Medellín",
    country: "Colombia",
    competitor: "pergaminocafe",
    zones: [
      { name: "Laureles", locationUrl: "" },
      { name: "El Poblado", locationUrl: "" },
      { name: "Provenza", locationUrl: "" },
      { name: "Manila", locationUrl: "" },
      { name: "Envigado", locationUrl: "" },
      { name: "Ciudad del Río", locationUrl: "" },
      { name: "Sabaneta", locationUrl: "" },
    ],
    hashtags: [
      "cafemedellin",
      "cafeespecial",
      "brunchmedellin",
      "cafepoblado",
      "cafelaureles",
      "brunchcolombia",
      "foodiemedellin",
      "specialtycoffee",
    ],
    watches: ["pergaminocafe"],
    shops: [
      {
        zone: "Laureles",
        name: "Libertario Laureles",
        address: "Diagonal 75 #39cb-20, Laureles",
      },
      {
        zone: "Ciudad del Río",
        name: "Libertario Ciudad del Río",
        address: "Carrera 48 #18a-33, Ciudad del Río",
      },
    ],
  },
  {
    id: "santiago",
    name: "Santiago",
    country: "Chile",
    competitor: "",
    zones: [
      { name: "Nueva Costanera", locationUrl: "" },
      { name: "Vitacura", locationUrl: "" },
      { name: "Providencia", locationUrl: "" },
      { name: "Lastarria", locationUrl: "" },
      { name: "Ñuñoa", locationUrl: "" },
    ],
    hashtags: [
      "cafesantiago",
      "brunchsantiago",
      "cafeespecial",
      "specialtycoffee",
      "cafecostanera",
    ],
    watches: [],
    shops: [
      {
        zone: "Nueva Costanera",
        name: "Libertario Nueva Costanera",
        address: "Av. Nueva Costanera 3766, Vitacura",
      },
    ],
  },
];

export const DEFAULT_SETTINGS = {
  cityId: "medellin",
  minFollowers: 2000,
  maxFollowers: 25000,
  hourlyCap: 12,
  dailyCap: 40,
  minDelayMs: 3200,
  maxDelayMs: 8600,
  mockMode: false,
  sendEnabled: false,
  sendDailyCap: 15,
  researchProfileDir: "data/ig-profile",
  outreachProfileDir: "data/ig-outreach-profile",
  priceFile: "data/prices.json",
};

export function shopByZone(zone: string | null, shops: Shop[]): Shop | null {
  if (shops.length === 0) return null;
  return shops.find((shop) => shop.zone === zone) ?? shops[0];
}
