// Shared failure handler for Money writes.
//
// Every mutation in this section used to end in `.catch(() => {})`, which
// swallowed the error and left the UI looking exactly as though the change had
// saved — the row moved, the modal closed, and nothing had actually been
// written. #97 replaced those with toasts on the old single-page Money screen;
// the six-view redesign reintroduced the pattern, so it lives here now as one
// handler the whole section shares.
//
// Usage: `await base44.entities.Goal.update(id, data).catch(writeFailed);`
import { toast } from "@/components/ui/use-toast";

export function writeFailed(err) {
  // Reads are owner-scoped, so the usual cause of a write failure is the
  // Firestore rules for a collection not being published yet. Say so, because
  // "try again" is the wrong advice when retrying cannot help.
  const denied = /permission|insufficient|PERMISSION_DENIED/i.test(String(err?.message || err));
  toast({
    variant: "destructive",
    title: denied ? "Not allowed to save that." : "Couldn't save — try again.",
    description: denied
      ? "Your Firestore rules don't cover this collection yet."
      : undefined,
  });
  return null;
}
