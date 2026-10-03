import * as catalog from './catalog.service.js';

export async function listCategories(req, res) {
  res.json({ items: await catalog.listCategoryTree() });
}

export async function listPublishers(req, res) {
  res.json({ items: await catalog.listPublishers() });
}

export async function getPublisher(req, res) {
  res.json(await catalog.getPublisher(req.params.publisherId));
}

export async function listBooks(req, res) {
  res.json(await catalog.listBooks(req.query));
}
