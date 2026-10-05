import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, test, vi } from 'vitest';
import { renderAt } from '../test/utils.jsx';
import AuthorCard from './AuthorCard.jsx';

const daniel = {
  id: 'author-daniel-reed',
  name: 'Daniel Reed',
  slug: 'daniel-reed',
  photoUrl: 'https://i.pravatar.cc/150?u=daniel-reed',
  bio: 'Daniel Reed writes about simple living.',
  bookCount: 4,
  topCategory: { id: 'cat-self-help', name: 'Self-help', slug: 'self-help' },
};

describe('AuthorCard', () => {
  test('shows name (linked), book count, top genre and bio', () => {
    renderAt(<AuthorCard author={daniel} />);
    const card = screen.getByRole('article', { name: 'Daniel Reed' });
    expect(screen.getByRole('link', { name: 'Daniel Reed' })).toHaveAttribute('href', '/authors/author-daniel-reed');
    expect(card).toHaveTextContent('4 books · Self-help');
    expect(card).toHaveTextContent('Daniel Reed writes about simple living.');
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });

  test('singular book count and fallback photo', () => {
    const { container } = renderAt(<AuthorCard author={{ ...daniel, bookCount: 1, topCategory: null, photoUrl: null }} />);
    expect(screen.getByRole('article')).toHaveTextContent('1 book');
    expect(screen.getByRole('article')).not.toHaveTextContent('1 books');
    expect(container.querySelector('img')).toHaveAttribute('src', 'https://i.pravatar.cc/150?u=author-daniel-reed');
  });

  test('Follow calls onFollow', async () => {
    const onFollow = vi.fn();
    renderAt(<AuthorCard author={daniel} onFollow={onFollow} />);
    await userEvent.click(screen.getByRole('button', { name: 'Follow' }));
    expect(onFollow).toHaveBeenCalledTimes(1);
  });

  test('Following calls onUnfollow', async () => {
    const onUnfollow = vi.fn();
    renderAt(<AuthorCard author={daniel} isFollowing onUnfollow={onUnfollow} />);
    await userEvent.click(screen.getByRole('button', { name: 'Following' }));
    expect(onUnfollow).toHaveBeenCalledTimes(1);
  });

  test('busy disables the action', () => {
    renderAt(<AuthorCard author={daniel} isFollowing busy onUnfollow={() => {}} />);
    expect(screen.getByRole('button', { name: 'Following' })).toBeDisabled();
  });
});
