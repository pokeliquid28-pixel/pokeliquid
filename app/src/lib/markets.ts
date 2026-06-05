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
    oracleAddress: "FbPBfXaCY1Chm23pyVv7gcesRVK7FxFXHgd5xNb84r4Q",
    programId: "5C1cz4kCA8DcD2zjhBphuK86vAjdoCnichK1kdLHPMt6",
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
    oracleAddress: "8KU9oyrCAhX58Mz73z8MjKH8P88CyqPcx8zCm61HWzeP",
    programId: "5C1cz4kCA8DcD2zjhBphuK86vAjdoCnichK1kdLHPMt6",
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
    oracleAddress: "EN3Y7vWu2a2PXma2V5vfm6swFed8YTFHCG75EQxoHETY",
    programId: "5C1cz4kCA8DcD2zjhBphuK86vAjdoCnichK1kdLHPMt6",
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
    oracleAddress: "Fx1rYyuEz91rqgpEWHs8MyH7kiLpNeXuDdcAJiSjhN87",
    programId: "5C1cz4kCA8DcD2zjhBphuK86vAjdoCnichK1kdLHPMt6",
    tcgplayerId: 676088,
    image: "https://product-images.tcgplayer.com/fit-in/400x400/676088.jpg",
    priceApiMarket: "PIKACHU",
  },
];
