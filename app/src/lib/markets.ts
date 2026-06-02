export type Market = {
  id: string;
  name: string;
  subtitle: string;
  badge: string;
  live: boolean;
  oracleAddress: string;
  programId: string;
};

export const MARKETS: Market[] = [
  {
    id: "PRISMATIC-ETB",
    name: "PRISMATIC-ETB-PERP",
    subtitle: "Prismatic Evolutions ETB · Sealed",
    badge: "HOLO",
    live: true,
    oracleAddress: "2euE9eMGTNwyW7jqG63JvRZfHeo7psKZgBCizfNMjW12",
    programId: "7DVf9oEMcKPV6VUUz5BpptbwqpgBfXunwxjTNNQmZvbJ",
  },
];
