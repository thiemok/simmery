import { screen } from '@testing-library/react';
import { callsTo, renderApp } from '../test/fake-api';

it('saves the taste profile and shows when it was saved', async () => {
  const { user, calls } = await renderApp('/profile', {
    'GET /taste-profile': { body: { body: 'Likes spicy food.', updatedAt: null } },
    'PUT /taste-profile': (call: { body: unknown }) => ({
      body: { ...(call.body as object), updatedAt: '2026-10-28T09:30:00.000Z' },
    }),
  });
  const text = await screen.findByLabelText('What you like, avoid and want more of');
  expect(screen.getByText('Not saved yet')).toBeInTheDocument();
  await user.type(text, ' No mushrooms.');
  await user.click(screen.getByRole('button', { name: 'Save profile' }));

  expect(await screen.findByText(/^Last saved/)).toBeInTheDocument();
  expect(callsTo(calls, 'PUT', '/taste-profile')[0].body).toEqual({
    body: 'Likes spicy food. No mushrooms.',
  });
});
