"use client";

import { motion } from "framer-motion";

const blobs = [
  {
    className: "-left-1/4 -top-1/4 h-[60vmax] w-[60vmax] bg-indigo-600",
    animate: { x: ["0%", "20%", "5%", "0%"], y: ["0%", "15%", "30%", "0%"] },
    duration: 40,
  },
  {
    className: "-right-1/4 top-1/4 h-[50vmax] w-[50vmax] bg-teal-400",
    animate: {
      x: ["0%", "-25%", "-10%", "0%"],
      y: ["0%", "20%", "-10%", "0%"],
    },
    duration: 48,
  },
  {
    className: "-bottom-1/3 left-1/4 h-[55vmax] w-[55vmax] bg-purple-600",
    animate: { x: ["0%", "15%", "-20%", "0%"], y: ["0%", "-20%", "-5%", "0%"] },
    duration: 56,
  },
];

export function MeshGradientBackground() {
  return (
    <div
      aria-hidden
      className="pointer-events-none fixed inset-0 -z-10 overflow-hidden bg-zinc-950"
    >
      {blobs.map((blob, i) => (
        <motion.div
          key={i}
          className={`absolute rounded-full opacity-20 blur-3xl will-change-transform ${blob.className}`}
          animate={blob.animate}
          transition={{
            duration: blob.duration,
            repeat: Infinity,
            ease: "easeInOut",
          }}
        />
      ))}
      <div className="bg-noise absolute inset-0" />
    </div>
  );
}
