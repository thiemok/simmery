import { screen } from '@testing-library/react';
import { renderApp } from '../test/fake-api';

it('shows a duplicate name conflict on the name field', async () => {
  const { user } = await renderApp('/catalog/new', {
    'POST /ingredients': { status: 409, body: { error: 'conflict', reason: 'duplicate_name' } },
  });
  await user.type(await screen.findByLabelText('Name'), 'garlic');
  await user.type(screen.getByLabelText('Canonical unit'), 'clove');
  await user.click(screen.getByRole('button', { name: 'Save ingredient' }));

  await screen.findByText('An ingredient with this name already exists.');
  expect(screen.getByLabelText('Name')).toHaveAccessibleDescription(
    'An ingredient with this name already exists.',
  );
});
