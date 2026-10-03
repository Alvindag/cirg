"use client";

import { motion } from "framer-motion";
import {
  CalendarCheck,
  FileText,
  Handshake,
  Mail,
  PhoneCall,
  type LucideIcon,
} from "lucide-react";

import { GlassPanel } from "@/components/ui/glass-panel";

// Mock data until activity is backed by a real source.
const activity: {
  icon: LucideIcon;
  title: string;
  detail: string;
  time: string;
}[] = [
  { icon: Mail, title: "Email sent to Acme Corp", detail: "Follow-up on the Q4 proposal", time: "12 min ago" },
  { icon: PhoneCall, title: "Call logged", detail: "Discovery call with Globex, 24 min", time: "1 hr ago" },
  { icon: FileText, title: "Proposal updated", detail: "Initech, v3 with revised pricing", time: "3 hrs ago" },
  { icon: Handshake, title: "Deal moved to Negotiation", detail: "Umbrella Labs, $48k", time: "Yesterday" },
  { icon: CalendarCheck, title: "Meeting scheduled", detail: "Northwind demo, Thursday 2:00 PM", time: "Yesterday" },
];

export function ActivityTimeline() {
  return (
    <GlassPanel className="h-full rounded-2xl p-5">
      <h2 className="mb-4 text-sm font-medium text-zinc-300">
        Recent Activity
      </h2>
      <ol className="relative flex flex-col gap-2">
        <span
          aria-hidden
          className="absolute bottom-2 left-4 top-2 w-px bg-white/10"
        />
        {activity.map(({ icon: Icon, title, detail, time }) => (
          <motion.li
            key={title}
            className="relative -mx-2 flex items-start gap-4 rounded-lg px-2 py-1.5"
            whileHover={{ x: 4, backgroundColor: "rgba(255,255,255,0.1)" }}
            transition={{ duration: 0.2, ease: "easeOut" }}
          >
            <span className="relative z-10 flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-white/10 bg-zinc-900">
              <Icon className="h-4 w-4 text-zinc-400" />
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-sm text-zinc-200">{title}</p>
              <p className="truncate text-xs text-zinc-500">{detail}</p>
            </div>
            <span className="shrink-0 text-xs text-zinc-500">{time}</span>
          </motion.li>
        ))}
      </ol>
    </GlassPanel>
  );
}
