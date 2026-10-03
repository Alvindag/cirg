/** Total cost of ownership for a field-tool or channel option (RTM review: financial implication analysis). */

export interface TcoInputs {
  years: number;
  reps: number;
  /** Visits per rep per month, used for cost per visit. */
  visitsPerRepPerMonth: number;
  deviceCost: number;
  deviceLifeYears: number;
  /** Per device per year: MDM licence, security, insurance. */
  deviceRunningPerYear: number;
  dataPlanPerRepPerMonth: number;
  licencePerUserPerMonth: number;
  hostingPerMonth: number;
  integrationOneOff: number;
  integrationSupportPerYear: number;
  trainingPerRepOneOff: number;
  supportPerYear: number;
  /** Extra spare devices as a share of reps, e.g. 0.1 = 10%. */
  spareDevicePct: number;
}

export interface TcoResult {
  oneOff: number;
  recurringPerYear: number;
  deviceRefresh: number;
  total: number;
  perYear: number;
  perRepPerYear: number;
  perVisit: number;
  breakdown: { label: string; amount: number }[];
}

export const defaultTco: TcoInputs = {
  years: 5,
  reps: 40,
  visitsPerRepPerMonth: 180,
  deviceCost: 250,
  deviceLifeYears: 3,
  deviceRunningPerYear: 30,
  dataPlanPerRepPerMonth: 8,
  licencePerUserPerMonth: 12,
  hostingPerMonth: 600,
  integrationOneOff: 15000,
  integrationSupportPerYear: 4000,
  trainingPerRepOneOff: 80,
  supportPerYear: 9000,
  spareDevicePct: 0.1,
};

export function computeTco(i: TcoInputs): TcoResult {
  const devices = Math.ceil(i.reps * (1 + i.spareDevicePct));
  // Devices bought up front, then replaced each time they reach end of life inside the horizon.
  const purchases = Math.max(1, Math.ceil(i.years / Math.max(1, i.deviceLifeYears)));
  const deviceInitial = devices * i.deviceCost;
  const deviceRefresh = (purchases - 1) * devices * i.deviceCost;
  const oneOff = deviceInitial + i.integrationOneOff + i.trainingPerRepOneOff * i.reps;
  const recurringPerYear =
    devices * i.deviceRunningPerYear +
    i.reps * (i.dataPlanPerRepPerMonth + i.licencePerUserPerMonth) * 12 +
    i.hostingPerMonth * 12 +
    i.integrationSupportPerYear +
    i.supportPerYear;
  const total = oneOff + deviceRefresh + recurringPerYear * i.years;
  const visits = i.reps * i.visitsPerRepPerMonth * 12 * i.years;
  return {
    oneOff,
    recurringPerYear,
    deviceRefresh,
    total,
    perYear: total / i.years,
    perRepPerYear: i.reps ? total / i.years / i.reps : 0,
    perVisit: visits ? total / visits : 0,
    breakdown: [
      { label: "Devices (initial)", amount: deviceInitial },
      { label: "Device refresh", amount: deviceRefresh },
      { label: "Device running costs", amount: devices * i.deviceRunningPerYear * i.years },
      { label: "Data plans and licences", amount: i.reps * (i.dataPlanPerRepPerMonth + i.licencePerUserPerMonth) * 12 * i.years },
      { label: "Cloud hosting", amount: i.hostingPerMonth * 12 * i.years },
      { label: "Integration (build and support)", amount: i.integrationOneOff + i.integrationSupportPerYear * i.years },
      { label: "Training", amount: i.trainingPerRepOneOff * i.reps },
      { label: "Support", amount: i.supportPerYear * i.years },
    ],
  };
}
