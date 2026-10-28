import { screen, waitFor } from '@testing-library/react';
import { callsTo, ingredient, renderApp, type Call } from '../test/fake-api';

const shared = {
  title: 'Garlic bread',
  servings: 2,
  sourceUrl: null,
  lines: [
    { ingredientName: 'Knoblauch', amount: 3, unit: 'clove', note: null },
    { ingredientName: 'butter', amount: 50, unit: 'g', note: null },
  ],
  steps: ['Mix.', 'Bake.'],
  tags: ['bread'],
};

const signedOut = { status: 401, body: { error: 'unauthenticated' } };

describe('share view', () => {
  it('Covers AE5 (web side). Shows that a revoked link is no longer shared', async () => {
    await renderApp('/s/tok', {
      'GET /me': signedOut,
      'GET /share/tok': { status: 410, body: { error: 'no_longer_shared' } },
    });
    expect(await screen.findByRole('heading', { name: 'No longer shared' })).toBeInTheDocument();
  });

  it('renders for a signed-out visitor and offers sign-in back to the link, without redirecting', async () => {
    const { onUnauthenticated } = await renderApp('/s/tok', {
      'GET /me': signedOut,
      'GET /share/tok': shared,
    });
    expect(await screen.findByRole('heading', { name: 'Garlic bread' })).toBeInTheDocument();
    expect(screen.getByText('Bake.')).toBeInTheDocument();
    expect(await screen.findByRole('link', { name: 'Sign in to import' })).toHaveAttribute(
      'href',
      '/auth/login?returnTo=%2Fs%2Ftok',
    );
    expect(onUnauthenticated).not.toHaveBeenCalled();
  });

  it('suggests alias matches, flags an unresolvable unit and posts one mapping per line', async () => {
    const garlic = ingredient({
      id: 'ing-garlic',
      name: 'garlic',
      aliases: ['knoblauch'],
      canonicalUnit: 'clove',
    });
    const butter = ingredient({ id: 'ing-butter', name: 'butter', canonicalUnit: 'piece' });
    const catalog = (call: Call) => {
      const query = call.query.get('query')?.toLowerCase() ?? '';
      return [garlic, butter].filter((item) =>
        [item.name, ...item.aliases].some((name) => name.includes(query)),
      );
    };
    const { user, calls } = await renderApp('/s/tok', {
      'GET /share/tok': shared,
      'GET /ingredients': catalog,
      'POST /share/tok/import': { status: 201, body: { id: 'r-new' } },
      'GET /recipes/r-new': { status: 404, body: { error: 'not_found' } },
    });

    await user.click(await screen.findByRole('button', { name: 'Import' }));
    await waitFor(() =>
      expect(screen.getByRole('combobox', { name: 'Ingredient, line 1' })).toHaveValue('garlic'),
    );
    await waitFor(() =>
      expect(screen.getByRole('combobox', { name: 'Ingredient, line 2' })).toHaveValue('butter'),
    );

    expect(screen.getByText(/“g” cannot be turned into piece for butter/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Import recipe' })).toBeDisabled();

    await user.click(screen.getByRole('button', { name: 'Convert' }));
    await user.type(screen.getByLabelText('Amount in piece'), '1');
    await user.click(screen.getByRole('button', { name: 'Use 1 piece' }));
    await user.click(screen.getByRole('button', { name: 'Import recipe' }));

    await waitFor(() => expect(callsTo(calls, 'POST', '/share/tok/import')).toHaveLength(1));
    expect(callsTo(calls, 'POST', '/share/tok/import')[0].body).toEqual({
      lines: [
        { ingredientId: 'ing-garlic' },
        { ingredientId: 'ing-butter', amount: 1, unit: 'piece' },
      ],
    });
  });
});
