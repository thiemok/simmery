import { act, screen, waitFor, within } from '@testing-library/react';
import { callsTo, renderApp, type Call } from '../test/fake-api';

const WEEK = '2026-W44';

const cream = {
  ingredientId: 'ing-cream',
  name: 'cream',
  unit: 'ml',
  total: 350,
  entryCount: 2,
  leftover: 50,
};
const coriander = {
  ingredientId: 'ing-cori',
  name: 'coriander',
  unit: 'g',
  total: 30,
  entryCount: 1,
  leftover: null,
};

function week(
  entries: {
    id: string;
    recipeId: string;
    recipeTitle: string;
    servings: number;
    day: number | null;
  }[],
) {
  return {
    id: 'week-1',
    weekKey: WEEK,
    entries,
    evaluation: { lines: [cream, coriander], overlap: [cream], tagCounts: { vegetarian: 2 } },
  };
}

const twoMeals = week([
  { id: 'e1', recipeId: 'r1', recipeTitle: 'Pasta', servings: 2, day: null },
  { id: 'e2', recipeId: 'r2', recipeTitle: 'Curry', servings: 4, day: 3 },
]);

describe('week view', () => {
  it('Covers AE2, AE3. Shows overlap and leftovers from the API, and no leftover without pack sizes', async () => {
    await renderApp(`/week/${WEEK}`, { [`GET /weeks/${WEEK}`]: twoMeals });

    const overlap = (await screen.findByRole('heading', { name: 'Overlap' })).closest(
      'section',
    ) as HTMLElement;
    expect(within(overlap).getByText(/cream/)).toHaveTextContent('2 meals');
    expect(within(overlap).getByText('350 ml')).toBeInTheDocument();

    const leftovers = screen
      .getByRole('heading', { name: 'Leftovers' })
      .closest('section') as HTMLElement;
    expect(within(leftovers).getByText('≈ 50 ml')).toBeInTheDocument();
    expect(within(leftovers).queryByText(/coriander/)).not.toBeInTheDocument();

    const totals = screen
      .getByRole('heading', { name: 'Everything this week' })
      .closest('section') as HTMLElement;
    expect(within(totals).getByText('coriander')).toBeInTheDocument();
    expect(within(totals).getByText('30 g')).toBeInTheDocument();
  });

  it('saves the whole entry list once after a servings change and renders the returned evaluation', async () => {
    const saved = week([
      { id: 'e1', recipeId: 'r1', recipeTitle: 'Pasta', servings: 3, day: null },
      { id: 'e2', recipeId: 'r2', recipeTitle: 'Curry', servings: 4, day: 3 },
    ]);
    saved.evaluation = { ...saved.evaluation, overlap: [], lines: [coriander] };
    const { user, calls } = await renderApp(`/week/${WEEK}`, {
      [`GET /weeks/${WEEK}`]: twoMeals,
      [`PUT /weeks/${WEEK}/entries`]: saved,
    });

    await user.click(await screen.findByRole('button', { name: 'More servings of Pasta' }));
    await waitFor(() => expect(callsTo(calls, 'PUT', `/weeks/${WEEK}/entries`)).toHaveLength(1), {
      timeout: 2000,
    });
    expect(callsTo(calls, 'PUT', `/weeks/${WEEK}/entries`)[0].body).toEqual({
      entries: [
        { id: 'e1', recipeId: 'r1', servings: 3, day: null },
        { id: 'e2', recipeId: 'r2', servings: 4, day: 3 },
      ],
    });
    expect(
      await screen.findByText('No ingredient is used by more than one meal.'),
    ).toBeInTheDocument();
  });

  it('sends a second save only after the first returns, carrying the new entry’s ID', async () => {
    let release: () => void = () => {};
    const puts: Call[] = [];
    const { user } = await renderApp(`/week/${WEEK}`, {
      [`GET /weeks/${WEEK}`]: week([]),
      'GET /recipes': [{ id: 'r9', title: 'Soup', servings: 2, tags: [] }],
      [`PUT /weeks/${WEEK}/entries`]: async (call) => {
        puts.push(call);
        if (puts.length === 1) {
          await new Promise<void>((resolve) => (release = resolve));
        }
        const { entries } = call.body as { entries: { servings: number }[] };
        return week([
          {
            id: 'saved-1',
            recipeId: 'r9',
            recipeTitle: 'Soup',
            servings: entries[0].servings,
            day: null,
          },
        ]);
      },
    });

    await user.click(await screen.findByRole('button', { name: '+ Add a meal' }));
    await user.click(await screen.findByRole('button', { name: 'Add Soup' }));
    await waitFor(() => expect(puts).toHaveLength(1));
    await user.click(screen.getByRole('button', { name: 'More servings of Soup' }));
    await new Promise((resolve) => setTimeout(resolve, 600));
    expect(puts).toHaveLength(1);

    await act(async () => release());
    await waitFor(() => expect(puts).toHaveLength(2));
    expect(puts[0].body).toEqual({ entries: [{ recipeId: 'r9', servings: 2, day: null }] });
    expect(puts[1].body).toEqual({
      entries: [{ id: 'saved-1', recipeId: 'r9', servings: 3, day: null }],
    });
  });

  it('keeps a cooked entry and explains why when the server refuses to remove it', async () => {
    const { user } = await renderApp(`/week/${WEEK}`, {
      [`GET /weeks/${WEEK}`]: twoMeals,
      [`PUT /weeks/${WEEK}/entries`]: {
        status: 409,
        body: { error: 'conflict', reason: 'entry_cooked' },
      },
    });

    await user.click(await screen.findByRole('button', { name: 'Remove Pasta' }));
    expect(
      await screen.findByText('This meal was already cooked, so it stays in the week.'),
    ).toBeInTheDocument();
    expect(screen.getByText('Pasta')).toBeInTheDocument();
  });

  it('keeps an edit that failed to save and offers a retry', async () => {
    let attempts = 0;
    const { user } = await renderApp(`/week/${WEEK}`, {
      [`GET /weeks/${WEEK}`]: twoMeals,
      [`PUT /weeks/${WEEK}/entries`]: () =>
        ++attempts === 1 ? { status: 500, body: { error: 'internal' } } : twoMeals,
    });

    await user.selectOptions(await screen.findByLabelText('Day for Pasta'), 'Fri');
    await user.click(await screen.findByRole('button', { name: 'Retry' }));
    await waitFor(() => expect(attempts).toBe(2));
    expect(screen.queryByText('Could not save your changes.')).not.toBeInTheDocument();
  });

  it('takes in meals added elsewhere before the next save, so the save does not delete them', async () => {
    const withPhoneMeal = week([
      ...twoMeals.entries,
      { id: 'e3', recipeId: 'r3', recipeTitle: 'Soup', servings: 2, day: null },
    ]);
    let reads = 0;
    const { user, calls, queryClient } = await renderApp(`/week/${WEEK}`, {
      [`GET /weeks/${WEEK}`]: () => (++reads === 1 ? twoMeals : withPhoneMeal),
      [`PUT /weeks/${WEEK}/entries`]: withPhoneMeal,
    });
    await screen.findByText('Pasta');

    await act(() => queryClient.invalidateQueries({ queryKey: ['weeks', WEEK] }));
    expect(await screen.findByText('Soup')).toBeInTheDocument();

    await user.selectOptions(screen.getByLabelText('Day for Pasta'), 'Fri');
    await waitFor(() => expect(callsTo(calls, 'PUT', `/weeks/${WEEK}/entries`)).toHaveLength(1));
    const sent = callsTo(calls, 'PUT', `/weeks/${WEEK}/entries`)[0].body as {
      entries: { id?: string }[];
    };
    expect(sent.entries.map((entry) => entry.id)).toEqual(['e1', 'e2', 'e3']);
  });

  it('still saves a servings change when the page is left before the debounce fires', async () => {
    const { user, calls, router } = await renderApp(`/week/${WEEK}`, {
      [`GET /weeks/${WEEK}`]: twoMeals,
      [`PUT /weeks/${WEEK}/entries`]: twoMeals,
      'GET /recipes': [],
    });
    await user.click(await screen.findByRole('button', { name: 'More servings of Pasta' }));
    await act(() => router.navigate({ to: '/recipes' }));

    await waitFor(() => expect(callsTo(calls, 'PUT', `/weeks/${WEEK}/entries`)).toHaveLength(1));
    expect(callsTo(calls, 'PUT', `/weeks/${WEEK}/entries`)[0].body).toMatchObject({
      entries: [{ id: 'e1', servings: 3 }, { id: 'e2' }],
    });
  });
});
