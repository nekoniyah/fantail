import type { Response } from "express";

/** Error payload: { error: true, message: string } plus the HTTP status code. */
export function sendError(res: Response, status: number, message: string): void {
  res.status(status).json({ error: true, message });
}

/** Success/info payload: { message: string } with an explicit status code. */
export function sendMessage(res: Response, status: number, message: string): void {
  res.status(status).json({ message });
}

/** Data-only payload: the body is the data itself, as the client consumes it. */
export function sendData(res: Response, status: number, data: unknown): void {
  res.status(status).json(data);
}
