import { getModelCard } from "../providers/modelDescriptions";
import { getModelFamily, getFamilyRank } from "../providers/modelFamily";
import {
  categoryToRole,
  ROLE_ICONS,
  ROLE_LABELS,
  ROLE_ORDER,
  type RoleId,
} from "../providers/modelRoles";
import { compareVendors, modelVendor, type Vendor } from "../providers/vendors";
import { tr } from "../i18n/tr";

interface CatalogFamily {
  id: string;
  label: string;
  icon: string;
  color: string;
  models: string[];
}

interface CatalogRole {
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

interface VendorSection {
  roleId: RoleId;
  roleLabel: string;
  roleIcon: string;
  family: CatalogFamily;
}

interface VendorGroup {
  vendor: Vendor;
  total: number;
  sections: VendorSection[];
}

export function byVendor(groups: CatalogRole[]): VendorGroup[] {
  const byKey = new Map<string, VendorGroup>();
  for (const g of groups) {
    for (const fam of g.families) {
      for (const m of fam.models) {
        const f = modelVendor(m);
        const group = byKey.get(f.key) ?? { vendor: f, total: 0, sections: [] };
        let sec = group.sections.find((s) => s.roleId === g.id && s.family.id === fam.id);
        if (!sec) {
          sec = { roleId: g.id, roleLabel: g.label, roleIcon: g.icon, family: { ...fam, models: [] } };
          group.sections.push(sec);
        }
        sec.family.models.push(m);
        group.total++;
        byKey.set(f.key, group);
      }
    }
  }
  return Array.from(byKey.values()).sort((a, b) => compareVendors(a.vendor, b.vendor));
}

export function looseByVendor(
  models: string[]
): Array<{ vendor: Vendor; models: string[] }> {
  const byKey = new Map<string, { vendor: Vendor; models: string[] }>();
  for (const m of models) {
    const f = modelVendor(m);
    const group = byKey.get(f.key) ?? { vendor: f, models: [] };
    group.models.push(m);
    byKey.set(f.key, group);
  }
  const list = Array.from(byKey.values());
  for (const g of list) g.models.sort();
  return list.sort((a, b) => compareVendors(a.vendor, b.vendor));
}
