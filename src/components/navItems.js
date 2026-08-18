import { CalendarDays, ListTodo, Wallet, Sparkles, Settings } from "lucide-react";

// Single source of truth for primary navigation, shared by the mobile bottom tab
// bar and the desktop side rail so they never drift.
export const NAV_ITEMS = [
  { label: "Calendar", icon: CalendarDays, page: "Dashboard" },
  { label: "Tasks",    icon: ListTodo,     page: "Tasks" },
  { label: "Money",    icon: Wallet,       page: "Money" },
  { label: "Donna",    icon: Sparkles,     page: "Donna" },
  { label: "Settings", icon: Settings,     page: "Settings" },
];
