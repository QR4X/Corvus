import { getModelCard } from "../providers/modelDescriptions";
import { getModelFamily, getFamilyRank } from "../providers/modelFamily";
import {
  categoryToRole,
  ROLE_ICONS,
  ROLE_LABELS,
  ROLE_ORDER,
  type RoleId,
} from "../providers/modelRoles";
import { compararFabricantes, fabricante, type Fabricante } from "../providers/vendors";
import { tr } from "../i18n/tr";

export interface CatalogFamily {
  id: string;
  label: string;
  icon: string;
  color: string;
  models: string[];
}

export interface CatalogRole {
  id: RoleId;
  label: string;
  icon: string;

  count: number;
  families: CatalogFamily[];
}

export function buildModelCatalog(
  provider: string,
  models: string[]
): CatalogRole[] {
  const byRole = new Map<RoleId, Map<string, CatalogFamily>>();

  for (const model of models) {
    const role = categoryToRole(getModelCard(provider, model).category);
    const fam = getModelFamily(model);
    const families = byRole.get(role) ?? new Map<string, CatalogFamily>();
    const entry = families.get(fam.id) ?? {
      id: fam.id,
      label: tr(fam.label),
      icon: fam.icon,
      color: fam.color,
      models: [],
    };
    entry.models.push(model);
    families.set(fam.id, entry);
    byRole.set(role, families);
  }

  const out: CatalogRole[] = [];
  for (const role of ROLE_ORDER) {
    const families = byRole.get(role);
    if (!families) continue;
    const list = Array.from(families.values()).sort(
      (a, b) => getFamilyRank(a.id) - getFamilyRank(b.id)
    );
    for (const f of list) f.models.sort();
    out.push({
      id: role,

      label: tr(ROLE_LABELS[role]),
      icon: ROLE_ICONS[role],
      count: list.reduce((n, f) => n + f.models.length, 0),
      families: list,
    });
  }
  return out;
}

export interface SecaoDoFabricante {
  roleId: RoleId;
  roleLabel: string;
  roleIcon: string;
  family: CatalogFamily;
}

export interface GrupoDoFabricante {
  fabricante: Fabricante;
  total: number;
  secoes: SecaoDoFabricante[];
}

export function porFabricante(groups: CatalogRole[]): GrupoDoFabricante[] {
  const mapa = new Map<string, GrupoDoFabricante>();
  for (const g of groups) {
    for (const fam of g.families) {
      for (const m of fam.models) {
        const f = fabricante(m);
        const grupo = mapa.get(f.chave) ?? { fabricante: f, total: 0, secoes: [] };
        let sec = grupo.secoes.find((s) => s.roleId === g.id && s.family.id === fam.id);
        if (!sec) {
          sec = { roleId: g.id, roleLabel: g.label, roleIcon: g.icon, family: { ...fam, models: [] } };
          grupo.secoes.push(sec);
        }
        sec.family.models.push(m);
        grupo.total++;
        mapa.set(f.chave, grupo);
      }
    }
  }
  return Array.from(mapa.values()).sort((a, b) => compararFabricantes(a.fabricante, b.fabricante));
}

export function soltosPorFabricante(
  models: string[]
): Array<{ fabricante: Fabricante; models: string[] }> {
  const mapa = new Map<string, { fabricante: Fabricante; models: string[] }>();
  for (const m of models) {
    const f = fabricante(m);
    const grupo = mapa.get(f.chave) ?? { fabricante: f, models: [] };
    grupo.models.push(m);
    mapa.set(f.chave, grupo);
  }
  const lista = Array.from(mapa.values());
  for (const g of lista) g.models.sort();
  return lista.sort((a, b) => compararFabricantes(a.fabricante, b.fabricante));
}
