import React from "react";
import { motion } from "framer-motion";

export default function StatCard({ title, value, subtitle, icon: Icon, accentColor = "amber" }) {
  const colorMap = {
    amber: "from-amber-500/10 to-amber-500/5 text-amber-600 border-amber-200/50",
    emerald: "from-emerald-500/10 to-emerald-500/5 text-emerald-600 border-emerald-200/50",
    violet: "from-violet-500/10 to-violet-500/5 text-violet-600 border-violet-200/50",
    sky: "from-sky-500/10 to-sky-500/5 text-sky-600 border-sky-200/50",
    rose: "from-rose-500/10 to-rose-500/5 text-rose-600 border-rose-200/50",
  };

  const iconBgMap = {
    amber: "bg-amber-100 text-amber-600",
    emerald: "bg-emerald-100 text-emerald-600",
    violet: "bg-violet-100 text-violet-600",
    sky: "bg-sky-100 text-sky-600",
    rose: "bg-rose-100 text-rose-600",
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4 }}
      className={`relative overflow-hidden rounded-2xl border bg-gradient-to-br ${colorMap[accentColor]} p-5`}
    >
      <div className="flex items-start justify-between">
        <div className="space-y-1">
          <p className="text-xs font-medium uppercase tracking-wider text-gray-500">{title}</p>
          <p className="text-3xl font-bold text-gray-900">{value}</p>
          {subtitle && <p className="text-xs text-gray-500 mt-1">{subtitle}</p>}
        </div>
        <div className={`rounded-xl p-2.5 ${iconBgMap[accentColor]}`}>
          <Icon className="h-5 w-5" />
        </div>
      </div>
    </motion.div>
  );
}