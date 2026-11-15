export const intakeFieldLabels: Record<string, string> = {
  phone: 'telefonska številka', email: 'e-poštni naslov', vin: 'VIN vozila',
  registration: 'registrska oznaka', make: 'znamka vozila', model: 'model vozila',
  mileage: 'število prevoženih kilometrov', year: 'letnik vozila',
};

/** A deterministic draft, never a delivery action or an AI claim. */
export function completionMessage(fields: string[], policy: 'manual' | 'web' = 'web', url?: string): string {
  const unique = [...new Set(fields)];
  const eitherContact = policy === 'manual' && unique.includes('phone') && unique.includes('email');
  const labels = unique.filter(field => !(eitherContact && ['phone', 'email'].includes(field)))
    .map(field => intakeFieldLabels[field] ?? 'dodatni podatek, označen v obrazcu');
  if (eitherContact) labels.unshift('telefonska številka ali e-poštni naslov');
  const items = [...new Set(labels)];
  return ['Pozdravljeni,', '', items.length
    ? `Za nadaljevanje vašega servisnega povpraševanja potrebujemo še: ${items.join(', ')}.`
    : 'Prosimo, preverite in dopolnite označene podatke svojega servisnega povpraševanja.',
    url ? `Podatke varno dopolnite tukaj: ${url}` : 'Povezavo za varno dopolnitev bomo dodali pred pošiljanjem.',
    'Dopolnitev se shrani v isto povpraševanje; novega ni treba oddati.', '', 'Lep pozdrav, Avtoservis Selan'].join('\n');
}
