import { screen, waitFor, within } from '@testing-library/react';
import { callsTo, renderApp } from '../test/fake-api';

const line = (name: string, amount: number, unit: string) => ({
  ingredientId: `ing-${name}`,
  ingredientName: name,
  amount,
  unit,
  canonicalAmount: amount,
  canonicalUnit: unit,
  note: null,
});

/** A 2-serving recipe scaled by the server to the entry's 4 servings. */
const cookView = {
  entry: { id: 'e1', weekKey: '2026-W44', servings: 4, day: null },
  recipe: {
    id: 'r1',
    title: 'Pasta',
    servings: 4,
    sourceUrl: null,
    archivedAt: null,
    imported: false,
    lines: [line('pasta', 400, 'g'), line('garlic', 4, 'clove')],
    steps: ['Boil water.', 'Cook the pasta.', 'Toss with garlic.'],
    tags: [],
    createdAt: '2026-10-01T10:00:00.000Z',
    updatedAt: '2026-10-01T10:00:00.000Z',
  },
  cookEvents: [] as { id: string; cookedAt: string; rating: number | null }[],
};

describe('cook view', () => {
  it('shows the scaled amounts and advances one step at a time, or lists them all', async () => {
    const { user } = await renderApp('/cook/e1', { 'GET /plan-entries/e1/cook-view': cookView });

    const ingredients = (await screen.findByRole('heading', { name: 'Ingredients' })).closest(
      'section',
    ) as HTMLElement;
    expect(within(ingredients).getByText('400 g')).toBeInTheDocument();
    expect(within(ingredients).getByText('4 clove')).toBeInTheDocument();

    expect(screen.getByText('Step 1 of 3')).toBeInTheDocument();
    expect(screen.getByText('Boil water.')).toBeInTheDocument();
    expect(screen.queryByText('Cook the pasta.')).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Next step' }));
    expect(screen.getByText('Step 2 of 3')).toBeInTheDocument();
    expect(screen.getByText('Cook the pasta.')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'All steps' }));
    expect(screen.getByText('Boil water.')).toBeInTheDocument();
    expect(screen.getByText('Toss with garlic.')).toBeInTheDocument();
  });

  it('marks the entry cooked with the chosen rating and lists the event', async () => {
    let cooked = false;
    const { user, calls } = await renderApp('/cook/e1', {
      'GET /plan-entries/e1/cook-view': () =>
        cooked
          ? {
              ...cookView,
              cookEvents: [{ id: 'c1', cookedAt: '2026-10-28T18:00:00.000Z', rating: 4 }],
            }
          : cookView,
      'POST /plan-entries/e1/cook-events': () => {
        cooked = true;
        return { status: 201, body: { id: 'c1', cookedAt: '2026-10-28T18:00:00.000Z', rating: 4 } };
      },
      'GET /statistics': {},
    });

    const rating = await screen.findByRole('group', { name: 'Rating for this cook' });
    await user.click(within(rating).getByRole('button', { name: '4 stars' }));
    await user.click(screen.getByRole('button', { name: 'Mark cooked' }));

    expect(await screen.findByText(/^Cooked \d/)).toBeInTheDocument();
    expect(callsTo(calls, 'POST', '/plan-entries/e1/cook-events')[0].body).toEqual({ rating: 4 });
    await waitFor(() =>
      expect(
        within(screen.getByRole('list', { name: 'Cooked' })).getByRole('button', {
          name: '4 stars',
        }),
      ).toHaveAttribute('aria-pressed', 'true'),
    );
  });
});
