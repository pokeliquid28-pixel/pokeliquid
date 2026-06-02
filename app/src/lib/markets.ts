export type Market = {
  id: string;
  name: string;
  subtitle: string;
  badge: string;
  live: boolean;
  oracleAddress?: string;
  programId?: string;
  tcgplayerId?: number;
  image?: string;
};

export const MARKETS: Market[] = [
  {
    id: "PRISMATIC-ETB",
    name: "PRISMATIC-ETB-PERP",
    subtitle: "Prismatic Evolutions ETB \u00B7 Sealed",
    badge: "HOLO",
    live: true,
    oracleAddress: "2euE9eMGTNwyW7jqG63JvRZfHeo7psKZgBCizfNMjW12",
    programId: "7DVf9oEMcKPV6VUUz5BpptbwqpgBfXunwxjTNNQmZvbJ",
    image: "https://product-images.tcgplayer.com/fit-in/400x400/593355.jpg",
  },
  {
    id: "MEGA-CHARIZARD-X",
    name: "CHARIZARD-X-PERP",
    subtitle: "Mega Charizard X ex \u00B7 Phantasmal Flames",
    badge: "HOLO",
    live: false,
    tcgplayerId: 662184,
    image: "https://product-images.tcgplayer.com/fit-in/400x400/662184.jpg",
  },
  {
    id: "CHARMANDER-PROMO",
    name: "CHARMANDER-PERP",
    subtitle: "Charmander #038 \u00B7 Mega Evolution Promo",
    badge: "PROMO",
    live: false,
    tcgplayerId: 684462,
    image: "https://product-images.tcgplayer.com/fit-in/400x400/684462.jpg",
  },
  {
    id: "PIKACHU-EX",
    name: "PIKACHU-PERP",
    subtitle: "Pikachu ex \u00B7 Ascended Heroes",
    badge: "HOLO",
    live: false,
    tcgplayerId: 676088,
    image: "https://product-images.tcgplayer.com/fit-in/400x400/676088.jpg",
  },
];
