import { join, resolve } from "node:path";
import { Family, type FamilyMember } from "@shared/model";
import { readJsonIfExists, writeFileAtomic } from "./files";

// Fiche famille dans <dataDir>/family.json : apparence et voix de chaque personne, communes à
// toutes les histoires.
export class FamilyStore {
  private readonly path: string;

  constructor(dataDir: string) {
    this.path = join(resolve(dataDir), "family.json");
  }

  async list(): Promise<FamilyMember[]> {
    return Family.parse((await readJsonIfExists(this.path)) ?? {}).members;
  }

  async save(members: FamilyMember[]): Promise<FamilyMember[]> {
    const family = Family.parse({ members });
    await writeFileAtomic(this.path, JSON.stringify(family, null, 2));
    return family.members;
  }

  // Modifie la personne qui porte ce nom, s'il y en a une.
  async updateByName(name: string, change: Partial<Pick<FamilyMember, "appearance" | "voice">>): Promise<void> {
    const members = await this.list();
    const member = findMember(members, name);
    if (!member) return;
    Object.assign(member, change);
    await this.save(members);
  }
}

// Personne de la famille désignée par ce nom (ou l'un de ses autres noms), sans tenir compte
// des majuscules, accents, espaces et tirets : « MamieRose » = « Mamie-Rose ».
export function findMember(members: FamilyMember[], name: string): FamilyMember | undefined {
  const key = normalize(name);
  return members.find((m) => [m.name, ...m.aliases].some((n) => normalize(n) === key));
}

function normalize(name: string): string {
  return name
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
}
