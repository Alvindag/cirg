import type {
  AppNotification,
  Customer,
  ProductEngagement,
  SalesDashboard,
} from "./types";

// Sample data shown until the dashboard is connected to a DAS Engage 360 API.

export const demoSales: SalesDashboard = {
  callsCompleted: 428,
  plannedVisits: 510,
  planAdherencePct: 83.9,
  coveragePct: 71.2,
  byRep: [
    { repId: "r1", calls: 190, uniqueCustomers: 74, outsideGeofence: 3 },
    { repId: "r2", calls: 238, uniqueCustomers: 91, outsideGeofence: 1 },
  ],
};

export const demoProducts: ProductEngagement[] = [
  { productId: "p1", name: "Cardiolex", calls: 120, sampleUnits: 340 },
  { productId: "p2", name: "Respira", calls: 96, sampleUnits: 210 },
  { productId: "p3", name: "Gastrofix", calls: 72, sampleUnits: 150 },
  { productId: "p4", name: "Dermacalm", calls: 48, sampleUnits: 90 },
  { productId: "p5", name: "Neurovant", calls: 34, sampleUnits: 60 },
];

export const demoNotifications: AppNotification[] = [
  {
    id: "n1",
    kind: "email",
    title: "Email sent to Acme Corp",
    body: "Follow-up on the Q4 proposal",
    createdAt: "",
    readAt: null,
  },
  {
    id: "n2",
    kind: "call",
    title: "Call logged",
    body: "Discovery call with Globex, 24 min",
    createdAt: "",
    readAt: null,
  },
  {
    id: "n3",
    kind: "document",
    title: "Proposal updated",
    body: "Initech, v3 with revised pricing",
    createdAt: "",
    readAt: null,
  },
  {
    id: "n4",
    kind: "deal",
    title: "Deal moved to Negotiation",
    body: "Umbrella Labs, $48k",
    createdAt: "",
    readAt: null,
  },
  {
    id: "n5",
    kind: "meeting",
    title: "Meeting scheduled",
    body: "Northwind demo, Thursday 2:00 PM",
    createdAt: "",
    readAt: null,
  },
];

export const demoCustomers: Pick<
  Customer,
  "id" | "name" | "city" | "segment"
>[] = [
  { id: "c1", name: "Ava Thompson", city: "Accra", segment: "A" },
  { id: "c2", name: "Liam Chen", city: "Kumasi", segment: "B" },
  { id: "c3", name: "Sofia Martinez", city: "Tamale", segment: "A" },
  { id: "c4", name: "Noah Patel", city: "Takoradi", segment: "C" },
];

export const demoInsight = {
  headline: "85%",
  text: "Acme Corp has a 85% chance of closing this week based on recent email sentiment.",
};
