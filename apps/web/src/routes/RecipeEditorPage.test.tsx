import { screen, waitFor, within } from '@testing-library/react';
import { callsTo, ingredient, renderApp, type Call, type RenderedApp } from '../test/fake-api';

const garlic = ingredient({
  id: 'ing-garlic',
  name: 'garlic',
  aliases: ['knoblauch'],
  canonicalUnit: 'clove',
});
const onion = ingredient({ id: 'ing-onion', name: 'onion', canonicalUnit: 'piece' });

const catalog = (call: Call) => {
  const query = call.query.get('query')?.toLowerCase() ?? '';
  return [garlic, onion].filter((item) =>
    [item.name, ...item.aliases].some((name) => name.includes(query)),
  );
};

async function fillLine(
  user: RenderedApp['user'],
  {
    amount,
    unit,
    ingredientText,
    option,
  }: { amount: string; unit: string; ingredientText: string; option: RegExp },
) {
  await user.type(screen.getByLabelText('Amount, line 1'), amount);
  await user.type(screen.getByLabelText('Unit, line 1'), unit);
  await user.type(screen.getByRole('combobox', { name: 'Ingredient, line 1' }), ingredientText);
  await user.click(await screen.findByRole('option', { name: option }));
}

describe('recipe editor', () => {
  it('Covers AE1. Flags 50 g of garlic and clears the flag after adding a conversion', async () => {
    const { user, calls } = await renderApp('/recipes/new', {
      'GET /ingredients': catalog,
      'PUT /ingredients/ing-garlic': (call) => ({
        ...garlic,
        ...(call.body as object),
        id: garlic.id,
      }),
    });
    await user.type(await screen.findByLabelText('Title'), 'Garlic soup');
    await fillLine(user, { amount: '50', unit: 'g', ingredientText: 'garl', option: /^garlic/ });

    expect(
      await screen.findByText(/“g” cannot be turned into clove for garlic/),
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Save recipe' })).toBeDisabled();

    await user.click(screen.getByRole('button', { name: 'Add conversion' }));
    await user.type(screen.getByLabelText('1 g = how many clove?'), '0.2');
    await user.click(screen.getByRole('button', { name: 'Save conversion' }));

    await waitFor(() =>
      expect(screen.queryByText(/cannot be turned into/)).not.toBeInTheDocument(),
    );
    expect(callsTo(calls, 'PUT', '/ingredients/ing-garlic')[0].body).toMatchObject({
      conversions: [{ unit: 'g', factor: 0.2 }],
    });
  });

  it('replaces the amount and unit when converting a flagged line', async () => {
    const { user } = await renderApp('/recipes/new', { 'GET /ingredients': catalog });
    await screen.findByLabelText('Title');
    await fillLine(user, { amount: '50', unit: 'g', ingredientText: 'garl', option: /^garlic/ });

    await user.click(await screen.findByRole('button', { name: 'Convert' }));
    await user.type(screen.getByLabelText('Amount in clove'), '10');
    await user.click(screen.getByRole('button', { name: 'Use 10 clove' }));

    expect(screen.getByLabelText('Amount, line 1')).toHaveValue('10');
    expect(screen.getByLabelText('Unit, line 1')).toHaveValue('clove');
    expect(screen.queryByText(/cannot be turned into/)).not.toBeInTheDocument();
  });

  it('flags only the line a 422 names and shows 400 messages on their fields', async () => {
    let answer = 0;
    const { user } = await renderApp('/recipes/new', {
      'GET /ingredients': catalog,
      'POST /recipes': () =>
        ++answer === 1
          ? {
              status: 400,
              body: {
                error: 'validation',
                issues: [{ field: 'lines[0].amount', message: 'must be positive' }],
              },
            }
          : {
              status: 422,
              body: { error: 'unresolved_units', lines: [{ index: 0, unit: 'clove' }] },
            },
    });
    await user.type(await screen.findByLabelText('Title'), 'Soup');
    await fillLine(user, { amount: '2', unit: 'clove', ingredientText: 'garl', option: /^garlic/ });
    await user.type(screen.getByLabelText('Step 1'), 'Cook.');

    await user.click(screen.getByRole('button', { name: 'Save recipe' }));
    expect(await screen.findByText('must be positive')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Save recipe' }));
    const line = (await screen.findByText(/“clove” cannot be turned into clove/)).closest('li');
    expect(line).toContainElement(screen.getByLabelText('Amount, line 1'));
    expect(screen.getByRole('button', { name: 'Save recipe' })).toBeDisabled();
  });

  it('matches an alias and inserts the canonical ingredient', async () => {
    let posted: unknown;
    const { user } = await renderApp('/recipes/new', {
      'GET /ingredients': catalog,
      'POST /recipes': (call) => {
        posted = call.body;
        return { status: 201, body: { id: 'r1' } };
      },
      'GET /recipes/r1': { status: 404, body: { error: 'not_found' } },
    });
    await user.type(await screen.findByLabelText('Title'), 'Soup');
    await user.type(screen.getByLabelText('Amount, line 1'), '2');
    await user.type(screen.getByLabelText('Unit, line 1'), 'clove');
    await user.type(screen.getByRole('combobox', { name: 'Ingredient, line 1' }), 'knob');
    const option = await screen.findByRole('option', { name: /garlic/ });
    expect(option).toHaveTextContent('alias: knoblauch');
    await user.click(option);
    await user.type(screen.getByLabelText('Step 1'), 'Cook.');
    await user.click(screen.getByRole('button', { name: 'Save recipe' }));

    await waitFor(() => expect(posted).toBeDefined());
    expect(posted).toMatchObject({
      lines: [{ ingredientId: 'ing-garlic', amount: 2, unit: 'clove' }],
    });
  });

  it('creates a missing ingredient inline with the line unit as its canonical unit', async () => {
    const { user, calls } = await renderApp('/recipes/new', {
      'GET /ingredients': catalog,
      'POST /ingredients': (call) => ({
        status: 201,
        body: {
          ...ingredient({ id: 'ing-saffron' }),
          ...(call.body as object),
          aliases: [],
          conversions: [],
        },
      }),
    });
    await user.type(await screen.findByLabelText('Unit, line 1'), 'pinch');
    await user.type(screen.getByRole('combobox', { name: 'Ingredient, line 1' }), 'saffron');
    await user.click(await screen.findByRole('option', { name: 'Create “saffron”' }));

    const form = screen.getByRole('group', { name: 'New ingredient' });
    expect(within(form).getByLabelText('Name')).toHaveValue('saffron');
    const unit = within(form).getByLabelText('Canonical unit');
    expect(unit).toHaveValue('pinch');

    await user.clear(unit);
    expect(within(form).getByRole('button', { name: 'Create ingredient' })).toBeDisabled();
    await user.type(unit, 'pinch');
    await user.click(within(form).getByRole('button', { name: 'Create ingredient' }));

    await waitFor(() =>
      expect(screen.getByRole('combobox', { name: 'Ingredient, line 1' })).toHaveValue('saffron'),
    );
    expect(callsTo(calls, 'POST', '/ingredients')[0].body).toMatchObject({
      name: 'saffron',
      canonicalUnit: 'pinch',
    });
  });

  it('can be driven by keyboard alone to pick an alias match', async () => {
    const { user } = await renderApp('/recipes/new', { 'GET /ingredients': catalog });
    const picker = await screen.findByRole('combobox', { name: 'Ingredient, line 1' });
    await user.click(picker);
    await user.keyboard('knob');
    await screen.findByRole('option', { name: /garlic/ });
    await user.keyboard('{ArrowDown}{Enter}');

    expect(picker).toHaveValue('garlic');
    expect(picker).toHaveAttribute('aria-expanded', 'false');
  });

  it('puts the chosen ingredient back when its text is typed over and left without a choice', async () => {
    const { user } = await renderApp('/recipes/new', { 'GET /ingredients': catalog });
    await screen.findByLabelText('Title');
    await fillLine(user, { amount: '2', unit: 'clove', ingredientText: 'garl', option: /^garlic/ });

    const picker = screen.getByRole('combobox', { name: 'Ingredient, line 1' });
    await user.clear(picker);
    await user.type(picker, 'flour');
    await user.tab();

    expect(picker).toHaveValue('garlic');
  });
});
