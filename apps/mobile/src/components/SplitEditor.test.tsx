import { fireEvent, screen } from '@testing-library/react-native';

import { lightTheme } from '@/theme';
import { renderWithTheme } from '@/theme/testUtils';

import { SplitEditor, type SplitEditorPart, type SplitEditorProps } from './SplitEditor';

const CATEGORIES = [
  { value: 'c-groceries', label: 'Groceries', testKey: 'groceries' },
  { value: 'c-gifts', label: 'Gifts', testKey: 'gifts' },
];

const LABELS = {
  part: (n: number) => `Part ${n}`,
  amount: 'Amount',
  category: 'Category',
  chooseCategory: 'Choose a category for this part.',
  remove: (n: number) => `Remove part ${n}`,
  add: 'Add a part',
};

function editor(parts: SplitEditorPart[], overrides: Partial<SplitEditorProps> = {}) {
  const props: SplitEditorProps = {
    parts,
    categories: CATEGORIES,
    currency: 'CHF',
    onChangeAmount: jest.fn(),
    onChangeCategory: jest.fn(),
    onRemove: jest.fn(),
    onAdd: jest.fn(),
    canRemove: false,
    labels: LABELS,
    remaining: 'CHF 84.00 left to assign',
    remainingTone: 'secondary',
    testID: 'split',
    ...overrides,
  };
  return { props, element: <SplitEditor {...props} /> };
}

const EMPTY: SplitEditorPart[] = [
  { key: 'a', category: null, amountText: '' },
  { key: 'b', category: null, amountText: '' },
];

describe('SplitEditor', () => {
  it('shows each part with its categories and amount, and what is left to assign', async () => {
    const { element } = editor(EMPTY);
    await renderWithTheme(element);
    expect(screen.getByRole('header', { name: 'Part 1' })).toBeOnTheScreen();
    expect(screen.getByRole('header', { name: 'Part 2' })).toBeOnTheScreen();
    expect(screen.getByTestId('split-part-0-category-groceries')).toBeOnTheScreen();
    expect(screen.getByTestId('split-part-1-category-gifts')).toBeOnTheScreen();
    expect(screen.getAllByText('Choose a category for this part.')).toHaveLength(2);
    expect(screen.getByTestId('split-remaining')).toHaveTextContent('CHF 84.00 left to assign');
    expect(screen.queryByRole('link', { name: 'Remove part 1' })).toBeNull();
  });

  it('reports typed amounts and chosen categories by part key', async () => {
    const { props, element } = editor(EMPTY);
    await renderWithTheme(element);
    fireEvent.changeText(screen.getByTestId('split-part-1-amount'), '20');
    expect(props.onChangeAmount).toHaveBeenCalledWith('b', '20');
    fireEvent.press(screen.getByTestId('split-part-0-category-gifts'));
    expect(props.onChangeCategory).toHaveBeenCalledWith('a', 'c-gifts');
  });

  it('folds a chosen category into one button that opens the choice again', async () => {
    const { element } = editor([
      { key: 'a', category: 'c-groceries', amountText: '64' },
      { key: 'b', category: null, amountText: '20' },
    ]);
    await renderWithTheme(element);
    expect(screen.queryByTestId('split-part-0-category-gifts')).toBeNull();
    const button = screen.getByRole('button', { name: 'Category, Groceries' });
    fireEvent.press(button);
    expect(screen.getByTestId('split-part-0-category-gifts')).toBeOnTheScreen();
  });

  it('adds and removes parts', async () => {
    const { props, element } = editor([...EMPTY, { key: 'c', category: null, amountText: '' }], {
      canRemove: true,
    });
    await renderWithTheme(element);
    fireEvent.press(screen.getByRole('link', { name: 'Remove part 3' }));
    expect(props.onRemove).toHaveBeenCalledWith('c');
    fireEvent.press(screen.getByTestId('split-add'));
    expect(props.onAdd).toHaveBeenCalledTimes(1);
  });

  it('shows problems per part and for the whole split', async () => {
    const { element } = editor(
      [
        { key: 'a', category: null, amountText: '', categoryError: 'Choose a category.' },
        { key: 'b', category: 'c-gifts', amountText: 'x', amountError: 'Enter an amount.' },
      ],
      {
        remaining: 'CHF 10.00 more than the total',
        remainingTone: 'danger',
        error: 'The parts must add up to exactly CHF 84.00.',
      },
    );
    await renderWithTheme(element);
    expect(screen.getByTestId('split-part-0-category-error')).toHaveTextContent(
      'Choose a category.',
    );
    expect(screen.getByTestId('split-part-1-amount-error')).toHaveTextContent('Enter an amount.');
    expect(screen.getByTestId('split-error')).toHaveTextContent(
      'The parts must add up to exactly CHF 84.00.',
    );
    expect(screen.getByTestId('split-remaining')).toHaveStyle({
      color: lightTheme.colors.statusDanger,
    });
  });

  it('marks a fully assigned split in green', async () => {
    const { element } = editor(EMPTY, { remaining: 'Everything is assigned', remainingTone: 'ok' });
    await renderWithTheme(element);
    expect(screen.getByTestId('split-remaining')).toHaveStyle({
      color: lightTheme.colors.statusOk,
    });
  });
});
