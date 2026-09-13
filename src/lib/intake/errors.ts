import type { ManualIntakeErrorCode } from "@/lib/intake/types";

const SI_MESSAGES: Record<ManualIntakeErrorCode, string> = {
  validation_failed:
    "Preverite vnesene podatke. Zahtevana so ime, telefon ali e-pošta ter storitev ali opis težave.",
  forbidden: "Nimate dovoljenja za ročni sprejem povpraševanja.",
  ambiguous_customer:
    "Najdenih je več strank z istimi kontaktnimi podatki. Potreben je ročni pregled — ne ustvarjam nove stranke.",
  ambiguous_vehicle:
    "Najdenih je več vozil z istimi identifikatorji. Potreben je ročni pregled.",
  vehicle_ownership_conflict:
    "Vozilo je povezano z drugo stranko. Lastništva ne prenašam samodejno — potreben je ročni pregled.",
  archived_customer_match:
    "Najdena stranka je arhivirana. Potreben je ročni pregled — ne ustvarjam dvojnika.",
  archived_vehicle_match:
    "Najdeno vozilo (npr. VIN) je arhivirano. Potreben je ročni pregled — ne ustvarjam dvojnika.",
  selection_conflict:
    "Izbrana stranka ali vozilo se ne ujema z vnesenimi identifikatorji. Potreben je ročni pregled.",
  unexpected: "Shranjevanje ni uspelo. Poskusite znova ali kontaktirajte podporo.",
};

export function manualIntakeErrorMessage(
  code: ManualIntakeErrorCode | string | null | undefined,
): string {
  if (code && code in SI_MESSAGES) {
    return SI_MESSAGES[code as ManualIntakeErrorCode];
  }
  return SI_MESSAGES.unexpected;
}
