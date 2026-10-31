import { screen, within } from '@testing-library/react';
import { renderApp } from '../test/fake-api';

const empty = { recipes: [], notCookedRecently: [], cooks: [], weeks: [], mostBought: [] };

const recipeStats = (
  recipeId: string,
  title: string,
  cookCount: number,
  averageRating: number | null,
) => ({
  recipeId,
  title,
  archived: false,
  cookCount,
  lastCookedAt: '2026-10-20T18:00:00.000Z',
  averageRating,
});

describe('statistics', () => {
  it('shows an empty state per section when nothing was cooked', async () => {
    await renderApp('/stats', { 'GET /statistics': empty });
    expect(await screen.findByText('Nothing cooked yet.')).toBeInTheDocument();
    expect(screen.getByText('No ratings yet.')).toBeInTheDocument();
    expect(screen.getAllByText('No planned weeks yet.')).toHaveLength(2);
  });

  it('lists recipes in the order the API returns them', async () => {
    await renderApp('/stats', {
      'GET /statistics': {
        ...empty,
        recipes: [recipeStats('r2', 'Curry', 3, 4.5), recipeStats('r1', 'Pasta', 1, null)],
      },
    });
    const history = (await screen.findByRole('heading', { name: 'Cook history' })).closest(
      'section',
    ) as HTMLElement;
    const links = within(history)
      .getAllByRole('link')
      .map((link) => link.textContent);
    expect(links).toEqual(['Curry', 'Pasta']);
    expect(within(history).getByText('4.5 ★')).toBeInTheDocument();
  });
});
