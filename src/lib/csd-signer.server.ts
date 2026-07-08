/**
 * CSD (Certificado de Sello Digital) — servidor únicamente.
 *
 * Provee:
 *  - parseCer(): lee un .cer (DER X.509) y extrae RFC, noCertificado, vigencia y base64 del cert.
 *  - loadPrivateKey(): desencripta un .key PKCS#8 encriptado con passphrase.
 *  - buildCadenaOriginal(): deriva la cadena original de un XML de Anexo 24 v1.3 sin necesidad de XSLT.
 *  - signXml(): firma la cadena original con SHA256withRSA y devuelve el XML con Sello/noCertificado/Certificado inyectados.
 *
 * NOTA: el .key del SAT viene en formato PKCS#8 DER encriptado. Node crypto (con nodejs_compat)
 *       lo abre con `createPrivateKey({ key: der, format: 'der', type: 'pkcs8', passphrase })`.
 */

import { createPrivateKey, createSign, X509Certificate } from "node:crypto";

export type CerInfo = {
  rfc: string;
  noCertificado: string;
  validFrom: Date;
  validTo: Date;
  cerBase64: string; // base64 puro (una sola línea) para atributo Certificado=""
  subject: string;
};

/** Extrae info clave del .cer. Recibe bytes crudos del .cer (DER). */
export function parseCer(cerDer: Uint8Array): CerInfo {
  const cert = new X509Certificate(Buffer.from(cerDer));
  const subject = cert.subject; // string tipo "CN=..., x500UniqueIdentifier=RFC..."
  // RFC vive en el atributo OID 2.5.4.45 (x500UniqueIdentifier). Node lo expone como
  // "x500UniqueIdentifier=RFC / CURP" en `cert.subject`. Fallback: buscar patrón RFC.
  const rfc = extractRfc(subject);
  if (!rfc) throw new Error("No se pudo extraer el RFC del .cer");

  // Serial en hex → SAT lo codifica como ASCII de dígitos (20 chars). Cada par de hex = 1 char ASCII.
  const serialHex = cert.serialNumber; // hex uppercase
  const noCertificado = Buffer.from(serialHex, "hex").toString("ascii");
  if (!/^\d{20}$/.test(noCertificado)) {
    throw new Error(`noCertificado inválido: "${noCertificado}" (esperado 20 dígitos)`);
  }

  return {
    rfc,
    noCertificado,
    validFrom: new Date(cert.validFrom),
    validTo: new Date(cert.validTo),
    cerBase64: Buffer.from(cerDer).toString("base64"),
    subject,
  };
}

function extractRfc(subject: string): string | null {
  // 1) Formato canónico node: "x500UniqueIdentifier=RFC / CURP"
  const m1 = subject.match(/x500UniqueIdentifier=([^,\n]+)/i);
  if (m1) {
    const val = m1[1].split("/")[0].trim();
    if (/^[A-ZÑ&]{3,4}\d{6}[A-Z0-9]{3}$/.test(val)) return val;
  }
  // 2) Fallback: cualquier RFC bien formado en el subject
  const m2 = subject.match(/\b([A-ZÑ&]{3,4}\d{6}[A-Z0-9]{3})\b/);
  return m2 ? m2[1] : null;
}

/** Abre el .key (PKCS#8 DER encriptado) con la contraseña. Devuelve un KeyObject de Node. */
export function loadPrivateKey(keyDer: Uint8Array, passphrase: string) {
  try {
    return createPrivateKey({
      key: Buffer.from(keyDer),
      format: "der",
      type: "pkcs8",
      passphrase,
    });
  } catch (e: any) {
    // Reintenta como PKCS#1 por si viene en otro formato
    try {
      return createPrivateKey({
        key: Buffer.from(keyDer),
        format: "der",
        type: "pkcs1",
        passphrase,
      });
    } catch {
      throw new Error("No se pudo abrir el .key — contraseña incorrecta o formato no soportado");
    }
  }
}

/**
 * Deriva la cadena original de un XML de Contabilidad Electrónica (Anexo 24 v1.3) sin XSLT.
 *
 * Regla del SAT:
 *  - La cadena empieza y termina con "||".
 *  - Se recorre el árbol en orden documental.
 *  - En cada elemento se emiten sus atributos en el orden en que aparecen en el schema (Anexo 24).
 *  - Los atributos Sello, noCertificado y Certificado se OMITEN (son los que se van a inyectar).
 *  - Valores se trimean y colapsan espacios internos.
 *  - Separador entre valores: "|". Al terminar los atributos de un elemento con hijos, se agrega "|"
 *    y se recorren los hijos; al terminar, no se agrega separador adicional.
 *
 * Esta implementación soporta los tres esquemas: CatalogoCuentas, Balanza y Polizas v1.3.
 */

const ATTR_ORDER: Record<string, string[]> = {
  // Catálogo de cuentas
  "catalogocuentas:Catalogo": ["Version", "RFC", "Mes", "Anio", "Sello", "noCertificado", "Certificado"],
  "catalogocuentas:Ctas": ["CodAgrup", "NumCta", "Desc", "SubCtaDe", "Nivel", "Natur"],

  // Balanza
  "BCE:Balanza": ["Version", "RFC", "Mes", "Anio", "TipoEnvio", "FechaModBal", "Sello", "noCertificado", "Certificado"],
  "BCE:Ctas": ["NumCta", "SaldoIni", "Debe", "Haber", "SaldoFin"],

  // Pólizas
  "PLZ:Polizas": ["Version", "RFC", "Mes", "Anio", "TipoSolicitud", "NumOrden", "NumTramite", "Sello", "noCertificado", "Certificado"],
  "PLZ:Poliza": ["NumUnIdenPol", "Fecha", "Concepto"],
  "PLZ:Transaccion": ["NumCta", "DesTrans", "Debe", "Haber"],
  "PLZ:CompNal": ["UUID_CFDI", "RFC", "MontoTotal", "Moneda", "TipCamb"],
  "PLZ:CompNalOtr": ["CFD_CBB_Serie", "CFD_CBB_NumFol", "RFC", "MontoTotal", "Moneda", "TipCamb"],
  "PLZ:CompExt": ["NumFactExt", "TaxID", "MontoTotal", "Moneda", "TipCamb"],
  "PLZ:Cheque": ["Num", "BanEmisNal", "BanEmisExt", "CtaOri", "Fecha", "Benef", "RFC", "Monto", "Moneda", "TipCamb"],
  "PLZ:Transferencia": ["CtaOri", "BancoOriNal", "BancoOriExt", "CtaDest", "BancoDestNal", "BancoDestExt", "Fecha", "Benef", "RFC", "Monto", "Moneda", "TipCamb"],
  "PLZ:OtrMetodoPago": ["MetPagoPol", "Fecha", "Benef", "RFC", "Monto", "Moneda", "TipCamb"],
};

/**
 * Parser XML ultra-ligero orientado a nuestros XML canónicos (sin CDATA, sin PIs custom).
 * NO usa DOMParser (no disponible en Cloudflare Worker). Suficiente para los XML que generamos
 * nosotros mismos.
 */
type ParsedNode = { tag: string; attrs: Record<string, string>; children: ParsedNode[] };

function parseXml(xml: string): ParsedNode {
  // remove xml declaration & comments
  const cleaned = xml
    .replace(/<\?xml[^>]*\?>/g, "")
    .replace(/<!--[\s\S]*?-->/g, "")
    .trim();

  let i = 0;
  const src = cleaned;

  function skipWs() {
    while (i < src.length && /\s/.test(src[i])) i++;
  }

  function parseElement(): ParsedNode {
    if (src[i] !== "<") throw new Error(`Se esperaba '<' en posición ${i}`);
    i++;
    // read tag name
    const start = i;
    while (i < src.length && !/[\s/>]/.test(src[i])) i++;
    const tag = src.slice(start, i);
    const attrs: Record<string, string> = {};
    // read attrs
    while (true) {
      skipWs();
      if (src[i] === "/" || src[i] === ">") break;
      const nameStart = i;
      while (i < src.length && src[i] !== "=" && !/\s/.test(src[i])) i++;
      const name = src.slice(nameStart, i);
      skipWs();
      if (src[i] !== "=") { attrs[name] = ""; continue; }
      i++; // skip =
      skipWs();
      const quote = src[i];
      if (quote !== '"' && quote !== "'") throw new Error("Atributo sin comillas");
      i++;
      const vStart = i;
      while (i < src.length && src[i] !== quote) i++;
      const rawVal = src.slice(vStart, i);
      i++; // closing quote
      attrs[name] = xmlUnescape(rawVal);
    }

    const node: ParsedNode = { tag, attrs, children: [] };
    if (src[i] === "/") {
      i += 2; // skip />
      return node;
    }
    i++; // skip >

    // children
    while (i < src.length) {
      skipWs();
      if (src.startsWith("</", i)) {
        // closing tag
        i += 2;
        while (i < src.length && src[i] !== ">") i++;
        i++;
        return node;
      }
      if (src[i] === "<") {
        node.children.push(parseElement());
      } else {
        // text content: skip (no lo usamos para cadena original en Anexo 24)
        while (i < src.length && src[i] !== "<") i++;
      }
    }
    return node;
  }

  return parseElement();
}

function xmlUnescape(s: string): string {
  return s
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'");
}

function normalize(v: string): string {
  return v.replace(/\s+/g, " ").trim();
}

function emitNode(n: ParsedNode, out: string[]) {
  const order = ATTR_ORDER[n.tag];
  const skip = new Set(["Sello", "noCertificado", "Certificado"]);
  if (order) {
    for (const name of order) {
      if (skip.has(name)) continue;
      const val = n.attrs[name];
      if (val !== undefined && val !== "") {
        out.push(normalize(val));
      }
    }
  } else {
    // desconocido: emitimos atributos en orden de aparición
    for (const [name, val] of Object.entries(n.attrs)) {
      if (skip.has(name)) continue;
      if (val !== "") out.push(normalize(val));
    }
  }
  for (const c of n.children) emitNode(c, out);
}

export function buildCadenaOriginal(xml: string): string {
  const root = parseXml(xml);
  const parts: string[] = [];
  emitNode(root, parts);
  return `||${parts.join("|")}||`;
}

/**
 * Firma un XML de Contabilidad Electrónica: calcula la cadena original, firma con SHA256/RSA,
 * y devuelve el XML con los atributos Sello, noCertificado y Certificado inyectados en el
 * elemento raíz.
 */
export function signXml(xml: string, cerInfo: CerInfo, privateKey: ReturnType<typeof loadPrivateKey>): string {
  const cadena = buildCadenaOriginal(xml);
  const signer = createSign("RSA-SHA256");
  signer.update(cadena, "utf8");
  signer.end();
  const sello = signer.sign(privateKey).toString("base64");

  // Inyecta atributos en el elemento raíz (primer tag después de la declaración).
  // Reemplazamos ocurrencias existentes o insertamos antes del `>` o `/>`.
  const inject = ` Sello="${sello}" noCertificado="${cerInfo.noCertificado}" Certificado="${cerInfo.cerBase64}"`;

  const rootMatch = xml.match(/<(catalogocuentas:Catalogo|BCE:Balanza|PLZ:Polizas)([^>]*)>/);
  if (!rootMatch) throw new Error("Elemento raíz de Anexo 24 no encontrado en el XML");

  const [full, tag, attrsPart] = rootMatch;
  // remove any existing Sello/noCertificado/Certificado
  const cleanAttrs = attrsPart
    .replace(/\s+Sello="[^"]*"/g, "")
    .replace(/\s+noCertificado="[^"]*"/g, "")
    .replace(/\s+Certificado="[^"]*"/g, "");
  const replaced = `<${tag}${cleanAttrs}${inject}>`;
  return xml.replace(full, replaced);
}
