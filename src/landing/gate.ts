// ---------------------------------------------------------------------------
// VIGÍA · control de acceso a la consola (v0.12)
// Gate deliberadamente del lado cliente para un sitio estático: la página
// pública es un brief del producto y la consola se abre tras un formulario de
// contacto o con una clave de demo. NO es seguridad criptográfica (el bundle
// es público en un repositorio abierto): es una barrera de cortesía y captura
// de interés, coherente con un producto demo. La clave se define en un único
// punto y se comparte con quien se quiera.
// ---------------------------------------------------------------------------

export const ACCESS_KEY = "VIGIA-2026";

const LS_KEY = "vigia_access_v1";

export interface AccessGrant {
  via: "form" | "key";
  name?: string;
  email?: string;
  company?: string;
  role?: string;
  ts: number;
}

export function getGrant(): AccessGrant | null {
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (!raw) return null;
    const g = JSON.parse(raw) as AccessGrant;
    if (!g || (g.via !== "form" && g.via !== "key") || typeof g.ts !== "number") return null;
    return g;
  } catch {
    return null;
  }
}

export function grantAccess(a: AccessGrant) {
  try {
    localStorage.setItem(LS_KEY, JSON.stringify(a));
  } catch {
    /* almacenamiento no disponible: el acceso dura la sesión actual */
  }
}

export function clearGrant() {
  try {
    localStorage.removeItem(LS_KEY);
  } catch {
    /* ignorar */
  }
}

/** Comparación tolerante: mayúsculas, espacios y guiones. */
export function checkKey(input: string): boolean {
  const norm = input.trim().toUpperCase().replace(/[\s-]+/g, "");
  return norm === ACCESS_KEY.replace(/[\s-]+/g, "");
}

/** Registro local de solicitudes de acceso (exportable por el operador). */
export interface LeadRecord extends AccessGrant {}

const LS_LEADS = "vigia_leads_v1";

export function appendLead(l: LeadRecord) {
  try {
    const raw = localStorage.getItem(LS_LEADS);
    const arr = raw ? (JSON.parse(raw) as LeadRecord[]) : [];
    arr.push(l);
    localStorage.setItem(LS_LEADS, JSON.stringify(arr.slice(-200)));
  } catch {
    /* ignorar */
  }
}

export function readLeads(): LeadRecord[] {
  try {
    const raw = localStorage.getItem(LS_LEADS);
    return raw ? (JSON.parse(raw) as LeadRecord[]) : [];
  } catch {
    return [];
  }
}
