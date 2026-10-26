import type {IntakeCustomerCandidate} from './types.ts';
const key = (value: string) => value.replace(/[^a-z0-9]/gi, '').toLowerCase();
export function intakeVehicleSelection(customer: IntakeCustomerCandidate, query: string) {
 const exact = customer.vehicles.filter(v => key(query) && [v.registrationCurrent, v.vin].some(value => value && key(value) === key(query)));
 return exact.length === 1 ? exact[0] : customer.vehicles.length === 1 ? customer.vehicles[0] : null;
}
