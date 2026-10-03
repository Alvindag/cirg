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

import { Widget } from "./Widget";

// Mock data until activity is backed by a real source.
const activity: {
  icon: LucideIcon;
  title: string;
  detail: string;
  time: string;
}[] = [
  {
    icon: Mail,
    title: "Email sent to Acme Corp",
    detail: "Follow-up on the Q4 proposal",
    time: "12 min ago",
  },
  {
    icon: PhoneCall,
    title: "Call logged",
    detail: "Discovery call with Globex, 24 min",
    time: "1 hr ago",
  },
  {
    icon: FileText,
    title: "Proposal updated",
    detail: "Initech, v3 with revised pricing",
    time: "3 hrs ago",
  },
  {
    icon: Handshake,
    title: "Deal moved to Negotiation",
    detail: "Umbrella Labs, $48k",
    time: "Yesterday",
  },
  {
    icon: CalendarCheck,
    title: "Meeting scheduled",
    detail: "Northwind demo, Thursday 2:00 PM",
    time: "Yesterday",
  },
];

const liVariants = { rest: { x: 0 }, hover: { x: 4 } };
const highlightVariants = { rest: { opacity: 0 }, hover: { opacity: 1 } };

export function ActivityTimeline() {
  return (
    <Widget title="Recent Activity">
      <div className="relative">
        <span
          aria-hidden
          className="absolute bottom-4 left-4 top-4 w-px bg-white/10"
        />
        <ol className="relative flex flex-col gap-2">
          {activity.map(({ icon: Icon, title, detail, time }) => (
            <motion.li
              key={title}
              className="relative -mx-2 flex items-start gap-4 px-2 py-1.5"
              variants={liVariants}
              initial="rest"
              whileHover="hover"
              transition={{ duration: 0.2, ease: "easeOut" }}
            >
              {/* bg-white/10 highlight fades via opacity (no paint-heavy color tween). */}
              <motion.span
                aria-hidden
                className="absolute inset-0 rounded-lg bg-white/10"
                variants={highlightVariants}
              />
              <span className="relative flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-white/10 bg-zinc-900">
                <Icon className="h-4 w-4 text-zinc-400" aria-hidden />
              </span>
              <div className="relative min-w-0 flex-1">
                <p className="text-sm text-zinc-200">{title}</p>
                <p className="truncate text-xs text-zinc-400">{detail}</p>
              </div>
              <span className="relative shrink-0 text-xs text-zinc-400">
                {time}
              </span>
            </motion.li>
          ))}
        </ol>
      </div>
    </Widget>
  );
}
