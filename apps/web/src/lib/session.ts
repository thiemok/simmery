/** The server's sign-in route, which returns to `returnTo` afterwards (U7). */
export const signInUrl = (returnTo: string) =>
  `/auth/login?returnTo=${encodeURIComponent(returnTo)}`;
