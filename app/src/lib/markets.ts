export type Market = {
  id: string;
  name: string;
  subtitle: string;
  badge: string;
  live: boolean;
  oracleAddress: string;
  programId: string;
  tcgplayerId?: number;
  image?: string;
  /** Keeper API market query param (e.g. "ETB", "CHARIZARD-X") */
  priceApiMarket: string;
};

export const MARKETS: Market[] = [
  {
    id: "PRISMATIC-ETB",
    name: "PRISMATIC-ETB-PERP",
    subtitle: "Prismatic Evolutions \u00B7 Sealed Product",
    badge: "",
    live: true,
    oracleAddress: "4v5ogQV1i2yQhdsc4YuG78AG5NvtDaE9kfCSCQwL3bZH",
    programId: "7DVf9oEMcKPV6VUUz5BpptbwqpgBfXunwxjTNNQmZvbJ",
    tcgplayerId: 593355,
    image: "https://product-images.tcgplayer.com/fit-in/400x400/593355.jpg",
    priceApiMarket: "ETB",
  },
  {
    id: "CHARIZARD-125/094-PFL",
    name: "CHARIZARD-125/094-PFL-PERP",
    subtitle: "Mega Charizard X ex \u00B7 125/094 \u00B7 Phantasmal Flames",
    badge: "SIR",
    live: true,
    oracleAddress: "8UWP5YpJh2bZAC24zNaQm9z4p6vLwJJPEGztRY4QHAfg",
    programId: "7DVf9oEMcKPV6VUUz5BpptbwqpgBfXunwxjTNNQmZvbJ",
    tcgplayerId: 662184,
    image: "https://product-images.tcgplayer.com/fit-in/400x400/662184.jpg",
    priceApiMarket: "CHARIZARD-X",
  },
  {
    id: "CHARMANDER-038-MEP",
    name: "CHARMANDER-038-MEP-PERP",
    subtitle: "Charmander \u00B7 #038 \u00B7 Mega Evolution Promo",
    badge: "IR",
    live: true,
    oracleAddress: "6WQUKKr2uLU4Pv7ZNwUEuLhCrQjEFCvsaZxfCwo2a3XD",
    programId: "7DVf9oEMcKPV6VUUz5BpptbwqpgBfXunwxjTNNQmZvbJ",
    tcgplayerId: 684462,
    image: "https://product-images.tcgplayer.com/fit-in/400x400/684462.jpg",
    priceApiMarket: "CHARMANDER",
  },
  {
    id: "PIKACHU-276/217-AH",
    name: "PIKACHU-276/217-AH-PERP",
    subtitle: "Pikachu ex \u00B7 276/217 \u00B7 Ascended Heroes",
    badge: "SIR",
    live: true,
    oracleAddress: "B1BWNQ2YdS7fgage61wFHc1Qs3aFMLtbYw7TPi6bQRYs",
    programId: "7DVf9oEMcKPV6VUUz5BpptbwqpgBfXunwxjTNNQmZvbJ",
    tcgplayerId: 676088,
    image: "https://product-images.tcgplayer.com/fit-in/400x400/676088.jpg",
    priceApiMarket: "PIKACHU",
  },
];
