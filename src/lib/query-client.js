import { QueryClient } from '@tanstack/react-query';


export const queryClientInstance = new QueryClient({
	defaultOptions: {
		queries: {
			refetchOnWindowFocus: false,
			retry: 1,
			// Treat data as fresh for 60s so remounts/navigations don't re-run a full
			// Firestore read every time. Mutations still invalidate to force a refetch,
			// so the user's own writes appear immediately.
			staleTime: 60_000,
			gcTime: 10 * 60_000,
		},
	},
});