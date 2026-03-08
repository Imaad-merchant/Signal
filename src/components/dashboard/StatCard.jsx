import React from "react";
import { motion } from "framer-motion";

export default function StatCard({ title, value, subtitle, icon: Icon, accentColor = "amber" }) {
  const colorMap = {
    amber: "from-amber-500/20 to-amber-500/5 border-amber-500/20",
    emerald: "from-emerald-500/20 to-emerald-500/5 border-emerald-500/20",
    violet: "from-violet-500/20 to-violet-500/5 border-violet-500/20",
    sky: "from-sky-500/20 to-sky-500/5 border-sky-500/20",
    rose: "from-rose-500/20 to-rose-500/5 border-rose-500/20",
  };

  const iconColorMap = {
    amber: "text-amber-400",
    emerald: "text-emerald-400",
    violet: "text-violet-400",
    sky: "text-sky-400",
    rose: "text-rose-400",
  };

  const iconBgMap = {
    amber: "bg-amber-500/20 text-amber-400",
    emerald: "bg-emerald-500/20 text-emerald-400",
    violet: "bg-violet-500/20 text-violet-400",
    sky: "bg-sky-500/20 text-sky-400",
    rose: "bg-rose-500/20 text-rose-400",
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4 }}
      className={`relative overflow-hidden rounded-2xl border bg-gradient-to-br ${colorMap[accentColor]} bg-[#2d2e30] p-5`}
    >
      <div className="flex items-start justify-between">
        <div className="space-y-1">
          <p className="text-xs font-medium uppercase tracking-wider text-gray-400">{title}</p>
          <p className="text-3xl font-bold text-gray-100">{value}</p>
          {subtitle && <p className="text-xs text-gray-400 mt-1">{subtitle}</p>}
        </div>
        <div className={`rounded-xl p-2.5 ${iconBgMap[accentColor]}`}>
          <Icon className="h-5 w-5" />
        </div>
      </div>
    </motion.div>
  );
}