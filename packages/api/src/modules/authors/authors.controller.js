import * as authors from './authors.service.js';

export async function listAuthors(req, res) {
  res.json(await authors.listAuthors(req.user));
}

export async function getAuthor(req, res) {
  res.json(await authors.getAuthor(req.params.authorId, req.user));
}

export async function listFollowing(req, res) {
  res.json(await authors.listFollowing(req.user.id));
}

export async function listNewReleases(req, res) {
  res.json(await authors.listNewReleases(req.user.id));
}

export async function listSuggestions(req, res) {
  res.json(await authors.listSuggestions(req.user.id));
}

export async function followAuthor(req, res) {
  res.status(201).json(await authors.followAuthor(req.user.id, req.params.authorId));
}

export async function unfollowAuthor(req, res) {
  res.json(await authors.unfollowAuthor(req.user.id, req.params.authorId));
}
