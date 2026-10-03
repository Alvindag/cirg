"use client";

import { motion } from "framer-motion";
import {
  Bell,
  CalendarCheck,
  FileText,
  Handshake,
  Mail,
  PhoneCall,
  type LucideIcon,
} from "lucide-react";

import { demoNotifications } from "@/lib/das/demo";
import type { AppNotification } from "@/lib/das/types";
import { useDasQuery } from "@/lib/das/useDasQuery";
import { SourceBadge } from "./SourceBadge";
import { Widget } from "./Widget";

const demoTimes: Record<string, string> = {
  n1: "12 min ago",
  n2: "1 hr ago",
  n3: "3 hrs ago",
  n4: "Yesterday",
  n5: "Yesterday",
};

const kindIcons: Record<string, LucideIcon> = {
  email: Mail,
  call: PhoneCall,
  document: FileText,
  deal: Handshake,
  meeting: CalendarCheck,
};

const dateTime = new Intl.DateTimeFormat("en-GB", {
  day: "numeric",
  month: "short",
  hour: "2-digit",
  minute: "2-digit",
});

const liVariants = { rest: { x: 0 }, hover: { x: 4 } };
const highlightVariants = { rest: { opacity: 0 }, hover: { opacity: 1 } };

export function ActivityTimeline() {
  const q = useDasQuery<AppNotification[]>("/notifications");
  const items = (q.data ?? demoNotifications).slice(0, 6).map((n) => ({
    id: n.id,
    icon: kindIcons[n.kind.toLowerCase()] ?? Bell,
    title: n.title,
    detail: n.body ?? "",
    time: q.live
      ? dateTime.format(new Date(n.createdAt))
      : (demoTimes[n.id] ?? ""),
  }));

  return (
    <Widget title="Recent Activity" action={<SourceBadge live={q.live} />}>
      {items.length === 0 && (
        <p className="py-6 text-center text-sm text-zinc-400">
          No notices yet.
        </p>
      )}
      <div className="relative">
        <span
          aria-hidden
          className="absolute bottom-4 left-4 top-4 w-px bg-white/10"
        />
        <ol className="relative flex flex-col gap-2">
          {items.map(({ id, icon: Icon, title, detail, time }) => (
            <motion.li
              key={id}
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
