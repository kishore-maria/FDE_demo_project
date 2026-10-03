import * as authService from './auth.service.js';

export async function register(req, res) {
  res.status(201).json(await authService.register(req.body));
}

export async function login(req, res) {
  res.json(await authService.login(req.body));
}

export async function getProfile(req, res) {
  res.json(await authService.getProfile(req.user.id));
}

export async function updateProfile(req, res) {
  res.json(await authService.updateProfile(req.user.id, req.body));
}
