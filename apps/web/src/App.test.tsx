import { screen, waitFor } from '@testing-library/react';
import { renderApp } from './test/fake-api';

it('sends the browser to sign-in when a signed-in query answers 401', async () => {
  const { onUnauthenticated } = await renderApp('/recipes', {
    'GET /me': { status: 401, body: { error: 'unauthenticated' } },
  });
  await waitFor(() => expect(onUnauthenticated).toHaveBeenCalled());
  expect(screen.getByText('Signing you in…')).toBeInTheDocument();
});

it('redirects the home page to the current ISO week', async () => {
  const { router } = await renderApp('/', { 'GET /weeks/:any': {} });
  expect(router.state.location.pathname).toMatch(/^\/week\/\d{4}-W\d{2}$/);
});
