export type PbsSection = {
  id: string;
  fields: Record<string, string>;
};

export type PbsParsedFile = {
  sections: Map<string, PbsSection>;
};

export type PbsDataset = {
  pokemon: PbsParsedFile;
  forms: PbsParsedFile;
  moves: PbsParsedFile;
  abilities: PbsParsedFile;
  items: PbsParsedFile;
  types: PbsParsedFile;

  /**
   * Draft points / base_cost source.
   * Key is a normalized slug (e.g. "arcanine-hisuian", "basculegion-female").
   */
  pokemonPoints: Map<string, number>;
};
