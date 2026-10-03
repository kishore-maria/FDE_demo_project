import * as wishlist from './wishlist.service.js';

export async function getWishlist(req, res) {
  res.json(await wishlist.getWishlist(req.user.id));
}

export async function addToWishlist(req, res) {
  res.json(await wishlist.addToWishlist(req.user.id, req.body.bookId));
}

export async function removeFromWishlist(req, res) {
  res.json(await wishlist.removeFromWishlist(req.user.id, req.params.bookId));
}
